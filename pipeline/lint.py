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
LIKENESS = re.compile(r"(?<!not )(?<!no )\b(look(s|ing)? like|resembl\w*|lookalike|look-alike|portrait of|face of|in the style of|"
                      r"jersey|team uniform|logo of)\b", re.I)
FAKE_QUOTE = re.compile(r"\b(said|says|told|tweeted|thinks)\b[^.]*[\"“]", re.I)
BANNED = ["guaranteed", "get rich", "invest now", "you should buy", "buy the stock", "financial advice",
          "click the link", "link in bio", "smash that like", "follow for more", "insane", "crazy",
          "kill", "dead", "die ", "hate", "stupid", "scam", "damn", "hell", "sexy", "drunk", "gambl"]
LOWPOLY_LIVE = True  # Sam approved the low-poly look (Oct 29 2026)
WPS = 2.55        # spoken words per second at KOKORO_SPEED 1.25 (measured: 009 ≈ 34 s for 88 words)
LEN_MIN, LEN_MAX = 20, 55  # Oct 31: Sam's liked reels run 45-69 s; story/what-if Shorts may run longer
LEN_STD = 30      # Nov 11: Shorts under 30 s got a median 26 views at 48 h vs 3 for 30-38 s; only real stories may run longer
TITLE_MAX = 50    # Shorts titles get cut on mobile beyond ~50 chars
PEOPLE = re.compile(r"\b(person|people|man|woman|couple|family|shopper|worker|cashier|driver|owner|"
                    r"customer|customers|crowd|fan|player|gamer|chef|pilot|student|friend|parent|teenager|kid|traveler|barista|technician|engineer|runner|clerk|singer|crew|rider|employee|adult)s?\b", re.I)


POV_THINGS = ("bathtub", "lightbulb", "house", "coin", "cup", "phone", "truck", "ticket")
POV_OPS = ("", "+", "−", "×", "÷", "=")


def lint_pov(s: dict) -> list[str]:
    """pov format (Nov 23): top-level "pov" line plus optional per-sentence math / units / journey."""
    err = []
    pov = s.get("pov")
    if s.get("format") == "pov":
        if not isinstance(pov, str) or not pov.strip():
            err.append('pov format needs a top-level "pov": "POV: you ..."')
    if pov is not None:
        if not isinstance(pov, str) or not pov.startswith("POV: you "):
            err.append(f'"pov" must start with "POV: you " (got {pov!r})')
        elif len(pov) > 40:
            err.append(f'"pov" is {len(pov)} chars (max 40)')
    for i, sc in enumerate(s.get("scenes", [])):
        for j, t in enumerate(sc.get("toon") or []):
            if not isinstance(t, dict):
                continue
            w = f"scene {i + 1} sentence {j + 1}"
            m = t.get("math")
            if m is not None:
                if not isinstance(m, list):
                    err.append(f"{w}: math must be a list")
                else:
                    for k, it in enumerate(m):
                        if not isinstance(it, dict) or it.get("op", "") not in POV_OPS:
                            err.append(f"{w}: math[{k}] op must be one of '', +, −, ×, ÷, = (got {it.get('op') if isinstance(it, dict) else it!r})")
                            continue
                        if not isinstance(it.get("value"), str) or not it["value"] or len(it["value"]) > 14:
                            err.append(f"{w}: math[{k}] value must be a non-empty string of 14 chars or fewer")
                        lab = it.get("label", "")
                        if not isinstance(lab, str) or len(lab) > 22:
                            err.append(f"{w}: math[{k}] label must be a string of 22 chars or fewer")
                        if "result" in it and not isinstance(it["result"], bool):
                            err.append(f"{w}: math[{k}] result must be true/false")
            u = t.get("units")
            if u is not None:
                if not isinstance(u, dict) or u.get("thing") not in POV_THINGS:
                    err.append(f"{w}: units.thing must be one of {' / '.join(POV_THINGS)}")
                else:
                    c = u.get("count")
                    if not isinstance(c, int) or isinstance(c, bool) or not 1 <= c <= 20:
                        err.append(f"{w}: units.count must be an integer 1-20 (got {c!r})")
                    if "fill" in u and not isinstance(u["fill"], bool):
                        err.append(f"{w}: units.fill must be true/false")
                    lab = u.get("label")
                    if lab is not None and (not isinstance(lab, str) or not lab.strip() or len(lab) > 24):
                        err.append(f"{w}: units.label must be a non-empty string of 24 chars or fewer (exact words from the narration)")
                    elif isinstance(lab, str):
                        nums = re.findall(r"\d[\d,]*(?:\.\d+)?", lab)
                        spoken = " ".join(x.get("narration", "") for x in s.get("scenes", [])).replace(",", "")
                        for n in nums:
                            if n.replace(",", "") not in spoken:
                                err.append(f'{w}: units.label number "{n}" is not in the narration (never invent numbers)')
            if "journey" in t and not isinstance(t["journey"], str):
                err.append(f"{w}: journey must be a string")
            if "react" in t:
                from .toon_director import POV_EXPRS, POV_POSES
                r = t["react"]
                if not isinstance(r, list) or not r or not all(isinstance(x, list) and len(x) == 2 and x[0] in POV_POSES and x[1] in POV_EXPRS for x in r):
                    err.append(f"{w}: react must be a list of [pose, face] pairs (poses {'/'.join(POV_POSES)}; faces {'/'.join(POV_EXPRS)})")
    return err


