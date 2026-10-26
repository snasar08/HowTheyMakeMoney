"""Quick visual check without voice: one still per shot, side by side.

    python -m pipeline.preview content/scripts/001-costco.json preview.png
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

from .render import Renderer, Scene, make_beats, time_words


def preview(script_path: str, out_png: str, width: int = 270):
    script = json.loads(Path(script_path).read_text())
    r = Renderer(script)
    scenes = []
    for raw in script["scenes"]:
        sc = Scene(raw["narration"], raw["visual"])
        sc.duration = max(1.5, len(raw["narration"].split()) / 3.1)
        sc.words = time_words(raw["narration"], sc.duration)
        sc.beats = make_beats(sc.words, sc.duration)
        scenes.append(sc)
    r.plan(scenes)
    shots = [(i, b + 0.6) for i, sc in enumerate(scenes) for b in sc.beats]
    h = int(width * 1920 / 1080)
    cols = 8
    rows = (len(shots) + cols - 1) // cols
    sheet = Image.new("RGB", (width * cols, h * rows), (20, 20, 20))
    for n, (i, t) in enumerate(shots):
        frame = r.still(i, t, scenes)
        sheet.paste(frame.resize((width, h), Image.LANCZOS), ((n % cols) * width, (n // cols) * h))
    sheet.save(out_png)
    return out_png, len(shots)


if __name__ == "__main__":
    print(preview(sys.argv[1], sys.argv[2]))
