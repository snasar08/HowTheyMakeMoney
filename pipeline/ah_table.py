"""Text table of a script's 3D shots: what each sentence will SHOW, without rendering anything.

  python -m pipeline.ah_table content/scripts/NNN-slug.json [more.json ...]

Nov 18 (usage): reading this table costs ~1k tokens per Short; a contact sheet of stills costs ~3k per image.
Check scenes here first (does every sentence show what it says?), render stills only for what still looks wrong.
Per scene it also checks that the `toon` list has exactly one dict per spoken sentence (the director ignores
a script's own picks when the count is short).
"""
from __future__ import annotations

import io
import json
import sys
import contextlib
from pathlib import Path

from . import toon, tts


def sentences(sc: dict) -> list[str]:
    return [x for x, _q, b in tts.sentences(tts.speakable(sc.get("narration", ""))) if not b] or [sc.get("narration", "")]


def table(path: str) -> str:
    script = json.loads(Path(path).read_text(encoding="utf-8"))
    out = [f"# {script.get('slug') or Path(path).stem}  format={script.get('format')}  hero={json.dumps(script.get('hero') or {})[:160]}"]
    total, given = 0, 0
    for i, sc in enumerate(script.get("scenes", [])):
        if sc.get("visual", {}).get("type") != "lowpoly":
            continue
        ss, tl = sentences(sc), sc.get("toon") or []
        total += len(ss)
        given += len(tl)
        if tl and len(tl) != len(ss):
            out.append(f"!! scene {i}: {len(ss)} sentences but {len(tl)} toon dicts: {ss}")
    if given and given < total:
        out.append(f"!! only {given}/{total} toon dicts: the script's own picks are IGNORED until every sentence has one")
    with contextlib.redirect_stdout(io.StringIO()):
        plan = toon.make_plan(script, None)
        shots = toon.ah_shots(plan)
    for s in shots:
        line = next((c["line"] for c in plan["scenes"] if c["a"] <= s["a"] < c["a"] + c["n"]), "?")
        ch = []
        for c in s.get("chars", []):
            lk = c.get("look", {})
            tag = "HERO" if not ch else ("named" if c.get("who") else "extra")
            ch.append(f"{tag}:{c.get('pose')}/{c.get('expr')}" + (f" skin={lk['skin']}" if lk.get("skin") else ""))
        th = [t.get("name") for t in s.get("things", [])]
        cd = [c.get("text") for c in s.get("cards", [])]
        act = (s.get("act") or {}).get("kind")
        out.append(f"{s['a'] / 30:5.1f}s {s['n'] / 30:3.1f}s | {line[:80]} | {s.get('set')} {s.get('view')}"
                   + (f" act={act}" if act else "") + f" | {', '.join(ch)}" + (f" | things={th}" if th else "")
                   + (f" | cards={cd}" if cd else ""))
    return "\n".join(out)


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(table(p))
        print()
