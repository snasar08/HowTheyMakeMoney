"""Every frame of a video at 30 fps -> contact sheets of 100 (10x10, numbered) + an automated scan (Sam's rule).
usage: python -m pipeline.allframes video.mp4 outdir   (then Read every sheet s00.jpg, s01.jpg ... in order)"""
import os, subprocess, sys, glob
import numpy as np
from PIL import Image, ImageDraw

v, out = sys.argv[1], sys.argv[2]
os.makedirs(out + "/f", exist_ok=True)
for f in glob.glob(out + "/f/*.jpg"):
    os.remove(f)
subprocess.run(["ffmpeg", "-v", "error", "-i", v, "-vf", "fps=30,scale=108:192", "-q:v", "4", out + "/f/%05d.jpg"], check=True)
fs = sorted(glob.glob(out + "/f/*.jpg"))
prev, notes = None, []
for i, f in enumerate(fs):
    a = np.asarray(Image.open(f).convert("L"), dtype=np.float32)
    if a.std() < 6:
        notes.append(f"{i}: flat/blank")
    if prev is not None and np.abs(a - prev).mean() > 60:
        notes.append(f"{i}: flash/jump")
    prev = a
for s in range(0, len(fs), 100):
    sh = Image.new("RGB", (1080, 1920), (0, 0, 0))
    for j, f in enumerate(fs[s:s + 100]):
        im = Image.open(f).convert("RGB")
        ImageDraw.Draw(im).text((2, 2), str(s + j), fill=(255, 255, 0))
        sh.paste(im, (j % 10 * 108, j // 10 * 192))
    sh.save(f"{out}/s{s // 100:02d}.jpg", quality=80)
print(len(fs), "frames,", (len(fs) + 99) // 100, "sheets;", "scan:", notes[:40] or "clean")
