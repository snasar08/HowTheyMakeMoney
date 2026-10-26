"""Quick visual check without voice: one still per scene, side by side.

    python -m pipeline.preview content/scripts/001-costco.json preview.png
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

from .render import Renderer, Scene, time_words


def preview(script_path: str, out_png: str, width: int = 360):
    script = json.loads(Path(script_path).read_text())
    r = Renderer(script)
    scenes = []
    for raw in script["scenes"]:
        sc = Scene(raw["narration"], raw["visual"])
        sc.duration = max(1.5, len(raw["narration"].split()) / 2.6)
        sc.words = time_words(raw["narration"], sc.duration)
        scenes.append(sc)
    h = int(width * 1920 / 1080)
    sheet = Image.new("RGB", (width * len(scenes), h))
    for i, sc in enumerate(scenes):
        frame = r.still(i, min(sc.duration * 0.6, 2.6), scenes)
        sheet.paste(frame.resize((width, h), Image.LANCZOS), (i * width, 0))
    sheet.save(out_png)
    return out_png


if __name__ == "__main__":
    print(preview(sys.argv[1], sys.argv[2]))
