"""3D versions of the chart visuals, drawn with gl3d. Each returns a 1080x1920 RGB PIL image.

  bars   - bars rise from a floor, values float above, camera glides around
  stat   - big extruded number counts up over a growing coin / cash stack
  donut  - pie: the highlighted slice lifts and slides out
  globe  - spinning globe with glowing location dots (visual type "globe")

Only numbers from the script are shown. `t` = seconds into the scene (growth animations),
`p` = 0..1 through the current shot (camera move), `variant` picks the camera path.
"""
from __future__ import annotations

import math
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw

from . import gl3d
from .gl3d import Engine, Scene, trs


def _c(rgb):
    return tuple(c / 255 for c in rgb[:3])


def look_for(theme: dict, name: str) -> dict:
    """Per-theme lighting so every 3D shot of a theme shares one look."""
    acc, bgt, bgb = _c(theme["accent"]), _c(theme["bg_top"]), _c(theme["bg_bottom"])
    if name == "bold_bright":
        fog = (0.98, 0.42, 0.30)
        return dict(fog=fog, floor=(1.0, 0.55, 0.40), grid=0.0, sky=(0.78, 0.72, 0.7), ground=(0.42, 0.2, 0.18),
                    rim=(1, 0.9, 0.8), key_dir=(-0.4, -1, -0.6), fog_near=20, fog_far=46, floor_radius=16,
                    primary=acc, secondary=(1, 1, 1), text=(1, 1, 1), side=(0.55, 0.12, 0.18), gold=(0.98, 0.66, 0.08))
    if name == "clean_navy":
        return dict(fog=(0.92, 0.94, 0.98), floor=(0.97, 0.98, 1.0), grid=1.0, grid_col=(0.82, 0.86, 0.94),
                    sky=(1, 1, 1), ground=(0.75, 0.8, 0.9), rim=(0.55, 0.7, 1.0), key_dir=(-0.4, -1, -0.5),
                    fog_near=20, fog_far=46, floor_radius=16, primary=acc, secondary=_c(theme["accent2"]),
                    text=_c(theme["text"]), side=(0.55, 0.62, 0.78), gold=(0.95, 0.62, 0.08))
    return dict(fog=tuple(0.5 * (a + b) for a, b in zip(bgt, bgb)), floor=(0.05, 0.10, 0.07), grid=1.0,
                grid_col=tuple(a * 0.35 for a in acc), sky=(0.6, 1.0, 0.75), ground=(0.02, 0.05, 0.03),
                rim=acc, key_dir=(-0.35, -1, -0.6), fog_near=19, fog_far=42, floor_radius=14,
                primary=acc, secondary=_c(theme["accent2"]), text=(0.94, 1, 0.96), side=(0.05, 0.35, 0.18),
                gold=(1.0, 0.7, 0.12))


def ease(p):
    p = min(max(p, 0.0), 1.0)
    return 1 - (1 - p) ** 3


def ease_back(p):
    p = min(max(p, 0.0), 1.0)
    c = 1.70158
    return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2


