"""Editorial "company backstory" look (visual type "editorial"; Nov 3, from the Whoop reel Sam liked).

Near-black page, our small HTMM mark + a section tag top-left, one idea per scene in the middle,
captions at the bottom (render.py). Layouts, set per scene in `visual`:
  {"type": "editorial", "layout": "cards", "people": [{"name": "Cristiano Ronaldo",
     "photo": "File:Cristiano Ronaldo 2018.jpg", "role": "investor"}], "label": "ON THE WRISTS THAT MATTER"}
  {"type": "editorial", "layout": "stat", "stat": "$10.1B", "stat_sub": "valuation, March 2026"}
  {"type": "editorial", "layout": "headline", "headline": "100+ investors said no", "accent": "no"}
  {"type": "editorial", "layout": "timeline", "points": [["2012", "founded"], ["2018", "strap goes free"]]}
Script: "tag": "COMPANY BACKSTORY" (default). Photos are free-license Commons files only
(pipeline/photos.py); a missing photo becomes a name tile. Every number is still sourced.
"""
from __future__ import annotations

import math

from PIL import Image, ImageDraw, ImageFilter, ImageOps

from . import fx, photos
from .render import (BLACK, BOLD, H, SAFE_X0, SAFE_X1, W, draw_centered, ease_out, ease_out_back,
                     fit_font, font, wrap)

BG = (11, 11, 14)
INK = (240, 240, 236)
DIM = (150, 150, 158)
ACCENT = (226, 66, 50)
GOLD = (244, 196, 48)
_photo_cache: dict = {}


def _page(tag: str) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # faint vertical gradient so the page isn't flat
    for y in range(0, H, 8):
        k = int(10 * (1 - y / H))
        d.rectangle((0, y, W, y + 8), fill=(BG[0] + k, BG[1] + k, BG[2] + k + 2))
    d.text((SAFE_X0, 215), "H T M M", font=font(BLACK, 34), fill=INK)
    ft = font(BOLD, 24)
    d.text((SAFE_X1 - ft.getlength(tag.upper()), 223), tag.upper(), font=ft, fill=ACCENT)
    d.line((SAFE_X0, 272, SAFE_X1, 272), fill=(40, 40, 46), width=2)
    return img


def _photo(p):
    key = p.get("photo") or p.get("name")
    if key not in _photo_cache:
        img, _ = photos.photo(p["photo"], p.get("name", "")) if p.get("photo") else (None, None)
        _photo_cache[key] = img
    return _photo_cache[key]


def _card(p, w, h):
    """Rounded photo card with the name under it (name tile if no free photo)."""
    card = Image.new("RGBA", (w, h + 110), (0, 0, 0, 0))
    img = _photo(p)
    if img is not None:
        ph = ImageOps.fit(img, (w, h), Image.LANCZOS, centering=(0.5, 0.3))
    else:
        ph = Image.new("RGB", (w, h), (34, 34, 40))
        dd = ImageDraw.Draw(ph)
        initials = "".join(x[0] for x in p.get("name", "?").split()[:2]).upper()
        draw_centered(dd, w / 2, h / 2 - 60, initials, font(BLACK, 110), DIM)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), 26, fill=255)
    card.paste(ph, (0, 0), mask)
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((0, 0, w - 1, h - 1), 26, outline=(70, 70, 78), width=2)
    f = fit_font(p.get("name", ""), BOLD, w, 34, 22)
    draw_centered(d, w / 2, h + 12, p.get("name", ""), f, INK)
    if p.get("role"):
        fr = font(BOLD, 22)
        draw_centered(d, w / 2, h + 12 + f.size + 6, p["role"].upper(), fr, DIM)
    return card


