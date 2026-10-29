"""Stills of the code-rendered character scenes (scene, t, p) for quick framing checks."""
import os, sys
sys.path.insert(0, os.getcwd())
from PIL import Image
from pipeline import scenes_chars as S
from pipeline.gl3d import run3d
from pipeline.themes import get_theme
ims = [run3d(f, get_theme("bold_bright"), "bold_bright", t, t / 3) for f in S.SCENES.values() for t in (0.5, 2.5)]
sheet = Image.new("RGB", (270 * len(ims), 480))
for i, a in enumerate(ims):
    sheet.paste(a.resize((270, 480)), (270 * i, 0))
sheet.save("out/proto/chars.png")
