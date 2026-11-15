"""Toon look (Nov 15, Sam: "these videos look infinitely better than ours ... it should look close to the repo"):
flat cartoon people in an ink-outlined, painted 3D world, rendered with three.js inside Remotion (toon/, built on
the MIT-licensed source of mromidev/claude-animated-shorts). This module turns one of OUR scripts into the plan that
renderer reads, and names the rendered frames like the Blender plates so render.py picks them up (LP_PLATES).

  python -m pipeline.toon plan <script.json> <out_plan.json> [recorded_lp_plan.json]
  python -m pipeline.toon plates <plan.json> <frames_dir> <plates_dir>     # element-00042.jpeg -> <slug>/<scene>_<frame>.jpg

Without a recorded plan the scene lengths are estimated from the words (for look stills only).
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

from . import lp_hero

FPS = 30
SKIN = {"light": "#f5c9a0", "tan": "#d9a577", "brown": "#a8744a", "dark": "#6b4630"}


def _hex(c, default):
    c = str(c or default)
    c = SKIN.get(c, c)
    return c if c.startswith("#") else "#" + c


def outfit(hero: dict | None, slug: str = "") -> dict:
    """Our hero fields -> the reference character model (jacket / pants / boots / skin / hat / hair / moustache)."""
    s = lp_hero.spec(hero) if hero else lp_hero.spec(lp_hero.auto(slug))
    o = {"jacket": _hex(s.get("shirt"), "e63946"), "pants": _hex(s.get("pants"), "263247"),
         "boots": _hex(s.get("shoes"), "f4f4f4"), "skin": _hex(s.get("skin"), "light")}
    extras = s.get("extras") or []
    if "cap" in extras:
        o.update(hat="cap", cap=_hex(s.get("shirt"), "e63946"))
    elif s.get("hair") in ("bald",):
        o["hat"] = None
    else:
        o.update(hat="hair", hair=_hex(s.get("hair_color"), "3a2a1c"))
    if s.get("beard") in ("full", "goatee", "mustache"):
        o["moustache"] = _hex(s.get("beard_color") or s.get("hair_color"), "3a2a1c")
    if s.get("outfit") == "dress":
        o["dress"] = o["jacket"]
    return o


def lights(n: int) -> list[str]:
    """The reference's light arc: bright while the story sets up, golden at the turn, night-blue for the payoff."""
    if n <= 2:
        return ["day"] * n
    out = []
    for i in range(n):
        p = i / (n - 1)
        out.append("day" if p < 0.45 else "golden" if p < 0.7 else "night")
    return out


# Scene library (Nov 15, Sam: "make scenes based on what we are posting ... the script goes with the background").
# A scene's `visual.beat` wins; otherwise the line's words pick one, never the same beat twice in a row.
BEATS = {
    "drive": r"\b(drive|drives|driver|drivers|driving|ride|rides|trip|trips|car|cars|taxi|uber|lyft|deliver\w*|road|commute)\b",
    "clock": r"\b(years?|minutes?|hours?|seconds?|days?|weeks?|months?|forever|time|nonstop|decades?|centur\w+)\b",
    "money": r"(\$|\b(dollars?|paid|pays?|earn\w*|money|cash|revenue|profit\w*|salary|rich|fortune|net worth|cents?)\b)",
    "phone": r"\b(app|apps|phone|tap|taps|order\w*|download\w*|online|scroll\w*|swipe\w*|stream\w*)\b",
    "queue": r"\b(people|customers?|riders?|users?|fans|everyone|everybody|line|crowd|members|players)\b",
}
PRIORITY = ["drive", "money", "clock", "phone", "queue"]


def beats_for(lines: list[str], given: list[str | None]) -> list[str]:
    out, prev = [], None
    for text, g in zip(lines, given):
        if g:
            out.append(g); prev = g; continue
        t = text.lower()
        score = {b: len(re.findall(rx, t)) for b, rx in BEATS.items()}
        ranked = sorted((b for b in PRIORITY if score[b]), key=lambda b: (-score[b], PRIORITY.index(b)))
        pick = next((b for b in ranked if b != prev), "walk")
        out.append(pick); prev = pick
    return out


def make_plan(script: dict, recorded: dict | None = None) -> dict:
    scenes = [(i, sc) for i, sc in enumerate(script["scenes"]) if sc.get("visual", {}).get("type") == "lowpoly"]
    ranges = {}
    if recorded:
        for key in recorded["frames"]:
            si, fr = (int(x) for x in key.split("_"))
            lo, hi = ranges.get(si, (fr, fr))
            ranges[si] = (min(lo, fr), max(hi, fr))
    lt, out, a = lights(len(scenes)), [], 0
    bt = beats_for([sc.get("narration", "") for _, sc in scenes], [sc["visual"].get("beat") for _, sc in scenes])
    for k, (i, sc) in enumerate(scenes):
        v = sc["visual"]
        if recorded:
            if i not in ranges:
                continue
            lo, hi = ranges[i]
            lo, hi = max(0, lo - 2), hi + 2          # render.py may ask one frame off either end
        else:
            lo, hi = 0, int((len(sc.get("narration", "").split()) / 2.6 + 0.6) * FPS)
        n = hi - lo + 1
        out.append({"si": i, "a": a, "n": n, "frLo": lo, "light": lt[k], "set": v.get("set", "city"),
                    "action": v.get("action", "idle"), "crowd": int(v.get("crowd", 0) or 0), "props": v.get("props") or [],
                    "beat": bt[k]})
        a += n
    slug = f"{script.get('id', '')}-{script.get('slug', '')}"
    return {"slug": slug, "fps": FPS, "total": a, "scenes": out, "hero": outfit(script.get("hero"), script.get("slug", "")),
            "seed": int(re.sub(r"\D", "", str(script.get("id", "1"))) or 1)}


def plates(plan: dict, frames_dir: Path, plates_dir: Path) -> int:
    """Shard folders from toon/scripts/frames.mjs (<frames_dir>/<shard>/ with range.json + the JPEGs in frame order)
    -> <plates_dir>/<slug>/<scene>_<frame>.jpg, the names render.py looks for (LP_PLATES)."""
    out = plates_dir / plan["slug"]
    out.mkdir(parents=True, exist_ok=True)
    files = {}
    for rj in frames_dir.rglob("range.json"):
        r = json.loads(rj.read_text())
        imgs = sorted(rj.parent.glob("*.jp*g"), key=lambda q: int(re.findall(r"\d+", q.stem)[-1]))
        for k, q in enumerate(imgs):
            files[r["start"] + k] = q
    n = 0
    for sc in plan["scenes"]:
        for j in range(sc["n"]):
            f = files.get(sc["a"] + j)
            if f:
                shutil.copyfile(f, out / f"{sc['si']}_{sc['frLo'] + j}.jpg")
                n += 1
    return n


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "plan":
        script = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        rec = json.loads(Path(sys.argv[4]).read_text(encoding="utf-8")) if len(sys.argv) > 4 else None
        plan = make_plan(script, rec)
        Path(sys.argv[3]).write_text(json.dumps({"plan": plan}), encoding="utf-8")
        print(f"[toon] plan {plan['slug']}: {len(plan['scenes'])} scenes, {plan['total']} frames, lights {[s['light'] for s in plan['scenes']]}")
    elif cmd == "plates":
        plan = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))["plan"]
        print(f"[toon] {plates(plan, Path(sys.argv[3]), Path(sys.argv[4]))}/{plan['total']} plates")
