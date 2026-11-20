"""Stills of low-poly scenes: each (set, action, props) in a few shot types, plus timing."""
import os
import sys
import time

sys.path.insert(0, os.getcwd())
from PIL import Image  # noqa: E402

from pipeline import lowpoly  # noqa: E402
from pipeline.gl3d import run3d  # noqa: E402

CASES = [
    {"type": "lowpoly", "set": "warehouse", "action": "carry", "crowd": 200, "props": ["boxes", "truck"]},
    {"type": "lowpoly", "set": "field", "action": "run", "crowd": 300},
    {"type": "lowpoly", "set": "city", "action": "push", "crowd": 120, "props": ["car"]},
    {"type": "lowpoly", "set": "stage", "action": "cheer", "crowd": 250, "props": ["check", "cash"]},
    {"type": "lowpoly", "set": "field", "action": "fall", "crowd": 0, "props": ["rocket"]},
]
ims, t0, n = [], time.time(), 0
for v in CASES:
    for var in (0, 1, 3):
        ims.append(run3d(lowpoly.render, v, 1.4, 0.5, var).resize((216, 384)))
        n += 1
print(f"{(time.time() - t0) / n * 1000:.0f} ms/frame (first frames include setup)")
sheet = Image.new("RGB", (216 * len(ims), 384))
for i, im in enumerate(ims):
    sheet.paste(im, (216 * i, 0))
sheet.save("out/proto/lowpoly.png")