def _cards(img, v, t):
    people = v.get("people", [])[:6]
    if not people:
        return
    d = ImageDraw.Draw(img)
    if v.get("label"):
        d.text((SAFE_X0, 300), v["label"].upper(), font=font(BOLD, 28), fill=ACCENT)
    cols = 3 if len(people) > 4 else 2 if len(people) > 1 else 1
    gap = 28
    cw = int((SAFE_X1 - SAFE_X0 - gap * (cols - 1)) / cols)
    ch = int(cw * 1.25)
    rows = math.ceil(len(people) / cols)
    y0 = 360 if rows > 1 else 480
    for i, p in enumerate(people):
        r, c = divmod(i, cols)
        n_row = min(cols, len(people) - r * cols)  # center a short last row
        x = SAFE_X0 + (SAFE_X1 - SAFE_X0 - (n_row * cw + (n_row - 1) * gap)) / 2 + c * (cw + gap)
        y = y0 + r * (ch + 110)
        k = ease_out_back(min(1.0, max(0.0, (t - 0.12 * i) / 0.35)))  # staggered pop-in
        if k <= 0:
            continue
        cd = _card(p, cw, ch)
        if k < 1:
            cd = cd.resize((max(1, int(cd.width * k)), max(1, int(cd.height * k))), Image.LANCZOS)
        img.paste(cd, (int(x + (cw - cd.width) / 2), int(y + (ch - cd.height * (ch / (ch + 110))) / 2)), cd)


def _stat(img, v, t):
    d = ImageDraw.Draw(img)
    shown = fx.count_up(v["stat"], t / 0.6) if fx.ON else v["stat"]
    f = fit_font(v["stat"], BLACK, SAFE_X1 - SAFE_X0, 230, 90)
    cx = (SAFE_X0 + SAFE_X1) / 2
    draw_centered(d, cx, 620, shown, f, GOLD)
    if v.get("stat_sub") and t > 0.2:
        fs = fit_font(v["stat_sub"].upper(), BOLD, SAFE_X1 - SAFE_X0, 44, 28)
        draw_centered(d, cx, 620 + f.size + 40, v["stat_sub"].upper(), fs, DIM)
    if v.get("label"):
        d.text((SAFE_X0, 300), v["label"].upper(), font=font(BOLD, 28), fill=ACCENT)


def _headline(img, v, t):
    d = ImageDraw.Draw(img)
    text, accent = v.get("headline", ""), (v.get("accent") or "").lower()
    f = font(BLACK, 104)
    lines = wrap(text, f, SAFE_X1 - SAFE_X0)
    y = 820 - len(lines) * (f.size + 18) / 2
    shown = int(len(text.split()) * min(1.0, t / 0.6)) + 1  # words land one by one
    n = 0
    for line in lines:
        x = SAFE_X0
        for w in line.split():
            n += 1
            if n > shown:
                return
            col = ACCENT if accent and w.lower().strip(".,!?") == accent else INK
            d.text((x, y), w, font=f, fill=col)
            x += f.getlength(w + " ")
        y += f.size + 18


def _timeline(img, v, t):
    d = ImageDraw.Draw(img)
    pts = v.get("points", [])[:5]
    x = SAFE_X0 + 40
    y0, step = 420, 190
    d.line((x, y0, x, y0 + step * (len(pts) - 1) * min(1.0, t / 0.8)), fill=(70, 70, 78), width=4)
    for i, (year, what) in enumerate(pts):
        k = min(1.0, max(0.0, (t - 0.18 * i) / 0.3))
        if k <= 0:
            continue
        y = y0 + i * step
        r = 14 * ease_out(k)
        d.ellipse((x - r, y - r, x + r, y + r), fill=GOLD if i == len(pts) - 1 else ACCENT)
        d.text((x + 50, y - 46), str(year), font=font(BLACK, 64), fill=INK)
        d.text((x + 50, y + 26), what, font=font(BOLD, 38), fill=DIM)


LAYOUTS = {"cards": _cards, "stat": _stat, "headline": _headline, "timeline": _timeline}


def _main(script, v, t):
    img = _page(v.get("tag") or script.get("tag") or "Company backstory")
    LAYOUTS.get(v.get("layout", "headline"), _headline)(img, v, t)
    return img


