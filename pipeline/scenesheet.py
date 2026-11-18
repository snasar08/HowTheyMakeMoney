"""Every SCENE of a video on one or two sheets: enough to see what is broken (Sam, Nov 18: "every scene should be
checked, not frame by frame, but enough to check what's broken and what isn't"). The routine/nightly default;
`pipeline.allframes` (every frame) is now only for a range this flags, or when Sam asks.

  python -m pipeline.scenesheet video.mp4 outdir      -> outdir/scenes0.jpg (+ scenes1.jpg), then Read them

Per shot (cut = big picture change): 3 tiles, start / middle / end, labelled "#shot frame". Plus an automated scan of
EVERY frame for what tiles can miss: blank frames, flashes, frozen picture > 2 s, a shot shorter than 0.4 s or longer
than 4 s, and a sudden jump INSIDE a shot (a thing teleporting). For a flagged range, look closer with
`python -m pipeline.allframes` or a few stills at those frame numbers.
"""
from __future__ import annotations

import glob
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

CUT, TW, TH, PER_ROW, ROWS = 28.0, 120, 213, 5, 7   # 5 shots x 3 tiles = 15 tiles (1800 px) per row, 7 rows per sheet


def frames(video: str, out: str) -> list[str]:
    os.makedirs(out + "/sf", exist_ok=True)
    for f in glob.glob(out + "/sf/*.jpg"):
        os.remove(f)
    subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", "fps=30,scale=180:320", "-q:v", "4",
                    out + "/sf/%05d.jpg"], check=True)
    return sorted(glob.glob(out + "/sf/*.jpg"))


def main(video: str, out: str) -> None:
    fs = frames(video, out)
    g = [np.asarray(Image.open(f).convert("L").resize((90, 160)), dtype=np.float32) for f in fs]
    d = [0.0] + [float(np.abs(g[i] - g[i - 1]).mean()) for i in range(1, len(g))]
    cuts = [0] + [i for i in range(1, len(g)) if d[i] > CUT] + [len(g)]
    shots = [(a, b) for a, b in zip(cuts, cuts[1:]) if b > a]
    notes = []
    still = 0
    for i, a in enumerate(g):
        if a.std() < 6:
            notes.append(f"{i}: blank")
        still = still + 1 if d[i] < 0.15 else 0
        if still == 60:
            notes.append(f"{i - 59}-: frozen 2 s+")
    for k, (a, b) in enumerate(shots):
        n = b - a
        if n < 12 and a and b < len(g):
            notes.append(f"shot {k} @{a}: only {n} frames (flash cut?)")
        if n > 120:
            notes.append(f"shot {k} @{a}: {n / 30:.1f} s long (same picture too long?)")
        inner = d[a + 1:b]
        if len(inner) > 6:
            base = float(np.median(inner)) + 1.0
            for j, v in enumerate(inner):
                if v > max(9.0, base * 6) and v <= CUT:
                    notes.append(f"shot {k} @{a + 1 + j}: jump inside shot ({v:.0f}) - something teleports?")
    tiles = []
    for k, (a, b) in enumerate(shots):
        for f in (min(a + 2, b - 1), (a + b) // 2, max(b - 3, a)):
            im = Image.open(fs[f]).convert("RGB").resize((TW, TH))
            ImageDraw.Draw(im).text((3, 3), f"#{k} {f}", fill=(255, 255, 0))
            tiles.append(im)
    per = PER_ROW * 3 * ROWS
    for s in range(0, len(tiles), per):
        chunk = tiles[s:s + per]
        rows = (len(chunk) + PER_ROW * 3 - 1) // (PER_ROW * 3)
        sh = Image.new("RGB", (TW * PER_ROW * 3 + 4 * (PER_ROW - 1), TH * rows), (0, 0, 0))
        for j, im in enumerate(chunk):
            c = j % (PER_ROW * 3)
            sh.paste(im, (c * TW + 4 * (c // 3), j // (PER_ROW * 3) * TH))
        sh.save(f"{out}/scenes{s // per}.jpg", quality=82)
    print(f"{len(fs)} frames, {len(shots)} shots, {(len(tiles) + per - 1) // per} sheet(s); scan: {notes[:40] or 'clean'}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
