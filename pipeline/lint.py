"""Script linter: the checks a human editor would do before a Short is rendered.

  python -m pipeline.lint                 # all ready scripts
  python -m pipeline.lint content/scripts/031-x.json ...

Errors (exit 1) block a script; warnings are advice. The weekly writer runs this before pushing.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# kid-safe + monetization-safe: no hype, no money promises, no shock words, no engagement bait
# image prompts must never ask for a real person's likeness or brand marks
LIKENESS = re.compile(r"(look(s|ing)? like|resembl\w*|lookalike|look-alike|portrait of|face of|in the style of|"
                      r"jersey|team uniform|logo of)", re.I)
FAKE_QUOTE = re.compile(r"(said|says|told|tweeted|thinks)[^.]*[\"“]", re.I)
BANNED = ["guaranteed", "get rich", "invest now", "you should buy", "buy the stock", "financial advice",
          "click the link", "link in bio", "smash that like", "follow for more", "insane", "crazy",
          "kill", "dead", "die ", "hate", "stupid", "scam", "damn", "hell", "sexy", "drunk", "gambl"]
LOWPOLY_LIVE = True  # Sam approved the low-poly look (Oct 29 2026)
WPS = 2.55        # spoken words per second at KOKORO_SPEED 1.25 (measured: 009 ≈ 34 s for 88 words)
LEN_MIN, LEN_MAX = 25, 45
TITLE_MAX = 50    # Shorts titles get cut on mobile beyond ~50 chars
PEOPLE = re.compile(r"\b(person|people|man|woman|couple|family|shopper|worker|cashier|driver|owner|"
                    r"customer|customers|crowd|fan|player|gamer|chef|pilot|student|friend|parent|teenager|kid|traveler|barista|technician|engineer|runner|clerk|singer|crew|rider|employee|adult)s?\b", re.I)


def lint(s: dict) -> tuple[list[str], list[str]]:
    err, warn = [], []
    scenes = s.get("scenes", [])
    narr = " ".join(sc.get("narration", "") for sc in scenes)
    spoken = narr + " " + s.get("loop", "") + " Comment which brand we should do next, and subscribe."
    first = scenes[0]["narration"] if scenes else ""
    if s.get("format") not in ("how", "whatif", "careers", "famous"):
        err.append(f"format must be how / whatif / careers / famous (got {s.get('format')!r})")
    if s.get("visual_style", "charts3d") not in ("charts3d", "lowpoly"):
        err.append(f"visual_style must be charts3d or lowpoly (got {s.get('visual_style')!r})")
    if s.get("visual_style") == "lowpoly" and s.get("status") == "ready" and not LOWPOLY_LIVE:
        err.append("low-poly style isn't approved for the daily pipeline yet (Sam)")
    if not 5 <= len(scenes) <= 6:
        err.append(f"{len(scenes)} scenes (want 5–6)")
    if "?" not in first.split(".")[0] + first[:140]:
        err.append("first line is not a question hook")
    ov = (scenes[0].get("visual", {}) if scenes else {})
    if ov.get("type") == "image" and not (ov.get("overlay") or ov.get("overlay_sub")):
        warn.append("opening image has no on-screen hook text")
    if len(s.get("title", "")) > TITLE_MAX:
        warn.append(f"title {len(s['title'])} chars (> {TITLE_MAX}, gets cut on phones)")
    if not re.search(r"\d|\?", s.get("title", "")):
        warn.append("title has no number or question")
    if not s.get("loop"):
        err.append("no loop line")
    if FAKE_QUOTE.search(narr) and not s.get("quotes_sourced"):
        err.append("narration quotes a person — only real, sourced quotes (set quotes_sourced: true + source)")
    low = " " + spoken.lower() + " " + s.get("title", "").lower()
    for b in BANNED:
        if b in low:
            err.append(f"banned phrase: '{b.strip()}'")
    est = len(spoken.split()) / WPS + 0.4 * len(scenes)
    if not LEN_MIN <= est <= LEN_MAX:
        warn.append(f"estimated length {est:.0f}s (sweet spot {LEN_MIN}–{LEN_MAX}s)")
    for sc in scenes:
        for sent in re.split(r"(?<=[.!?])\s+", sc.get("narration", "")):
            if len(sent.split()) > 18:
                warn.append(f"long sentence ({len(sent.split())} words) — add a comma or split it: {sent[:50]}...")
        if len(sc.get("narration", "").split()) > 34:
            warn.append(f"long scene ({len(sc['narration'].split())} words): split it for pacing")
    if len(s.get("sources", [])) < 1 or any(not str(x.get("url", "")).startswith("http") for x in s.get("sources", [])):
        err.append("needs at least one source with a URL")
    if s.get("visual_style") == "lowpoly" and s.get("format") not in ("whatif", "famous"):
        warn.append("low-poly is meant for whatif / famous Shorts")
    if s.get("status") == "ready" and s.get("visual_style") != "lowpoly":
        imgs = s.get("images", {})
        missing = [k for k in ("hook", "mid", "broll1", "broll2") if not (imgs.get(k) or {}).get("url")]
        if missing:
            err.append(f"ready but images missing: {', '.join(missing)}")
        prompts = [(imgs.get(k) or {}).get("prompt", "") for k in imgs]
        if sum(bool(PEOPLE.search(p)) and "3d" in p.lower() for p in prompts) < 2:
            warn.append("fewer than 2 images with 3D-rendered characters (STYLE.md: 3D characters)")
        for p in prompts:
            if p and LIKENESS.search(p):
                err.append(f"image prompt asks for a likeness/brand mark: '{LIKENESS.search(p).group(0)}'")
        for p in prompts:
            if p and "no logos" not in p.lower():
                warn.append("image prompt missing 'no logos'")
                break
    if "score" in s and float(s["score"]) < 85 and s.get("status") == "ready" and int(s.get("id", "0")) > 29:
        warn.append(f"score {s['score']} < 85")
    return err, warn


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv] or sorted((ROOT / "content" / "scripts").glob("*.json"))
    bad = 0
    for p in paths:
        s = json.loads(p.read_text(encoding="utf-8"))
        if not argv and s.get("status") not in ("ready", "draft", "needs_fix"):
            continue
        err, warn = lint(s)
        bad += bool(err)
        for e in err:
            print(f"::error title={p.stem} lint::{e}")
        for w in warn:
            print(f"::warning title={p.stem} lint::{w}")
        if not err and not warn:
            print(f"[lint] {p.stem}: OK")
    print(f"[lint] {len(paths)} checked, {bad} with errors")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