def _zoom(img, k, cx, cy):
    w, h = W / k, H / k
    x0 = min(max(0, cx - w / 2), W - w)
    y0 = min(max(0, cy - h / 2), H - h)
    return img.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + w, y0 + h))


def _people(script):
    seen, out = set(), []
    for sc in script.get("scenes", []):
        for p in sc.get("visual", {}).get("people", []):
            if p.get("photo") and p["name"] not in seen:
                seen.add(p["name"])
                out.append(p)
    return out


def _portrait(p, tb):
    """Full-screen photo with a slow push and a name lower-third."""
    src = _photo(p)
    img = ImageOps.fit(src, (W, H), Image.LANCZOS, centering=(0.5, 0.3))
    img = _zoom(img, 1.04 + 0.05 * min(1.0, tb / 2.0), W / 2, H * 0.4)
    shade = Image.new("L", (1, 256))
    for y in range(256):
        shade.putpixel((0, y), int(230 * max(0.0, (y - 110) / 146) ** 1.4))
    img.paste(Image.new("RGB", (W, H), BG), (0, 0), shade.resize((W, H)))
    d = ImageDraw.Draw(img)
    f = fit_font(p["name"].upper(), BLACK, SAFE_X1 - SAFE_X0, 96 if len(p["name"]) < 18 else 64, 40)
    d.text((SAFE_X0, 1040), p["name"].upper(), font=f, fill=INK)
    if p.get("role"):
        d.text((SAFE_X0, 1040 + f.size + 14), p["role"].upper(), font=font(BOLD, 34), fill=GOLD)
    return img


def _punch(v, tb):
    """The scene's key line as a full-color slam card (gold page, black type)."""
    text = v.get("stat") or v.get("headline") or (v.get("points") or [[""]])[-1][0]
    img = Image.new("RGB", (W, H), GOLD)
    d = ImageDraw.Draw(img)
    f = fit_font(text, BLACK, SAFE_X1 - SAFE_X0, 220, 80)
    lines = wrap(text, f, SAFE_X1 - SAFE_X0)
    y = 760 - len(lines) * (f.size + 10) / 2
    for line in lines:
        draw_centered(d, (SAFE_X0 + SAFE_X1) / 2, y, line, f, BG)
        y += f.size + 10
    return _zoom(img, 1.0 + 0.03 * min(1.0, tb / 1.5), W / 2, H / 2)


def pictures(script):
    """Every usable picture in the Short, each once: the people (scene order), then the script's
    "photos" list. Photo beats take these in order, so no picture is ever shown twice."""
    out, seen = [], set()
    cands = [p for sc in script.get("scenes", []) for p in sc.get("visual", {}).get("people", [])]
    cands += [{"name": p.get("caption", ""), "photo": p["photo"]} for p in script.get("photos", [])]
    for p in cands:
        if p.get("photo") and p["photo"] not in seen and _photo(p) is not None:
            seen.add(p["photo"])
            out.append(p)
    return out


def render(script: dict, v: dict, t: float, b: int = 0, tb: float = 0.0, slot: int | None = None) -> Image.Image:
    """One frame. Every beat (~1.4 s) switches the view (Sam, Nov 3: more switches, more pictures,
    and no picture twice): the layout, a full-screen photo, a punch-in on the layout, the next photo.
    `slot` is this beat's place in the Short's photo order (render.plan); once the pictures run
    out, photo beats become a gold slam card or an off-center framing instead of a repeat."""
    step = b % 4
    if step == 0:
        return _main(script, v, t)
    if step in (1, 3):
        pics = pictures(script)
        if slot is not None and slot < len(pics):
            return _portrait(pics[slot], tb)
        return _punch(v, tb) if step == 1 else _zoom(_main(script, v, t + 5), 1.1, W * 0.42, 700)
    return _zoom(_main(script, v, t + 5), 1.22 + 0.04 * min(1.0, tb / 1.4), W / 2, 640)
