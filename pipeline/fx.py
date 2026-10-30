"""Visual polish layered over every frame (Oct 30, Sam: "visual features that make it look better").

  count_up()   - "$226,600" ticks up from 0 the first time a stat shows
  burst()      - coin/sparkle burst when a huge number (billion+) lands
  hook()       - big title punch-in over the first 0.7 s
  zoom_blur()  - quick zoom-blur into every new scene (low-poly had hard cuts)
  drift()      - slow push-in so 2D frames are never perfectly still
  grade()      - light contrast, vignette and film grain
  icon_for() / draw_icon() - small hand-drawn icons (coin, truck, plane, house, box) above
                 matching caption words; drawn with Pillow, so no real logos

FX=off turns all of it off.
"""
from __future__ import annotations

import math
import os
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ON = os.environ.get("FX", "on") == "on"
W, H = 1080, 1920


def ease_out(p: float) -> float:
    p = min(1.0, max(0.0, p))
    return 1 - (1 - p) ** 3


# ---- count-up
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def count_up(text: str, p: float) -> str:
    """Replace the first number in text with its value * ease_out(p), keeping commas/decimals."""
    m = _NUM.search(text)
    if not m or p >= 1:
        return text
    raw = m.group()
    dec = len(raw.split(".")[1]) if "." in raw else 0
    v = float(raw.replace(",", "")) * ease_out(p)
    s = f"{v:,.{dec}f}" if "," in raw or v >= 10000 else f"{v:.{dec}f}"
    return text[:m.start()] + s + text[m.end():]


def is_huge(text: str) -> bool:
    t = text.lower()
    if re.search(r"\b(billion|trillion)\b|\d\s*[bt]\b", t):
        return True
    m = _NUM.search(t)
    return bool(m) and float(m.group().replace(",", "")) >= 1e9


# ---- burst
def burst(frame: Image.Image, cx: float, cy: float, t: float, seed: int = 0, dur: float = 0.7):
    """Coins and sparkles flying out from (cx, cy); t = seconds since the number landed."""
    if not ON or not (0 <= t < dur):
        return
    rng = np.random.default_rng(seed)
    d = ImageDraw.Draw(frame, "RGBA")
    p = t / dur
    fade = int(255 * (1 - p) ** 1.5)
    for k in range(22):
        ang = rng.uniform(0, 2 * math.pi)
        speed = rng.uniform(380, 820)
        r = speed * ease_out(p)
        x = cx + math.cos(ang) * r
        y = cy + math.sin(ang) * r * 0.8 + 600 * p * p  # a little gravity
        if k % 3 == 0:  # sparkle
            s = 18 * (1 - p) + 6
            d.polygon([(x, y - s), (x + s * 0.3, y), (x, y + s), (x - s * 0.3, y)], fill=(255, 255, 255, fade))
            d.polygon([(x - s, y), (x, y + s * 0.3), (x + s, y), (x, y - s * 0.3)], fill=(255, 255, 255, fade))
        else:  # coin, squashed to look like it's spinning
            s = 26
            sq = abs(math.cos(ang * 3 + p * 12)) * 0.8 + 0.2
            d.ellipse((x - s * sq, y - s, x + s * sq, y + s), fill=(255, 200, 40, fade),
                      outline=(150, 100, 0, fade), width=4)