# ----------------------------------------------------------------- text as 3D
@lru_cache(maxsize=512)
def _text_img(text: str, font_name: str, size: int):
    from .render import font
    f = font(font_name, size)
    w = int(f.getlength(text)) + 16
    a, d = f.getmetrics()
    im = Image.new("RGBA", (max(w, 4), a + d + 16), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((8, 8), text, font=f, fill=(255, 255, 255, 255))
    return im


def text3d(sc: Scene, text, pos, height, color, side, font_name=None, layers=10, depth=0.22,
           ry=0.0, rx=0.0, billboard=False, unlit=True, alpha=1.0, max_w=None):
    """Extruded text: the glyphs stacked back to front, front face bright, sides darker."""
    from .render import BLACK
    if not text:
        return
    e = Engine.get()
    img = _text_img(text, font_name or BLACK, 160)
    tex = e.texture(("txt", text, font_name, 160), img)
    w = height * img.width / img.height
    dist = float(np.linalg.norm(sc.eye - np.asarray(pos, np.float32)))
    vis_w = 2 * dist * math.tan(math.radians(sc.fov) / 2) * gl3d.W3D / gl3d.H3D * 0.84  # stay inside the frame
    max_w = min(max_w or vis_w, vis_w)
    if w > max_w:  # long text shrinks to fit instead of overlapping
        height, w = height * max_w / w, max_w
    if billboard:
        d = sc.eye - np.asarray(pos, np.float32)
        ry = math.atan2(d[0], d[2])
    quad = e.meshes["quad"]
    for k in range(layers, -1, -1):
        z = -depth * k / max(layers, 1)
        off = trs(pos, (1, 1, 1), ry=ry, rx=rx) @ trs((0, 0, z), (w, height, 1))
        col = color if k == 0 else tuple(s * (0.75 + 0.25 * (1 - k / layers)) for s in side)
        sc.add(quad, off, col, tex=tex, unlit=unlit, alpha=alpha if k == 0 else min(1.0, alpha))


def _orbit(p, variant, radius, height, target_y, spread=0.5):
    """Camera paths: each variant is a different slow move so shots never look identical."""
    paths = [(-0.35, 0.35, 1.0, 0.92), (0.45, -0.1, 0.95, 0.85), (-0.1, 0.25, 0.80, 0.80),
             (0.25, -0.35, 1.05, 1.0), (0.0, 0.0, 1.1, 0.78)]
    a0, a1, r0, r1 = paths[variant % len(paths)]
    k = ease(p) * 0.8 + p * 0.2
    ang = (a0 + (a1 - a0) * k) * spread * 2
    r = radius * (r0 + (r1 - r0) * k)
    return (math.sin(ang) * r, height + 0.4 * math.sin(p * math.pi) * (variant % 2), math.cos(ang) * r), \
           (0, target_y, 0)


def _fmt(v, prefix, suffix, decimals):
    from .render import fmt_number
    return f"{prefix}{fmt_number(v, decimals)}{suffix}"


# ----------------------------------------------------------------- bars
def bars(theme, tname, v, t, p, variant):
    L = look_for(theme, tname)
    items = v["items"][:5]
    n = len(items)
    vmax = max(float(i["value"]) for i in items) or 1.0
    span = 2.1
    xs = [(k - (n - 1) / 2) * span for k in range(n)]
    hmax = 3.8
    eye, tgt = _orbit(p, variant, 12.5 + n * 3.8, 3.4, 2.4)
    sc = Scene(L, eye, tgt, fov=36, aperture=0.9)
    box = Engine.get().meshes["box"]
    for k, (it, x) in enumerate(zip(items, xs)):
        g = ease_back((t - 0.15 - 0.22 * k) / 0.9)
        val = float(it["value"])
        h = max(0.04, hmax * val / vmax * g)
        last = k == n - 1
        col = L["primary"] if last else L["secondary"]
        sc.add(box, trs((x, 0, 0), (1.15, h, 1.15)), col, spec=0.55, gloss=60, emissive=0.25 if last else 0.05,
               shadow=(x + 0.35, 0.35, 1.0, 0.9))
        shown = val * min(1.0, ease((t - 0.15 - 0.22 * k) / 0.9))
        dec = None if val.is_integer() else 1
        text3d(sc, _fmt(shown, v.get("prefix", ""), v.get("suffix", ""), dec), (x, h + 0.95, 0.2), 0.66,
               L["text"], L["side"], billboard=True, layers=6, depth=0.12, max_w=span * 0.95)
        lab_w = span * 0.98
        text3d(sc, it["label"].upper(), (x, h + 0.3, 0.2), 0.36, L["text"], L["side"], billboard=True,
               layers=2, depth=0.03, font_name="Inter-Bold.otf", max_w=lab_w)
    if v.get("title"):
        text3d(sc, v["title"].upper()[:28], (0, hmax + 1.7, -0.6), 0.42, L["text"], L["side"], billboard=True,
               layers=4, depth=0.08, font_name="Inter-Bold.otf", max_w=span * n)
    return Image.fromarray(sc.render())


# ----------------------------------------------------------------- coins / cash + big number
def _coin_stacks(sc, L, x0, z0, coins, cols=3, money=True):
    e = Engine.get()
    cyl, box = e.meshes["cyl"], e.meshes["box"]
    per = max(1, math.ceil(coins / cols))
    for c in range(cols):
        cnt = min(per, coins - c * per)
        if cnt <= 0:
            break
        cx = x0 + (c - (cols - 1) / 2) * 1.25
        cz = z0 + (0.35 if c % 2 else -0.2)
        for k in range(cnt):
            y = k * 0.16
            if money and c == cols // 2:  # middle stack is cash bundles
                sc.add(box, trs((cx, y * 1.6, cz), (1.05, 0.22, 0.5), ry=0.08 * math.sin(k * 1.7)),
                       (0.36, 0.72, 0.42), spec=0.15, gloss=12, shadow=(cx + 0.25, cz + 0.2, 0.8, 0.5) if k == 0 else None)
                sc.add(box, trs((cx, y * 1.6 + 0.005, cz), (0.32, 0.225, 0.51), ry=0.08 * math.sin(k * 1.7)),
                       (0.92, 0.95, 0.88), spec=0.1, gloss=8)
            else:
                sc.add(cyl, trs((cx + 0.03 * math.sin(k * 2.1), y, cz + 0.03 * math.cos(k * 1.3)), (0.48, 0.14, 0.48)),
                       L["gold"] if money else L["secondary"], spec=0.45, gloss=70, emissive=0.0,
                       shadow=(cx + 0.2, cz + 0.2, 0.75, 0.6) if k == 0 else None)


def stat(theme, tname, v, t, p, variant):
    L = look_for(theme, tname)
    val = float(v["value"])
    k = ease(t / 1.1)
    prefix, suffix = v.get("prefix", ""), v.get("suffix", "")
    money = prefix == "$" or "dollar" in v.get("label", "").lower()
    eye, tgt = _orbit(p, variant, 18.0, 2.8, 2.6, spread=0.35)
    sc = Scene(L, eye, tgt, fov=36, aperture=0.8, focus=None)
    coins = int(round(36 * min(1.0, ease_back(t / 1.3))))
    _coin_stacks(sc, L, 0, 0.3, coins, cols=3, money=money)
    num = _fmt(val * k, prefix, suffix, v.get("decimals"))
    bob = 0.08 * math.sin(t * 2.2)
    sc.add  # noqa
    text3d(sc, num, (0, 4.6 + bob, 0.4), 1.15, L["primary"], L["side"], billboard=True, layers=12, depth=0.35, max_w=5.6)
    lab = v.get("label", "")
    if lab:
        text3d(sc, lab, (0, 3.8 + bob, 0.4), 0.36, L["text"], L["side"], billboard=True, layers=3,
               depth=0.05, font_name="Inter-SemiBold.otf", max_w=5.6)
    return Image.fromarray(sc.render())


# ----------------------------------------------------------------- pie
def donut(theme, tname, v, t, p, variant):
    L = look_for(theme, tname)
    e = Engine.get()
    pct = float(v["value"])
    eye, tgt = _orbit(p, variant, 19.0, 10.5, 1.2, spread=0.3)
    sc = Scene(L, eye, tgt, fov=38, aperture=0.6)
    grow = ease(t / 1.0)
    a_hi = 2 * math.pi * pct / 100 * grow
    start = -math.pi / 2
    out = ease_back((t - 0.9) / 0.6) * 0.55  # highlighted slice slides out after it fills
    lift = ease((t - 0.9) / 0.6) * 0.35
    if a_hi > 0.01:
        mid = start + a_hi / 2
        hi = e.mesh(("wedge", round(a_hi, 3)), lambda: gl3d.wedge_mesh(start, start + a_hi, 0.0))
        sc.add(hi, trs((math.cos(mid) * out, lift, math.sin(mid) * out), (2.6, 0.7, 2.6)), L["primary"],
               spec=0.6, gloss=50, emissive=0.2, shadow=(math.cos(mid) * out, math.sin(mid) * out, 2.4, 2.4))
    if a_hi < 2 * math.pi - 0.01:
        rest = e.mesh(("wedge", round(a_hi, 3), "rest"), lambda: gl3d.wedge_mesh(start + a_hi, start + 2 * math.pi, 0.0))
        sc.add(rest, trs((0, 0, 0), (2.6, 0.5, 2.6)), L["secondary"] if tname != "dark_neon" else (0.16, 0.26, 0.2),
               spec=0.3, gloss=30, shadow=(0, 0, 2.5, 2.5))
    from .render import fmt_number
    txt = f"{fmt_number(pct * grow, 0 if pct.is_integer() else 1)}%"
    text3d(sc, txt, (0, 3.2 + 0.06 * math.sin(t * 2), 0.6), 1.3, L["primary"] if tname != "bold_bright" else (1, 1, 1),
           L["side"], billboard=True, layers=12, depth=0.32, max_w=5.0)
    if v.get("label"):
        text3d(sc, v["label"], (0, 2.35, 0.6), 0.36, L["text"], L["side"], billboard=True, layers=3,
               depth=0.05, font_name="Inter-SemiBold.otf", max_w=5.6)
    return Image.fromarray(sc.render())


# ----------------------------------------------------------------- globe
def globe(theme, tname, v, t, p, variant):
    """v = {"type": "globe", "points": [{"lat": .., "lon": .., "label": ..}], "label": ".."}"""
    L = look_for(theme, tname)
    e = Engine.get()
    sc = Scene(L, (0, 1.9, 16.5 - 1.0 * p), (0, 1.3, 0), fov=34, aperture=0.4)
    sc.look = {**L, "floor": None}
    spin = -0.6 + 0.5 * t
    tex = e.texture(("earth", tname), _earth_texture(L))
    sc.add(e.meshes["sphere"], trs((0, 1.0, 0), (2.1, 2.1, 2.1), ry=spin), (1, 1, 1), tex=tex, spec=0.4, gloss=30)
    for k, pt in enumerate(v.get("points", [])[:40]):
        lat, lon = math.radians(pt["lat"]), math.radians(pt["lon"])
        th = math.pi - lon  # matches sphere_mesh uv
        d = np.array([math.cos(lat) * math.cos(th), math.sin(lat), math.cos(lat) * math.sin(th)], np.float32)
        rot = trs((0, 0, 0), ry=spin)[:3, :3]
        pos = np.array([0, 1.0, 0], np.float32) + rot @ d * 2.12
        pop = ease_back((t - 0.4 - 0.08 * k) / 0.4)
        if pop > 0:
            sc.add(e.meshes["sphere"], trs(tuple(pos), (0.07 * pop,) * 3), L["primary"], emissive=1.2, unlit=True)
    if v.get("label"):
        text3d(sc, v["label"][:30], (0, 3.75, 0), 0.4, L["text"], L["side"], billboard=True, layers=3, depth=0.05,
               font_name="Inter-Bold.otf")
    return Image.fromarray(sc.render())


@lru_cache(maxsize=4)
def _earth_texture_cached(key):
    return None


def _earth_texture(L):
    """Equirectangular land mask from Natural Earth 110m (public domain), tinted per theme."""
    from pathlib import Path
    import json
    path = Path(__file__).resolve().parent.parent / "assets" / "land_110m.json"
    W, H = 2048, 1024
    sea = tuple(int(255 * c * 0.6) for c in L["side"])
    land = tuple(int(255 * c * 0.85) for c in L["primary"])
    im = Image.new("RGBA", (W, H), (*sea, 255))
    d = ImageDraw.Draw(im)
    if path.exists():
        for poly in json.loads(path.read_text()):
            d.polygon([((lon + 180) / 360 * W, (90 - lat) / 180 * H) for lon, lat in poly], fill=(*land, 255))
    for k in range(1, 12):  # graticule
        y = k * H / 12
        d.line((0, y, W, y), fill=(*land, 60), width=2)
    for k in range(24):
        x = k * W / 24
        d.line((x, 0, x, H), fill=(*land, 60), width=2)
    return im


RENDERERS = {"bars": bars, "stat": stat, "donut": donut, "globe": globe}
