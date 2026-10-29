"""Stills of every 3D scene type with guide lines: tag area (y<300) and caption zone (y>1230)."""
import json, os, sys
sys.path.insert(0, os.getcwd())
from PIL import Image, ImageDraw
from pipeline import scene3d
from pipeline.render import ZONE_TOP
from pipeline.themes import get_theme
jobs = []
for sid in ("001-costco", "002-mcdonalds"):
    s = json.load(open(f"content/scripts/{sid}.json", encoding="utf-8"))
    jobs += [(s["theme"], sc["visual"]) for sc in s["scenes"] if sc["visual"]["type"] in ("bars", "stat", "donut")]
jobs.append(("clean_navy", {"type": "bars", "items": [{"label": "A", "value": 3}, {"label": "B", "value": 5}, {"label": "C", "value": 2}, {"label": "Longer label here", "value": 9}], "prefix": "$", "suffix": "B"}))
jobs.append(("dark_neon", {"type": "globe", "points": [{"lat": 40.7, "lon": -74}, {"lat": 51.5, "lon": -0.1}], "label": "Stores worldwide"}))
ims = []
for th, v in jobs:
    for var in (0, 3):
        im = scene3d.RENDERERS[v["type"]](get_theme(th), th, v, 3.0, 1.0, var)
        d = ImageDraw.Draw(im)
        d.line((0, 300, 1080, 300), fill=(0, 0, 255), width=6)
        d.line((0, ZONE_TOP, 1080, ZONE_TOP), fill=(255, 0, 0), width=6)
        ims.append(im.resize((180, 320)))
sheet = Image.new("RGB", (180 * len(ims), 320))
for i, im in enumerate(ims):
    sheet.paste(im, (180 * i, 0))
sheet.save("out/proto/frames.png")