# ---- hook title
def hook(frame: Image.Image, title: str, gt: float, font_fn, black: str, dur: float = 0.75):
    if not ON or not title or gt >= dur:
        return
    txt = title.upper()
    pop = 1.35 - 0.35 * ease_out(gt / 0.25)
    alpha = 1.0 if gt < dur - 0.15 else (dur - gt) / 0.15
    for size in (92, 80, 70, 60):  # biggest size that fits in 3 lines
        f = font_fn(black, size)
        lines, cur = [], ""
        for w in txt.split():
            test = (cur + " " + w).strip()
            if f.getlength(test) > 940 and cur:
                lines.append(cur)
                cur = w
            else:
                cur = test
        lines.append(cur)
        if len(lines) <= 3:
            break
    lay = Image.new("RGBA", (W, 560), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    y = 40
    for ln in lines[:4]:
        tw = f.getlength(ln)
        d.text(((W - tw) / 2, y), ln, font=f, fill=(255, 255, 255), stroke_width=12, stroke_fill=(0, 0, 0))
        y += int(f.size * 1.08)
    if pop != 1:
        nw, nh = int(W * pop), int(560 * pop)
        lay = lay.resize((nw, nh), Image.BILINEAR).crop(((nw - W) // 2, (nh - 560) // 2,
                                                          (nw - W) // 2 + W, (nh - 560) // 2 + 560))
    if alpha < 1:
        lay.putalpha(lay.getchannel("A").point(lambda a: int(a * alpha)))
    frame.paste(lay, (0, 150), lay)


# ---- camera
def zoom(frame: Image.Image, z: float) -> Image.Image:
    cw, ch = W / z, H / z
    return frame.resize((W, H), Image.BILINEAR, box=((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2))


def drift(frame: Image.Image, tb: float) -> Image.Image:
    return zoom(frame, 1 + 0.012 * min(tb, 2.5)) if ON else frame


def zoom_blur(frame: Image.Image, t: float, dur: float = 0.14) -> Image.Image:
    """New scene rushes in: blurred, zoomed copies settle into the sharp frame."""
    if not ON or t >= dur:
        return frame
    p = ease_out(t / dur)
    out = zoom(frame, 1.15 - 0.15 * p)
    ghost = zoom(frame, 1.3 - 0.3 * p).filter(ImageFilter.BoxBlur(6))
    return Image.blend(out, ghost, 0.5 * (1 - p))


# ---- grade
_vig = None
_grain = None


def grade(frame: Image.Image, n: int) -> Image.Image:
    global _vig, _grain
    if not ON:
        return frame
    if _vig is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.75)) ** 2)
        _vig = (1 - 0.28 * np.clip(r - 0.35, 0, 1) ** 1.6)[..., None].astype(np.float32)
        rng = np.random.default_rng(7)
        _grain = [rng.normal(0, 4.0, (H, W, 1)).astype(np.float32) for _ in range(6)]
    a = np.asarray(frame, np.float32)
    a = ((a - 128) * 1.06 + 128) * _vig + _grain[n % 6]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


# ---- icons
ICONS = {
    "coin": "money dollar dollars cash pay paid pays salary salaries rich cents cent fortune earn earns "
            "earned profit price cost costs wealth worth tip tips",
    "truck": "truck trucks deliver delivers delivered delivery deliveries driver drivers shipping",
    "plane": "plane planes pilot pilots flight flights fly flying airline airlines airport jet",
    "house": "house houses home homes rent mortgage apartment",
    "box": "package packages box boxes parcel parcels order orders amazon",
}
_LOOKUP = {w: k for k, ws in ICONS.items() for w in ws.split()}


def icon_for(word: str) -> str | None:
    return _LOOKUP.get(re.sub(r"[^a-z]", "", word.lower()))


def draw_icon(frame: Image.Image, kind: str, cx: float, cy: float, p: float):
    """p: 0..1 pop-in progress."""
    if not ON:
        return
    s = 70 * (0.6 + 0.4 * min(1.0, p * 1.4 if p < 0.7 else 1.0))
    d = ImageDraw.Draw(frame)
    K, O = (0, 0, 0), 7

    def P(pts):
        return [(cx + x * s, cy + y * s) for x, y in pts]

    if kind == "coin":
        d.ellipse((cx - s, cy - s, cx + s, cy + s), fill=(255, 200, 40), outline=K, width=O)
        d.ellipse((cx - s * 0.72, cy - s * 0.72, cx + s * 0.72, cy + s * 0.72), outline=(190, 130, 0), width=5)
        from PIL import ImageFont  # noqa: F401  (default font is enough for a "$")
        d.line(P([(0, -0.5), (0, 0.5)]), fill=K, width=8)
        d.arc((cx - s * 0.35, cy - s * 0.45, cx + s * 0.35, cy + s * 0.02), 90, 330, fill=K, width=8)
        d.arc((cx - s * 0.35, cy - s * 0.02, cx + s * 0.35, cy + s * 0.45), 270, 150, fill=K, width=8)
    elif kind == "truck":
        d.rectangle(P([(-1, -0.6), (0.25, 0.4)])[0] + P([(0.25, 0.4)])[0], fill=(240, 240, 245), outline=K, width=O)
        d.polygon(P([(0.25, -0.25), (0.7, -0.25), (1, 0.1), (1, 0.4), (0.25, 0.4)]), fill=(60, 140, 255), outline=K)
        d.line(P([(0.25, -0.25), (0.7, -0.25), (1, 0.1), (1, 0.4), (0.25, 0.4), (0.25, -0.25)]), fill=K, width=O)
        for x in (-0.6, 0.65):
            d.ellipse(P([(x - 0.22, 0.25)])[0] + P([(x + 0.22, 0.69)])[0], fill=(40, 40, 40), outline=K, width=5)
    elif kind == "plane":
        body = P([(-1, 0.05), (0.75, -0.12), (1, 0), (0.75, 0.12), (-1, 0.15)])
        d.polygon(P([(-0.1, 0), (0.25, 0), (-0.35, 0.85), (-0.55, 0.85)]), fill=(200, 210, 225), outline=K)
        d.polygon(P([(-0.1, 0), (0.25, 0), (-0.35, -0.75), (-0.55, -0.75)]), fill=(200, 210, 225), outline=K)
        d.polygon(P([(-0.95, 0.05), (-0.75, 0.05), (-0.95, -0.45), (-1.05, -0.45)]), fill=(60, 140, 255), outline=K)
        d.polygon(body, fill=(245, 245, 250), outline=K)
        d.line(body + [body[0]], fill=K, width=6)
    elif kind == "house":
        d.rectangle(P([(-0.7, -0.1)])[0] + P([(0.7, 0.85)])[0], fill=(250, 235, 210), outline=K, width=O)
        d.polygon(P([(-0.95, -0.05), (0, -0.9), (0.95, -0.05)]), fill=(230, 70, 60), outline=K)
        d.line(P([(-0.95, -0.05), (0, -0.9), (0.95, -0.05), (-0.95, -0.05)]), fill=K, width=O)
        d.rectangle(P([(-0.18, 0.3)])[0] + P([(0.18, 0.85)])[0], fill=(120, 70, 30), outline=K, width=5)
    elif kind == "box":
        d.polygon(P([(-0.8, -0.35), (0, -0.75), (0.8, -0.35), (0, 0.05)]), fill=(225, 175, 110), outline=K)
        d.polygon(P([(-0.8, -0.35), (0, 0.05), (0, 0.85), (-0.8, 0.45)]), fill=(200, 145, 80), outline=K)
        d.polygon(P([(0.8, -0.35), (0, 0.05), (0, 0.85), (0.8, 0.45)]), fill=(180, 125, 65), outline=K)
        for poly in ([(-0.8, -0.35), (0, -0.75), (0.8, -0.35), (0, 0.05), (-0.8, -0.35), (-0.8, 0.45),
                      (0, 0.85), (0.8, 0.45), (0.8, -0.35)], [(0, 0.05), (0, 0.85)]):
            d.line(P(poly), fill=K, width=6)
