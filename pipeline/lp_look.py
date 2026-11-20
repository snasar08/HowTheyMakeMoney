"""Quick look at a low-poly Short without voice: one frame per shot, as a contact sheet.

  python -m pipeline.lp_look content/scripts/040-famous-ronaldo.json out.jpg [plan_dir] [beats]

Each scene gets `beats` shots (default 3), picked exactly as the real render picks them. With a
plan_dir it also records those frames for Blender (pipeline/blender_lp.py), so the posted look can
be checked on a handful of frames in minutes instead of a full 50-minute render.
"""
import json
import sys
from pathlib import Path

from PIL import Image

from . import lowpoly
from .gl3d import run3d


def frames(script, beats=3, rec=False):
    from . import lp_hero
    hero = script.get("hero") or lp_hero.auto(script.get("slug", ""))
    out = []
    for si, sc in enumerate(script["scenes"]):
        v = sc["visual"]
        if v.get("type") != "lowpoly":
            continue
        if hero and "hero" not in v:
            v["hero"] = hero
        for b in range(beats):
            stat = bool(v.get("stat")) and b % 2 == 0
            t = b * 1.7 + 0.85
            key = f"{si}_{int(round(t * 30))}"
            out.append((key, run3d(lowpoly.render, v, t, 0.5, b + si * 2, key if rec else None, b, si, stat)))
    return out


def sheet(imgs, cols, w=270):
    h = w * 16 // 9
    rows = (len(imgs) + cols - 1) // cols
    im = Image.new("RGB", (cols * w, rows * h), (0, 0, 0))
    for i, x in enumerate(imgs):
        im.paste(x.resize((w, h), Image.LANCZOS), ((i % cols) * w, (i // cols) * h))
    return im


if __name__ == "__main__":
    path, out = Path(sys.argv[1]), sys.argv[2]
    plan = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "-" else None
    beats = int(sys.argv[4]) if len(sys.argv) > 4 else 3
    fr = frames(json.loads(path.read_text(encoding="utf-8")), beats, bool(plan))
    sheet([f for _, f in fr], beats * 2).save(out, quality=88)
    if plan:
        lowpoly.dump_plan(Path(plan) / f"{path.stem}.json")
    print(f"[lp_look] {len(fr)} frames -> {out}")