def lint(s: dict) -> tuple[list[str], list[str]]:
    err, warn = [], []
    scenes = s.get("scenes", [])
    narr = re.sub(r"(?<![A-Za-z])B:\s*", "", " ".join(sc.get("narration", "") for sc in scenes))
    spoken = narr + " " + s.get("loop", "") + " Comment which brand we should do next, and subscribe."
    first = scenes[0]["narration"] if scenes else ""
    if s.get("format") not in ("how", "whatif", "careers", "famous", "story", "pov"):
        err.append(f"format must be how / whatif / careers / famous / story / pov (got {s.get('format')!r})")
    err += lint_pov(s)
    if s.get("visual_style", "charts3d") not in ("charts3d", "lowpoly", "editorial"):
        err.append(f"visual_style must be charts3d, lowpoly or editorial (got {s.get('visual_style')!r})")
    if s.get("visual_style") == "lowpoly" and s.get("status") == "ready" and not LOWPOLY_LIVE:
        err.append("low-poly style isn't approved for the daily pipeline yet (Sam)")
    story = s.get("format") == "story"   # Nov 15: "You're X..." stories, one beat per sentence, up to ~65 s
    if not (5 <= len(scenes) <= (9 if story else 6)):
        err.append(f"{len(scenes)} scenes (want 5–{9 if story else 6})")
    # Nov 11: the opening is the surprising number or fact (question openings were the weakest group
    # and the biggest drop comes right after the opening line); a question is allowed, not required
    first_sent = re.split(r"(?<=[.!?])\s+", first.strip())[0]
    if not first.strip():
        err.append("no opening line")
    elif len(first_sent.split()) > 14:
        warn.append(f"opening sentence is {len(first_sent.split())} words (12 or fewer lands before the 4 s drop)")
    if first.strip() and not re.search(r"\d", first) and "?" in first_sent:
        warn.append("opening is a bare question: lead with the surprising number or fact instead")
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
    if not LEN_MIN <= est <= (70 if story else LEN_MAX):
        warn.append(f"estimated length {est:.0f}s (sweet spot {LEN_MIN}–{LEN_MAX}s)")
    elif est > LEN_STD and s.get("visual_style", "charts3d") != "editorial" and s.get("format") != "famous":
        warn.append(f"estimated length {est:.0f}s: standard Shorts do best at 22–28 s (cut filler, not facts)")
    for sc in scenes:
        for sent in re.split(r"(?<=[.!?])\s+", sc.get("narration", "")):
            if len(sent.split()) > 18:
                warn.append(f"long sentence ({len(sent.split())} words) — add a comma or split it: {sent[:50]}...")
        if len(sc.get("narration", "").split()) > 34:
            warn.append(f"long scene ({len(sc['narration'].split())} words): split it for pacing")
    if len(s.get("sources", [])) < 1 or any(not str(x.get("url", "")).startswith("http") for x in s.get("sources", [])):
        err.append("needs at least one source with a URL")
    if s.get("visual_style") == "editorial":
        pics = {p.get("photo") for sc in scenes for p in sc.get("visual", {}).get("people", []) if p.get("photo")}
        pics |= {p.get("photo") for p in s.get("photos", []) if p.get("photo")}
        need = min(10, int(est / 1.4 / 2))  # photo beats past the pool become slam cards, never repeats
        if len(pics) < need:
            warn.append(f"only {len(pics)} photos for ~{need} photo beats (add to `photos`; no repeats)")
    if s.get("visual_style") == "lowpoly" and s.get("format") not in ("whatif", "famous", "story"):
        warn.append("low-poly is meant for whatif / famous Shorts")
    if s.get("status") == "ready" and s.get("visual_style") not in ("lowpoly", "editorial"):
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
    if any(sc.get("visual", {}).get("type") == "image" for sc in s.get("scenes", [])):
        spoken = sum(len(sc.get("narration", "").split()) for sc in s["scenes"])
        need = int(spoken / 2.6 / 3)  # about one new picture every 3 s; word cards fill the rest
        if len(s.get("images", {})) < need:
            warn.append(f"only {len(s.get('images', {}))} images for ~{need} needed (no picture twice in a Short)")
    fc = s.get("first_comment")
    if fc is not None:   # Nov 22, Sam: the channel's own comment under every Short (pipeline/first_comment.py)
        if not isinstance(fc, str) or not fc.strip():
            err.append("first_comment is empty")
        elif len(fc) > 120:
            err.append(f"first_comment is {len(fc)} characters (max 120)")
        elif re.search(r"https?://|www\.|@|#", fc):
            err.append("first_comment has a link, @ or # (not allowed)")
        elif "?" not in fc:
            warn.append("first_comment should ask viewers something (end with a question)")
    elif s.get("status") == "ready":
        warn.append("no first_comment (the channel's own comment when it posts; see WRITER_GUIDE)")
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
