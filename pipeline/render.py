"""Render one script JSON into a vertical 1080x1920 Short (MP4).

Every frame is drawn with Pillow and piped to ffmpeg. Scene types:
  image  - Higgsfield image with slow zoom + big overlay text
  stat   - big animated count-up number
  bars   - animated horizontal bar comparison
  donut  - animated percentage ring
  text   - big closing statement
Captions (word-highlighted) run over every scene.
"""
from __future__ import annotations

import bisect
import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from . import audio_check, clarity_check, fx, music, tts
from .themes import get_theme

W, H = 1080, 1920
FPS = 30
ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "assets" / "fonts"
CACHE = Path(os.environ.get("HTMM_CACHE", ROOT / ".cache"))
SAFE_X0, SAFE_X1 = 70, 950          # keep clear of Shorts' right-side buttons
CAPTION_Y = 1330                     # above the Shorts title/channel overlay
ZONE_TOP = CAPTION_Y - 100           # caption dead zone: charts/figures stay above this line
SCENE_GAP = 0.06                     # seconds of silence between scenes
END_HOLD = 0.7
BEAT_TARGET = float(os.environ.get("BEAT_TARGET", "1.4"))  # seconds per shot
BEAT_MAX = 2.0  # Sam: something new on screen at least every 2 s
# Spoken + on-screen comment/subscribe ask at the END of the last scene (Sam: the mid-video
# like/subscribe ask broke the flow). Then the script's "loop" line, which leads back into the
# hook so the Short replays seamlessly. Each on-screen piece pops in on its own word. A script
# can replace the line with "cta"; CTA_LINE="" turns it off. Keep it kid-safe.
CTA_LINE = os.environ.get("CTA_LINE", "Comment which brand we should do next, and subscribe.")
CTA_QUESTION = "Which brand should we do next?"
CTA_Y = 430
PROGRESS_H = 9
# 3D chart scenes (pipeline/scene3d.py). Falls back to the 2D drawings if moderngl / GL is missing.
RENDER_3D = os.environ.get("RENDER_3D", "on") == "on"
TRANSITION_3D = os.environ.get("TRANSITION_3D", "on") == "on"
PARALLAX = os.environ.get("PARALLAX", "on") == "on"  # depth-map parallax on the photos (pipeline/depth.py)
_3d_ok = None


def three_d_ok() -> bool:
    global _3d_ok
    if _3d_ok is None:
        _3d_ok = False
        if RENDER_3D:
            try:
                from .gl3d import Engine, run3d
                print(f"[render] 3D on: {run3d(lambda: Engine.get().renderer)}")
                _3d_ok = True
            except Exception as exc:  # noqa: BLE001 — never lose a night over 3D
                print(f"::warning::[render] 3D unavailable ({exc!r}); using 2D charts")
    return _3d_ok                       # px, progress bar at the top edge
CTA_PAUSE = 0.15                     # short beat before the CTA (longer sounded awkward)

_font_cache: dict = {}


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    key = (name, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(str(FONT_DIR / name), size)
    return _font_cache[key]


BLACK = "InterDisplay-Black.otf"
XBOLD = "InterDisplay-ExtraBold.otf"
BOLD = "Inter-Bold.otf"
SEMI = "Inter-SemiBold.otf"


# ---------------------------------------------------------------- helpers

def ease_out(p: float) -> float:
    p = min(max(p, 0.0), 1.0)
    return 1 - (1 - p) ** 3


def ease_out_back(p: float) -> float:
    p = min(max(p, 0.0), 1.0)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2


def fit_font(text: str, name: str, max_w: int, start: int, min_size: int = 40):
    size = start
    while size > min_size:
        f = font(name, size)
        if f.getlength(text) <= max_w:
            return f
        size -= 4
    return font(name, min_size)


def wrap(text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if f.getlength(trial) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def gradient(top, bottom) -> Image.Image:
    t = np.linspace(0, 1, H)[:, None, None]
    a = np.array(top[:3], np.float32)[None, None, :]
    b = np.array(bottom[:3], np.float32)[None, None, :]
    arr = (a * (1 - t) + b * t).repeat(W, axis=1)
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def fmt_number(v: float, decimals: int | None) -> str:
    if decimals is None:
        decimals = 0 if float(v).is_integer() else 1
    s = f"{v:,.{decimals}f}"
    return s


def draw_centered(draw, cx, y, text, f, fill, stroke=0, stroke_fill=None):
    w = f.getlength(text)
    draw.text((cx - w / 2, y), text, font=f, fill=fill,
              stroke_width=stroke, stroke_fill=stroke_fill)


# ---------------------------------------------------------------- images

def fetch_image(url: str | None) -> Image.Image | None:
    if not url:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / ("img-" + hashlib.sha1(url.encode()).hexdigest()[:16] + ".png")
    if not path.exists():
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "htmm-render/1.0"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    path.write_bytes(r.read())
                break
            except Exception as exc:  # noqa: BLE001
                print(f"[render] image download failed ({attempt + 1}/3): {exc}")
                time.sleep(2 * (attempt + 1))
        else:
            return None
    try:
        return Image.open(path).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        print(f"[render] image unreadable: {exc}")
        return None


def cover(img: Image.Image, w: int, h: int) -> Image.Image:
    scale = max(w / img.width, h / img.height)
    nw, nh = math.ceil(img.width * scale), math.ceil(img.height * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    x0, y0 = (nw - w) // 2, (nh - h) // 2
    return img.crop((x0, y0, x0 + w, y0 + h))


def shade_overlay(tint) -> Image.Image:
    """Dark gradient so overlay text (top) and captions (bottom) stay readable."""
    y = np.linspace(0, 1, H)
    alpha = np.clip(np.maximum(0.62 - y * 1.5, 0) + np.maximum((y - 0.45) * 1.25, 0), 0, 0.82)
    a = (alpha * 255).astype(np.uint8)[:, None].repeat(W, axis=1)
    rgb = np.zeros((H, W, 3), np.uint8)
    rgb[:] = np.array(tint, np.uint8)
    return Image.fromarray(np.dstack([rgb, a]), "RGBA")


# ---------------------------------------------------------------- captions

@dataclass
class Word:
    text: str
    start: float
    end: float


def time_words(narration: str, dur: float, lead: float = 0.08) -> list[Word]:
    """Spread words across the clip by length (good enough for captions)."""
    words = narration.split()
    if not words:
        return []
    weights = np.array([len(re.sub(r"\W", "", w)) + 2.5 + (3 if re.search(r"[.,!?;:]$", w) else 0)
                        for w in words], float)
    usable = max(dur - lead - 0.1, 0.5)
    edges = lead + np.concatenate([[0], np.cumsum(weights)]) / weights.sum() * usable
    return [Word(w, float(edges[i]), float(edges[i + 1])) for i, w in enumerate(words)]


def chunk_words(words: list[Word], max_words: int = 3) -> list[list[Word]]:
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= max_words or re.search(r"[.,!?;:]$", w.text):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


class CaptionRenderer:
    def __init__(self, theme):
        self.theme = theme
        self.cache: dict = {}

    def render(self, chunk: list[Word], hi: int) -> Image.Image:
        key = (" ".join(w.text for w in chunk), hi)
        if key in self.cache:
            return self.cache[key]
        texts = [re.sub(r"[^\w$%'.,\-]", "", w.text).upper().rstrip(".,") or w.text.upper() for w in chunk]
        # numbers always pop (highlight color, 18% bigger); the spoken word gets a small punch too
        scale = [1.18 if re.search(r"\d", t) else (1.08 if i == hi else 1.0) for i, t in enumerate(texts)]
        size = 82

        def fonts(sz):
            return [font(XBOLD, int(sz * k)) for k in scale]
        fs = fonts(size)
        space = font(XBOLD, size).getlength(" ")
        total = sum(f.getlength(t) for f, t in zip(fs, texts)) + space * (len(texts) - 1)
        while total > (SAFE_X1 - SAFE_X0) and size > 48:
            size -= 4
            fs = fonts(size)
            space = font(XBOLD, size).getlength(" ")
            total = sum(f.getlength(t) for f, t in zip(fs, texts)) + space * (len(texts) - 1)
        tall = max(f.size for f in fs)
        img = Image.new("RGBA", (W, tall + 40), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        x = (SAFE_X0 + SAFE_X1 - total) / 2  # centered in the safe area, clear of the like/share column
        for i, (t, f) in enumerate(zip(texts, fs)):
            num = scale[i] > 1.1
            fill = self.theme["caption_hi"] if (i == hi or num) else self.theme["caption_fill"]
            d.text((x, 14 + (tall - f.size) * 0.75), t, font=f, fill=fill, stroke_width=8 if not num else 10,
                   stroke_fill=self.theme["caption_stroke"])
            x += f.getlength(t) + space
        self.cache[key] = img
        return img


# ---------------------------------------------------------------- scenes

def align_words(narration: str, timings, dur: float) -> list[Word]:
    """Map TTS word timestamps onto the script's words (keeps punctuation for captions)."""
    words = narration.split()
    if not timings:
        return time_words(narration, dur)
    norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())  # noqa: E731
    toks = [(norm(t), s, e) for t, s, e in timings if norm(t)]
    out, j = [], 0
    for w in words:
        target = norm(w)
        if not target:
            continue
        if j >= len(toks):
            break
        buf, start, end = "", toks[j][1], toks[j][2]
        k = j
        while k < len(toks) and len(buf) < len(target):
            buf += toks[k][0]
            end = toks[k][2]
            k += 1
        if not buf.startswith(target[: max(1, min(len(target), 3))]):
            return time_words(narration, dur)  # text and speech diverged; use estimate
        out.append(Word(w, start, end))
        j = k
    if len(out) < len(words) * 0.8:
        return time_words(narration, dur)
    return out


def make_beats(words: list[Word], dur: float) -> list[float]:
    """Shot change points inside a scene, on word boundaries, every ~2 s."""
    beats, last = [0.0], 0.0
    for w in words:
        el = w.end - last
        punct = re.search(r"[.,!?;:]$", w.text)
        if (el >= BEAT_TARGET and punct) or el >= BEAT_MAX:
            if dur - w.end > 0.6:
                beats.append(w.end)
                last = w.end
    return beats


# (center x, center y, zoom start, zoom end) — zoom is relative to the full image
VARIANTS = [(0.5, 0.5, 1.0, 1.12), (0.4, 0.42, 1.45, 1.33), (0.6, 0.6, 1.28, 1.45),
            (0.5, 0.33, 1.22, 1.36), (0.44, 0.63, 1.5, 1.38), (0.56, 0.46, 1.12, 1.3)]


@dataclass
class Scene:
    narration: str
    visual: dict
    audio: np.ndarray = field(default=None)
    duration: float = 0.0
    words: list = field(default_factory=list)
    beats: list = field(default_factory=lambda: [0.0])
    shots: list = field(default_factory=list)


class Renderer:
    def __init__(self, script: dict, load_images: bool = True):
        self.s = script
        self.theme = get_theme(script.get("theme", "dark_neon"))
        self.captions = CaptionRenderer(self.theme)
        imgs = script.get("images", {}) if load_images else {}
        self.images = {k: fetch_image((v or {}).get("url")) for k, v in imgs.items()}
        self.images = {k: v for k, v in self.images.items() if v is not None}
        # Nov 9 (Sam): chart-style Shorts mix free-license Wikimedia Commons photos (script "photos":
        # [{photo, caption}], credited in the description by publish.py) in with the Higgsfield images,
        # so more shots are real pictures instead of word cards.
        if load_images and script.get("visual_style", "charts3d") not in ("editorial", "lowpoly"):
            from . import photos
            for i, ph in enumerate(script.get("photos", [])):
                img, _ = photos.photo(ph["photo"], ph.get("caption", ""))
                if img is not None:
                    self.images[f"brollp{i}"] = img
        self.bg = gradient(self.theme["bg_top"], self.theme["bg_bottom"])
        # Blender frames (nightly, Nov 3): LP_PLATES/<slug>/<scene>_<frame>.jpg from 20 machines.
        # Used only if every frame of the Short's plan arrived; else the GL renderer, as before.
        self.plates = None
        pd = os.environ.get("LP_PLATES")
        slug = f"{script.get('id', '')}-{script.get('slug', '')}"
        if pd and (Path(pd) / f"{slug}.json").exists():
            keys = list(json.loads((Path(pd) / f"{slug}.json").read_text())["frames"].keys())
            missing = [k for k in keys if not (Path(pd) / slug / f"{k}.jpg").exists()]
            if keys and len(missing) <= len(keys) // 100:  # neighbors cover a stray frame or two
                self.plates = Path(pd) / slug
                print(f"[render] Blender frames: {len(keys) - len(missing)}/{len(keys)}")
            else:
                have = sorted(p.name for p in (Path(pd) / slug).glob("*.jpg"))[:3] if (Path(pd) / slug).exists() else []
                print(f"::warning::[render] Blender frames incomplete for {slug} ({len(missing)}/{len(keys)} missing, "
                      f"e.g. {missing[:3]}; have {have}; dirs {sorted(x.name for x in Path(pd).iterdir())[:5]}); using the GL look")
        self.lp_record = bool(os.environ.get("LP_RECORD"))
        # one hero per Short (Sam, Nov 9): the script's "hero" look rides into every low-poly scene,
        # so the figure is the same recognisable person from the first frame to the last
        for sc_ in script.get("scenes", []):
            v_ = sc_.get("visual", {})
            if v_.get("type") == "lowpoly" and script.get("hero") and "hero" not in v_:
                v_["hero"] = script["hero"]
        hook = self.images.get("hook")
        if hook is not None:
            ghost = cover(hook, W, H).filter(ImageFilter.GaussianBlur(28))
            self.bg = Image.blend(self.bg, ghost, 0.16 if script.get("theme") != "clean_navy" else 0.08)
        self._draw_tag(self.bg)
        self.shade = shade_overlay(self.theme["image_tint"])
        self.dim = Image.new("RGBA", (W, H), (0, 0, 0, 120))
        self._base: dict = {}
        self._depth: dict = {}
        self._pool = [k for k in self.images if k.startswith("broll")] + \
                     [k for k in ("mid", "hook") if k in self.images]
        self._pool_i = 0
        self._last_key = None

    def _draw_tag(self, img: Image.Image):
        d = ImageDraw.Draw(img, "RGBA")
        f = font(BOLD, 30)
        label = "HOW THEY MAKE MONEY"
        w = f.getlength(label)
        d.rounded_rectangle((SAFE_X0, 222, SAFE_X0 + w + 44, 274), 26,
                            fill=(*self.theme["accent"][:3], 235))
        d.text((SAFE_X0 + 22, 229), label, font=f, fill=self.theme.get("tag_text", (10, 10, 10)))

    # ---- shot planning
    def _next_broll(self, avoid=None) -> str | None:
        if not self._pool:
            return None
        for _ in range(len(self._pool)):
            k = self._pool[self._pool_i % len(self._pool)]
            self._pool_i += 1
            if k != avoid and k != self._last_key:
                return k
        return self._pool[0]

    def plan(self, scenes: list[Scene]):
        v_i = 0
        # per-Short camera offset so two Shorts never share the same sequence of moves
        self._vseed = int(hashlib.sha1(self.s.get("slug", "").encode()).hexdigest(), 16) % 5
        ed_slot = 0  # editorial: every photo beat gets the next unused picture (Sam: no repeats)
        for si, sc in enumerate(scenes):
            typ = sc.visual.get("type")
            shots = []
            for b in range(len(sc.beats)):
                if typ == "image":
                    primary = sc.visual.get("image", "hook")
                    if b % 2 == 0 or not self._pool:
                        key = primary
                    else:
                        key = self._next_broll(avoid=primary) or primary
                    var = 0 if (si == 0 and b == 0) else (v_i % (len(VARIANTS) - 1)) + 1
                    shots.append(("image", key, var, b == 0))
                elif typ == "text":
                    shots.append(("text", None, 0, False) if b % 2 == 0 else
                                 ("textbg", self._next_broll(), (v_i % 5) + 1, False))
                elif typ == "editorial":  # backstory page: one layout per scene, animated in place
                    slot = None
                    if b % 4 in (1, 3):
                        slot, ed_slot = ed_slot, ed_slot + 1
                    shots.append(("editorial", slot, b, b == 0))
                elif typ == "lowpoly" and three_d_ok():
                    shots.append(("lowpoly", None, b + si * 2 + self._vseed, b == 0))
                elif three_d_ok() and typ in ("stat", "bars", "donut", "globe"):
                    # 3D: every beat is a new camera move; every third beat cuts to B-roll + figure
                    if b % 3 == 2 and self._pool and typ != "globe":
                        shots.append(("figure", self._next_broll(), (v_i % 5) + 1, False))
                    else:
                        shots.append(("3d", None, b + si + self._vseed, False))
                else:  # stat / bars / donut
                    if b == 0:
                        shots.append(("chart", None, 0, False))
                    elif b % 3 == 1:  # code-drawn alternate: ticker / waffle / columns
                        alt_key = self._next_broll() if typ == "stat" else None
                        shots.append(("alt", alt_key, (v_i % 5) + 1, False))
                    elif b % 3 == 2 and self._pool:
                        shots.append(("figure", self._next_broll(), (v_i % 5) + 1, False))
                    else:
                        shots.append(("chartzoom", None, b, False))
                if shots[-1][1]:
                    self._last_key = shots[-1][1]
                v_i += 1
            sc.shots = shots
        self._unique_pictures(scenes)

    def _unique_pictures(self, scenes: list[Scene]):
        """Sam's rule: no picture twice in a Short. A repeat takes an unused picture when one exists."""
        used = {s[1] for sc in scenes for s in sc.shots if s[1] in self.images}
        seen, self.repeated_pictures = set(), []
        for sc in scenes:
            for i, shot in enumerate(sc.shots):
                key = shot[1]
                if key not in self.images:
                    continue
                if key in seen:
                    spare = next((k for k in self.images if k not in used), None)
                    if spare is None:
                        text = self._beat_words(sc, i) or " ".join(w.text for w in sc.words[-3:]).upper().rstrip(".,!?")
                        if text:  # out of pictures: a bold card of what's being said, never a repeat
                            sc.shots[i] = ("wordcard", text, shot[2], False)
                        else:
                            self.repeated_pictures.append(key)
                        continue
                    sc.shots[i] = (shot[0], spare, *shot[2:])
                    used.add(spare)
                    key = spare
                seen.add(key)

    @staticmethod
    def _beat_words(sc: Scene, b: int) -> str:
        """The punch of this beat, from the narration only: its number, else its last three words."""
        end = sc.beats[b + 1] if b + 1 < len(sc.beats) else sc.duration
        words = [w.text for w in sc.words if sc.beats[b] <= w.start < end]
        hit = next((i for i, w in enumerate(words) if any(c.isdigit() for c in w)), None)
        picked = words[hit:hit + 2] if hit is not None else words[-3:]
        return " ".join(picked).upper().rstrip(".,!?")

    def _check_repeats(self, scenes: list[Scene]) -> list[str]:
        """Compare what each shot actually shows. A near-copy gets a different camera move; any
        copy that remains is reported. Never stops a render."""
        def sig(frame):
            a = np.asarray(frame.convert("L").resize((17, 16), Image.BILINEAR), np.int16)
            return (a[:, 1:] > a[:, :-1]).ravel()

        def sample(sc, si, b):
            end = sc.beats[b + 1] if b + 1 < len(sc.beats) else sc.duration
            return sig(self.draw(sc, si, (sc.beats[b] + end) / 2)[0])

        def twin(h, seen):
            return next((name for name, o in seen if int((h != o).sum()) <= 20), None)

        seen, found = [], []
        for si, sc in enumerate(scenes):
            for b, shot in enumerate(sc.shots):
                if shot[0] == "lowpoly" and self.plates is None:
                    continue  # still being recorded or GL: camera moves every beat anyway
                h = sample(sc, si, b)
                name = f"scene {si + 1} shot {b + 1}"
                other = twin(h, seen)
                if other and shot[0] in ("image", "figure", "textbg", "alt", "3d", "chartzoom"):
                    sc.shots[b] = (shot[0], shot[1], shot[2] + 2, shot[3])
                    h = sample(sc, si, b)
                    other = twin(h, seen)
                if other:
                    found.append(f"{name} looks like {other}")
                seen.append((name, h))
        return found

    # ---- building blocks
    def crop(self, key: str, variant: int, p: float) -> Image.Image:
        src = self.images.get(key)
        if src is None:
            return self.bg.copy()
        if PARALLAX and three_d_ok():
            if key not in self._depth:
                from .depth import depth_for
                cov = cover(src, W, H)
                d = depth_for((self.s.get("images", {}).get(key) or {}).get("url") or key, cov)
                self._depth[key] = (cov, d)
            cov, d = self._depth[key]
            if d is not None:  # real parallax: camera drifts through the depth-displaced photo
                from .gl3d import parallax, run3d
                return Image.fromarray(run3d(parallax, key, cov, d, p, variant))
        if key not in self._base:
            self._base[key] = cover(src, int(W * 1.4), int(H * 1.4))
        base = self._base[key]
        fx, fy, z0, z1 = VARIANTS[variant % len(VARIANTS)]
        z = z0 + (z1 - z0) * p
        cw, ch = base.width / z, base.height / z
        cx = min(max(fx * base.width, cw / 2), base.width - cw / 2)
        cy = min(max(fy * base.height, ch / 2), base.height - ch / 2)
        return base.resize((W, H), Image.BILINEAR, box=(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))

    def key_figure(self, v: dict) -> tuple[str, str]:
        typ = v.get("type")
        if typ == "stat":
            return (f'{v.get("prefix", "")}{fmt_number(float(v["value"]), v.get("decimals"))}{v.get("suffix", "")}',
                    v.get("label", ""))
        if typ == "donut":
            val = float(v["value"])
            return f"{fmt_number(val, 0 if val.is_integer() else 1)}%", v.get("label", "")
        if typ == "bars":
            it = v["items"][-1]
            val = float(it["value"])
            return (f'{v.get("prefix", "")}{fmt_number(val, None if val.is_integer() else 1)}{v.get("suffix", "")}',
                    it["label"])
        return "", ""

    # ---- shot drawers (t = seconds into this shot, p = 0..1 progress)
    def shot_image(self, sc: Scene, key, variant, first, t, p):
        frame = self.crop(key, variant, p)
        frame.paste(self.shade, (0, 0), self.shade)
        self._draw_tag(frame)
        big, sub = sc.visual.get("overlay"), sc.visual.get("overlay_sub")
        if big and first:
            d = ImageDraw.Draw(frame)
            # the very first frame already shows the hook in full: viewers decide in ~1 s
            opener = sc.visual is self.s["scenes"][0]["visual"]
            pop = 1.0 if opener else ease_out_back(t / 0.3)
            if opener:  # Nov 7: frame 0 is the cover, so it reads like a thumbnail even when tiny
                return self._cover_text(frame, big, sub)
            f = fit_font(big, BLACK, SAFE_X1 - SAFE_X0, 150, 70)
            if pop < 1.0:
                f = font(BLACK, max(20, int(f.size * (0.6 + 0.4 * pop))))
            col = self.theme["accent"] if self.s.get("theme") != "clean_navy" else (255, 255, 255)
            draw_centered(d, (SAFE_X0 + SAFE_X1) / 2, 380, big, f, col, 6, (0, 0, 0))
            if sub and (opener or t > 0.2):
                fs = fit_font(sub, SEMI, SAFE_X1 - SAFE_X0, 58, 36)
                draw_centered(d, (SAFE_X0 + SAFE_X1) / 2, 380 + f.size + 26, sub, fs, (255, 255, 255), 4, (0, 0, 0))
        return frame

    def _cover_text(self, frame, big, sub):
        """Cover frame: dark band, the overlay in up to 2 huge lines, the question under it."""
        if getattr(self, "_band", None) is None:
            a = np.zeros((H, 1), np.float32)
            y = np.arange(H)
            a[:, 0] = np.clip(1 - np.abs(y - 760) / 520, 0, 1) ** 0.8 * 190
            self._band = Image.fromarray(np.repeat(a, W, 1).astype(np.uint8), "L")
        frame.paste((0, 0, 0), (0, 0), self._band)
        d = ImageDraw.Draw(frame)
        cx, wmax = (SAFE_X0 + SAFE_X1) / 2, SAFE_X1 - SAFE_X0
        words = big.split()
        lines = [big]
        if len(words) > 1 and fit_font(big, BLACK, wmax, 220, 60).size < 170:
            cut = min(range(1, len(words)), key=lambda i: abs(len(" ".join(words[:i])) - len(" ".join(words[i:]))))
            lines = [" ".join(words[:cut]), " ".join(words[cut:])]
            if len(words) > 2 and min(fit_font(x, BLACK, wmax, 220, 60).size for x in lines) < 110:
                # a long title reads bigger on three lines: the split with the shortest longest line
                a, b = min(((i, j) for i in range(1, len(words) - 1) for j in range(i + 1, len(words))),
                           key=lambda c: max(len(" ".join(words[:c[0]])), len(" ".join(words[c[0]:c[1]])),
                                             len(" ".join(words[c[1]:]))))
                lines = [" ".join(words[:a]), " ".join(words[a:b]), " ".join(words[b:])]
        size = min(fit_font(x, BLACK, wmax, 220, 60).size for x in lines)
        f = font(BLACK, size)
        col = self.theme["accent"] if self.s.get("theme") != "clean_navy" else (255, 255, 255)
        y = 760 - (len(lines) * size * 1.05 + (90 if sub else 0)) / 2
        for line in lines:
            draw_centered(d, cx, y, line, f, col, 9, (0, 0, 0))
            y += size * 1.05
        if sub:
            fs = fit_font(sub, SEMI, wmax, 74, 40)
            draw_centered(d, cx, y + 24, sub, fs, (255, 255, 255), 5, (0, 0, 0))
        return frame

    def shot_figure(self, sc: Scene, key, variant, t, p):
        frame = self.crop(key, variant, p)
        frame.paste(self.shade, (0, 0), self.shade)
        frame.paste(self.dim, (0, 0), self.dim)
        self._draw_tag(frame)
        fig, label = self.key_figure(sc.visual)
        d = ImageDraw.Draw(frame)
        cx = (SAFE_X0 + SAFE_X1) / 2
        f = fit_font(fig, BLACK, SAFE_X1 - SAFE_X0, 260, 110)
        pop = ease_out_back(t / 0.3)
        ff = font(BLACK, max(20, int(f.size * (0.55 + 0.45 * min(pop, 1.08)))))
        draw_centered(d, cx, 700 + (f.size - ff.size) / 2, fig, ff, self.theme["accent"], 8, (0, 0, 0))
        fl = font(SEMI, 54)
        for i, line in enumerate(wrap(label, fl, SAFE_X1 - SAFE_X0)[:2]):
            draw_centered(d, cx, 700 + f.size + 50 + i * 68, line, fl, (255, 255, 255), 4, (0, 0, 0))
        return frame

    def shot_chartzoom(self, sc: Scene, variant, p):
        drawer = {"stat": self.frame_stat, "bars": self.frame_bars, "donut": self.frame_donut}[sc.visual["type"]]
        ck = ("chartfull", id(sc))
        if ck not in self._base:  # the settled chart never changes; draw it once per scene
            self._base[ck] = drawer(sc, 99.0, 0)
        full = self._base[ck]
        z = 1.1 + 0.06 * p
        cw, ch = W / z, H / z
        top = ZONE_TOP - ZONE_TOP / z  # zoom anchored on the dead-zone line, so nothing grows into it
        return full.resize((W, H), Image.BILINEAR, box=((W - cw) / 2, top, (W + cw) / 2, top + ch))

    def shot_textbg(self, sc: Scene, key, variant, t, p):
        frame = self.crop(key, variant, p)
        frame.paste(self.shade, (0, 0), self.shade)
        frame.paste(self.dim, (0, 0), self.dim)
        self._draw_tag(frame)
        txt = self.frame_text(sc, 99.0, 0, base=frame)
        return txt

    def _card_bg(self, t: float) -> Image.Image:
        """Background for text cards: the theme gradient with slow drifting soft lights and a vignette."""
        if getattr(self, "_glow", None) is None:
            rng = np.random.default_rng(11)
            gw, gh = (W + 240) // 8, (H + 240) // 8
            yy, xx = np.mgrid[0:gh, 0:gw].astype(np.float32)
            a = np.zeros((gh, gw), np.float32)
            for _ in range(9):
                cx, cy, r = rng.uniform(0, gw), rng.uniform(0, gh), rng.uniform(18, 46)
                a += np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r)) * rng.uniform(0.5, 1.0)
            light = self.s.get("theme") == "clean_navy"
            a = np.clip(a, 0, 1) * (46 if light else 70)
            col = self.theme["accent"][:3] if light else (255, 255, 255)
            g = Image.merge("RGBA", (*[Image.new("L", (gw, gh), c) for c in col], Image.fromarray(a.astype(np.uint8))))
            self._glow = g.resize((W + 240, H + 240), Image.BILINEAR)
            yy, xx = np.mgrid[0:H // 8, 0:W // 8].astype(np.float32)
            r = np.hypot((xx - W / 16) / (W / 16), (yy - H / 16 * 0.9) / (H / 16))
            v = (np.clip(r - 0.45, 0, 1) ** 1.5 * (60 if light else 150)).clip(0, 255).astype(np.uint8)
            self._cardvig = Image.fromarray(v).resize((W, H), Image.BILINEAR)
            self._cards = {}
        t = t if t < 50 else 0.0
        frame = self.bg.copy()
        ox, oy = int(40 + 34 * t) % 240, int(120 - 22 * t) % 240
        glow = self._glow.crop((ox, oy, ox + W, oy + H))
        frame.paste(glow, (0, 0), glow)
        frame.paste((0, 0, 0), (0, 0), self._cardvig)
        self._draw_tag(frame)
        return frame

    def shot_wordcard(self, text: str, t: float) -> Image.Image:
        """Bold card of the words being said: the key word in the accent color, an underline
        that wipes in, a soft shadow under the type."""
        frame = self._card_bg(t)
        text = " ".join(w for w in text.split() if any(c.isalnum() for c in w))  # no stray dashes
        if text not in self._cards:
            maxw = SAFE_X1 - SAFE_X0
            size = 168
            while True:
                f = font(BLACK, size)
                lines = wrap(text, f, maxw)
                if size <= 64 or (len(lines) <= 3 and all(f.getlength(l) <= maxw for l in lines)):
                    break
                size -= 6
            words = text.split()
            key = next((i for i, w in enumerate(words) if any(c.isdigit() for c in w)), None)
            if key is None:  # no number: the longest word carries the meaning (ties go to the later one)
                key = max(range(len(words)), key=lambda i: (len(words[i].strip(".,!?'")), i))
            gap = int(size * 1.08)
            th = len(lines) * gap + 46
            layer = Image.new("RGBA", (W, th + 80), (0, 0, 0, 0))
            d = ImageDraw.Draw(layer)
            n, y = 0, 20
            for line in lines:
                x = (W - f.getlength(line)) / 2 + (SAFE_X0 + SAFE_X1 - W) / 2
                for w in line.split():
                    d.text((x, y), w, font=f, fill=self.theme["accent"] if n == key else self.theme["text"])
                    x += f.getlength(w + " ")
                    n += 1
                y += gap
            bw = min(maxw, max(180, f.getlength(lines[-1]) * 0.5))
            bx = (SAFE_X0 + SAFE_X1) / 2 - bw / 2
            bar = (int(bx), y + 16, int(bx + bw), y + 34)
            sh = Image.new("L", layer.size, 0)
            sh.paste(layer.getchannel("A").point(lambda v: int(v * (0.22 if self.s.get("theme") == "clean_navy" else 0.5))), (0, 12))
            sh = sh.filter(ImageFilter.GaussianBlur(14))
            out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
            out.paste((0, 0, 0), (0, 0), sh)
            out.alpha_composite(layer)
            self._cards[text] = (out, bar)
        card, bar = self._cards[text]
        y0 = 840 - card.height // 2
        p = ease_out_back(t / 0.3)
        if p < 0.999:  # quick punch-in
            z = 0.8 + 0.2 * p
            small = card.resize((max(2, int(card.width * z)), max(2, int(card.height * z))), Image.BILINEAR)
            frame.paste(small, ((W - small.width) // 2, y0 + (card.height - small.height) // 2), small)
        else:
            frame.paste(card, (0, y0), card)
        q = ease_out((t - 0.25) / 0.35)
        if q > 0:
            d = ImageDraw.Draw(frame)
            cx = (bar[0] + bar[2]) / 2
            hw = (bar[2] - bar[0]) / 2 * q
            d.rounded_rectangle((cx - hw, y0 + bar[1], cx + hw, y0 + bar[3]), 9, fill=self.theme["accent"])
        return frame

    # ---- code-drawn "action" shots (only use numbers already in the script)
    def live_bg(self, t: float) -> Image.Image:
        """Chart background with a slowly drifting grid so chart shots never sit still."""
        step = 90
        if getattr(self, "_grid", None) is None:
            g = Image.new("RGBA", (W + step, H + step), (0, 0, 0, 0))
            d = ImageDraw.Draw(g)
            col = (*self.theme["accent"][:3], 26)
            for x in range(0, W + step + 1, step):
                d.line((x, 0, x, H + step), fill=col, width=2)
            for y in range(0, H + step + 1, step):
                d.line((0, y, W + step, y), fill=col, width=2)
            self._grid = g
        off = int((t * 45) % step) if t < 50 else 0
        frame = self.bg.copy()
        layer = self._grid.crop((off, off, off + W, off + H))
        frame.paste(layer, (0, 0), layer)
        return frame

    def shot_ticker(self, sc: Scene, key, variant, t, p):
        """Slot-machine digits that roll and lock in one by one."""
        if key:
            frame = self.crop(key, variant, p)
            frame.paste(self.shade, (0, 0), self.shade)
            frame.paste(self.dim, (0, 0), self.dim)
            self._draw_tag(frame)
        else:
            frame = self.live_bg(t)
        fig, label = self.key_figure(sc.visual)
        d = ImageDraw.Draw(frame)
        f = fit_font(fig, BLACK, SAFE_X1 - SAFE_X0, 280, 110)
        cx = (SAFE_X0 + SAFE_X1) / 2
        x = cx - f.getlength(fig) / 2
        digits = [i for i, c in enumerate(fig) if c.isdigit()]
        for i, c in enumerate(fig):
            y = 680
            ch = c
            if c.isdigit():
                lock = 0.15 + 0.09 * digits.index(i)
                if t < lock:
                    ch = str((int(t * 40) + i * 3) % 10)
                    y += int(18 * math.sin(t * 60 + i))
                else:
                    y -= int(26 * max(0.0, 1 - (t - lock) / 0.15))  # little bounce on lock
            col = self.theme["accent"] if (not c.isdigit() or t >= 0.15 + 0.09 * digits.index(i)) else (255, 255, 255)
            d.text((x, y), ch, font=f, fill=col, stroke_width=8, stroke_fill=(0, 0, 0))
            x += f.getlength(c)
        fl = font(SEMI, 54)
        if t > 0.3:
            for i, line in enumerate(wrap(label, fl, SAFE_X1 - SAFE_X0)[:2]):
                draw_centered(d, cx, 680 + f.size + 60 + i * 68, line, fl, (255, 255, 255), 4, (0, 0, 0))
        return frame

    def shot_waffle(self, sc: Scene, key, variant, t, p):
        """10x10 grid of squares filling to the percentage."""
        v = sc.visual
        frame = self.live_bg(t)
        d = ImageDraw.Draw(frame, "RGBA")
        val = float(v["value"])
        n = int(round(val))
        cell, gap = 48, 10
        x0 = (W - (10 * cell + 9 * gap)) // 2
        y0 = 380
        track = self.theme["track"]
        track = track if len(track) == 4 else (*track, 255)
        shown = int(n * min(1.0, ease_out(t / 1.1)))
        for k in range(100):
            r, c = divmod(k, 10)
            r = 9 - r  # fill from the bottom up
            bx, by = x0 + c * (cell + gap), y0 + r * (cell + gap)
            if k < shown:
                pop = min(1.0, (shown - k) / 6)
                s = int(cell * (0.6 + 0.4 * pop))
                o = (cell - s) // 2
                d.rounded_rectangle((bx + o, by + o, bx + o + s, by + o + s), 14, fill=self.theme["accent"])
            else:
                d.rounded_rectangle((bx, by, bx + cell, by + cell), 14, fill=track)
        pct = val * min(1.0, ease_out(t / 1.1))
        txt = f"{fmt_number(pct, 0 if val.is_integer() else 1)}%"
        cx = W / 2
        fy = y0 + 10 * (cell + gap) + 20
        draw_centered(d, cx, fy, txt, font(BLACK, 120), self.theme["text"])
        fl = font(SEMI, 44)
        for i, line in enumerate(wrap(v.get("label", ""), fl, SAFE_X1 - SAFE_X0)[:2]):
            draw_centered(d, cx, fy + 130 + i * 54, line, fl, self.theme["text"])
        return frame

    def shot_columns(self, sc: Scene, key, variant, t, p):
        """Vertical columns racing up, values counting with them."""
        v = sc.visual
        items = v["items"][:4]
        frame = self.live_bg(t)
        d = ImageDraw.Draw(frame, "RGBA")
        vmax = max(float(i["value"]) for i in items) or 1.0
        base_y, max_h = ZONE_TOP - 140, 520  # leaves room for the labels under the columns
        span = SAFE_X1 - SAFE_X0
        gap = 40
        cw = (span - gap * (len(items) - 1)) / len(items)
        fv, fl = font(BLACK, 58 if len(items) > 2 else 72), font(BOLD, 40 if len(items) > 2 else 48)
        for k, it in enumerate(items):
            pk = ease_out_back(min(1.0, max(0.0, (t - 0.08 * k) / 0.8)))
            val = float(it["value"])
            h = max(12, max_h * val / vmax * pk)
            x = SAFE_X0 + k * (cw + gap)
            last = k == len(items) - 1
            col = self.theme["accent"] if last else self.theme["accent2"]
            if self.s.get("theme") == "bold_bright" and not last:
                col = (255, 255, 255)
            d.rounded_rectangle((x, base_y - h, x + cw, base_y), 28, fill=col)
            label = f'{v.get("prefix", "")}{fmt_number(val * min(pk, 1.0), None if val.is_integer() else 1)}{v.get("suffix", "")}'
            f2 = fv if fv.getlength(label) <= cw + 30 else font(BLACK, 44)
            draw_centered(d, x + cw / 2, base_y - h - f2.size - 18, label, f2, self.theme["text"])
            for i, line in enumerate(wrap(it["label"], fl, cw + 20)[:2]):
                draw_centered(d, x + cw / 2, base_y + 24 + i * (fl.size + 8), line, fl, self.theme["muted"])
        if v.get("title"):
            draw_centered(d, W / 2, 400, v["title"].upper(), fit_font(v["title"].upper(), BOLD, span, 54, 34),
                          self.theme["muted"])
        return frame

    # ---- the original full-scene drawers (used for chart/text shots)
    def frame_stat(self, sc: Scene, t: float, idx: int) -> Image.Image:
        v = sc.visual
        frame = self.live_bg(t)
        d = ImageDraw.Draw(frame)
        p = ease_out(t / 1.0)
        val = float(v["value"]) * p
        txt = f'{v.get("prefix", "")}{fmt_number(val, v.get("decimals"))}{v.get("suffix", "")}'
        final = f'{v.get("prefix", "")}{fmt_number(float(v["value"]), v.get("decimals"))}{v.get("suffix", "")}'
        f = fit_font(final, BLACK, SAFE_X1 - SAFE_X0, 300, 120)
        cx = (SAFE_X0 + SAFE_X1) / 2
        draw_centered(d, cx, 640, txt, f, self.theme["accent"], 0)
        if fx.is_huge(final):
            fx.burst(frame, cx, 640 + f.size / 2, t - 1.0, seed=idx)
            d = ImageDraw.Draw(frame)
        fl = font(SEMI, 56)
        for i, line in enumerate(wrap(v.get("label", ""), fl, SAFE_X1 - SAFE_X0)):
            draw_centered(d, cx, 640 + f.size + 60 + i * 72, line, fl, self.theme["text"])
        return frame

    def frame_bars(self, sc: Scene, t: float, idx: int) -> Image.Image:
        v = sc.visual
        items = v["items"]
        frame = self.live_bg(t)
        d = ImageDraw.Draw(frame, "RGBA")
        vmax = max(float(i["value"]) for i in items) or 1.0
        y = 470
        if v.get("title"):
            d.text((SAFE_X0, y), v["title"].upper(), font=font(BOLD, 50), fill=self.theme["muted"])
            y += 100
        # shrink rows so the last bar ends above the caption dead zone
        s = min(1.0, (ZONE_TOP - y) / (len(items) * 272 - 94))
        fl, fv = font(BOLD, int(56 * s)), font(BLACK, int(64 * s))
        lab_h, bar_h, step = int(82 * s), int(96 * s), int(190 * s)
        bw = SAFE_X1 - SAFE_X0
        track = self.theme["track"]
        track = track if len(track) == 4 else (*track, 255)
        for k, it in enumerate(items):
            p = ease_out((t - 0.1 - 0.25 * k) / 0.8)
            d.text((SAFE_X0, y), it["label"], font=fl, fill=self.theme["text"])
            y += lab_h
            d.rounded_rectangle((SAFE_X0, y, SAFE_X1, y + bar_h), bar_h // 2, fill=track)
            frac = float(it["value"]) / vmax * p
            last = k == len(items) - 1
            if self.s.get("theme") == "bold_bright":
                col = self.theme["accent"] if last else (255, 255, 255)
            else:
                col = self.theme["accent"] if last else self.theme["accent2"]
            if frac > 0:
                d.rounded_rectangle((SAFE_X0, y, SAFE_X0 + max(bar_h, bw * frac), y + bar_h), bar_h // 2, fill=col)
            val = float(it["value"])
            label = f'{v.get("prefix", "")}{fmt_number(val * p, None if val.is_integer() else 1)}{v.get("suffix", "")}'
            lw = fv.getlength(label)
            bar_end = SAFE_X0 + bw * frac
            if bar_end - SAFE_X0 > lw + 60:  # label inside the bar
                inside = (20, 20, 20) if self.s.get("theme") != "clean_navy" or not last else (255, 255, 255)
                if self.s.get("theme") == "clean_navy":
                    inside = (255, 255, 255)
                d.text((bar_end - lw - 30, y + bar_h // 8), label, font=fv, fill=inside)
            else:
                d.text((min(bar_end + 20, SAFE_X1 - lw), y + bar_h // 8), label, font=fv, fill=self.theme["text"])
            y += step
        return frame

    def frame_donut(self, sc: Scene, t: float, idx: int) -> Image.Image:
        v = sc.visual
        frame = self.live_bg(t)
        d = ImageDraw.Draw(frame, "RGBA")
        cx, cy, r, w = (SAFE_X0 + SAFE_X1) // 2, 740, 270, 60
        box = (cx - r, cy - r, cx + r, cy + r)
        track = self.theme["track"]
        d.ellipse(box, outline=track if len(track) == 4 else (*track, 255), width=w)
        p = ease_out((t - 0.05) / 1.0)
        pct = float(v["value"]) * p
        if pct > 0.2:
            d.arc(box, -90, -90 + 360 * pct / 100, fill=self.theme["accent"], width=w)
        txt = f"{fmt_number(pct, 0 if float(v['value']).is_integer() else 1)}%"
        f = font(BLACK, 150)
        d.text((cx - f.getlength(txt) / 2, cy - 98), txt, font=f, fill=self.theme["text"])
        fl = font(SEMI, 56)
        for i, line in enumerate(wrap(v.get("label", ""), fl, SAFE_X1 - SAFE_X0)):
            draw_centered(d, cx, cy + r + 50 + i * 68, line, fl, self.theme["text"])
        return frame

    def frame_text(self, sc: Scene, t: float, idx: int, base: Image.Image | None = None) -> Image.Image:
        v = sc.visual
        frame = base if base is not None else self._card_bg(t)
        d = ImageDraw.Draw(frame)
        cx = (SAFE_X0 + SAFE_X1) / 2
        maxw = SAFE_X1 - SAFE_X0
        on_image = base is not None

        def block(txt, start, max_lines):
            size = start
            while size > 56:
                f = font(BLACK, size)
                lines = wrap(txt, f, maxw)
                if len(lines) <= max_lines and all(f.getlength(l) <= maxw for l in lines):
                    return f, lines
                size -= 6
            f = font(BLACK, 56)
            return f, wrap(txt, f, maxw)

        f1, l1 = block(v["text"], 132, 3)
        f2, l2 = block(v["sub"], 104, 3) if v.get("sub") else (None, [])
        h1 = len(l1) * (f1.size + 14)
        h2 = (len(l2) * (f2.size + 12) + 40) if l2 else 0
        y = 840 - (h1 + h2) / 2
        col1 = (255, 255, 255) if on_image else self.theme["text"]
        stroke = 6 if on_image else 0
        p1 = ease_out_back(t / 0.35)
        if p1 > 0.05:
            ff = font(BLACK, max(20, int(f1.size * (0.75 + 0.25 * min(p1, 1.0)))))
            for line in l1:
                draw_centered(d, cx, y + (f1.size - ff.size) / 2, line, ff, col1, stroke, (0, 0, 0))
                y += f1.size + 14
        if l2 and t > 0.55:
            p2 = ease_out_back((t - 0.55) / 0.35)
            ff = font(BLACK, max(20, int(f2.size * (0.75 + 0.25 * min(p2, 1.0)))))
            y += 40
            for line in l2:
                draw_centered(d, cx, y + (f2.size - ff.size) / 2, line, ff, self.theme["accent"], stroke, (0, 0, 0))
                y += f2.size + 12
        return frame

    # ---- per frame
    def draw(self, sc: Scene, si: int, t: float) -> tuple[Image.Image, float]:
        b = max(0, bisect.bisect_right(sc.beats, t) - 1)
        b0 = sc.beats[b]
        b1 = sc.beats[b + 1] if b + 1 < len(sc.beats) else sc.duration
        tb, pb = t - b0, (t - b0) / max(b1 - b0, 0.1)
        kind, key, variant, first = sc.shots[b]
        if kind == "wordcard":
            return self.shot_wordcard(key, tb), tb
        if kind == "editorial":
            from . import editorial
            hold = 0.45 if si == 0 and b == 0 else 0.0  # the Short opens on a cover: the page + the title, huge
            if hold and t < hold:
                if "edcover" not in self._base:
                    page = editorial.render(self.s, sc.visual, 3.0, 0, 3.0, key)
                    self._base["edcover"] = self._cover_text(page, self.s.get("title", "").upper(), "")
                return self._base["edcover"].copy(), tb
            return editorial.render(self.s, sc.visual, t - hold, b, tb - hold, key), tb
        if kind == "lowpoly":
            from . import lowpoly
            from .gl3d import run3d
            key = f"{scenes_index(self, sc)}_{int(round(t * FPS))}"
            plate = None
            if self.plates is not None:  # a frame can land one tick off a scene edge: take a neighbor
                si_, fr = key.split("_")
                plate = next((f for d in (0, 1, -1, 2, -2) if (f := self.plates / f"{si_}_{int(fr) + d}.jpg").exists()), None)
            if plate is not None:
                frame = Image.open(plate).convert("RGB").resize((W, H), Image.LANCZOS)
                frame = frame.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
            else:
                frame = run3d(lowpoly.render, sc.visual, t, pb, variant, key if self.lp_record else None,
                              b, si, bool(sc.visual.get("stat")) and b % 2 == 0)
            self._lp_stat(frame, sc.visual, tb - (0.75 if si == 0 and b == 0 else 0), b, si)
            return frame, tb
        if kind == "3d":
            from . import scene3d
            from .gl3d import run3d
            frame = run3d(scene3d.RENDERERS[sc.visual["type"]], self.theme, self.s.get("theme", "dark_neon"),
                          sc.visual, t, pb, variant)
            self._draw_tag(frame)
        elif kind == "image":
            frame = self.shot_image(sc, key, variant, first, tb, pb)
        elif kind == "figure":
            frame = self.shot_figure(sc, key, variant, tb, pb)
        elif kind == "chartzoom":
            frame = self.shot_chartzoom(sc, variant, pb)
        elif kind == "alt":
            alt = {"stat": self.shot_ticker, "donut": self.shot_waffle, "bars": self.shot_columns}
            frame = alt[sc.visual["type"]](sc, key, variant, tb, pb)
        elif kind == "textbg":
            frame = self.shot_textbg(sc, key, variant, tb, pb)
        elif kind == "text":
            frame = self.frame_text(sc, t if b == 0 else 99.0, si)
        elif sc.visual.get("type") == "lowpoly":  # 3D unavailable: show the scene's stat as a text card
            v = sc.visual
            fake = Scene(sc.narration, {"type": "text", "text": v.get("stat") or self.s.get("title", ""),
                                        "sub": v.get("stat_sub", "")})
            frame = self.frame_text(fake, tb, si)
        else:
            drawer = {"stat": self.frame_stat, "bars": self.frame_bars, "donut": self.frame_donut}
            frame = drawer[sc.visual["type"]](sc, tb, si)
        return frame, tb

    def still(self, scene_index: int, t: float, scenes: list) -> Image.Image:
        if not scenes[0].shots:
            self.plan(scenes)
        sc = scenes[scene_index]
        frame, _ = self.draw(sc, scene_index, t)
        self._caption(frame, chunk_words(sc.words), min(t, sc.words[-1].end if sc.words else t))
        return frame

    # ---- assemble
    def prepare(self) -> list[Scene]:
        scenes = []
        self.cta_q = self.s.get("cta_question") or CTA_QUESTION  # e.g. a this-or-that choice
        cta_line = " ".join(p.strip() for p in self.s.get("cta", CTA_LINE).split("|") if p.strip())
        loop = (self.s.get("loop") or "").strip()
        last = len(self.s["scenes"]) - 1
        self.joins = []  # (scene, start, end) silences that must stay silent — for the checker
        self.cta = None
        sr = tts.SAMPLE_RATE
        tts.use_engine_for([raw["narration"] for raw in self.s["scenes"]] + [cta_line, loop])
        for i, raw in enumerate(self.s["scenes"]):
            sc = Scene(tts.strip_speakers(raw["narration"]), raw["visual"])
            sc.audio, timings = tts.synthesize(raw["narration"])  # "B:" lines use the second voice
            speech = len(sc.audio) / sr
            sc.words = align_words(sc.narration, timings, speech)
            tails = {}
            if i == last:
                # the CTA, then the loop line, each its own clip after a short beat; gluing them
                # onto the scene's sentence made Kokoro run everything together in one breath
                for name, line in (("cta", cta_line), ("loop", loop)):
                    if not line:
                        continue
                    c_audio, c_timings = tts.synthesize(line)
                    c_speech = len(c_audio) / sr
                    self.joins.append((i, speech, speech + CTA_PAUSE))
                    off = speech + CTA_PAUSE
                    tails[name] = [Word(w.text, w.start + off, w.end + off)
                                   for w in align_words(line, c_timings, c_speech)]
                    sc.audio = np.concatenate([sc.audio, np.zeros(int(CTA_PAUSE * sr), np.float32), c_audio])
                    sc.narration = sc.narration.rstrip() + " " + line
                    sc.words = sc.words + tails[name]
                    speech = off + c_speech
            sc.duration = speech + SCENE_GAP
            if tails.get("cta"):
                tail = tails["cta"]

                def at(word, default):
                    for w in tail:
                        if re.sub(r"\W", "", w.text.lower()).startswith(word):
                            return w.start
                    return default
                t0 = tail[0].start
                # overlay clears when the loop line starts, so the replay seam is clean
                end = tails["loop"][0].start - 0.1 if tails.get("loop") else sc.duration
                self.cta = {"si": i, "start": t0, "end": end, "like": at("like", None),
                            "sub": at("subscribe", t0 + 0.8), "com": at("comment", t0)}
            scenes.append(sc)
        scenes[-1].duration += END_HOLD
        for sc in scenes:
            sc.beats = make_beats(sc.words, sc.duration)
        self.plan(scenes)
        return scenes

    def render(self, out_path: Path) -> dict:
        scenes = self.prepare()
        self._scenes = scenes
        try:
            repeats = self._check_repeats(scenes)
        except Exception as e:  # a check must never cost a post
            repeats = []
            print(f"::warning::[render] repeat check skipped: {e}")
        for k in getattr(self, "repeated_pictures", []):
            print(f"::warning::[render] {self.s.get('id')}: ran out of pictures, '{k}' repeats")
        for r in repeats:
            print(f"::warning::[render] {self.s.get('id')}: {r}")
        print(f"::notice::[render] repeat check:{len(repeats)} near-copies, {len(getattr(self, 'repeated_pictures', []))} reused pictures")
        sr = tts.SAMPLE_RATE
        audio = np.concatenate([np.pad(sc.audio, (0, int(round(sc.duration * sr)) - len(sc.audio)))
                                for sc in scenes])
        starts = np.cumsum([0] + [sc.duration for sc in scenes])
        cuts = sorted({float(starts[i] + b) for i, sc in enumerate(scenes) for b in sc.beats} - {0.0})
        voice = audio.copy()
        if music.MUSIC_GAIN > 0:  # original synthesized bed, ducked under the voice
            bed = music.bed(len(audio) / sr, sr, seed=self.s.get("slug") or self.s.get("company", ""),
                            mood=self.s.get("format"))
            bed = np.pad(bed, (0, max(0, len(audio) - len(bed))))[: len(audio)]
            audio = audio + music.duck(bed, audio, sr) * music.MUSIC_GAIN
        audio_issues, audio_stats = audio_check.check(scenes, starts, self.joins, voice, audio, sr)
        clear_issues, clear_stats = clarity_check.check(scenes, starts, audio, sr)
        audio_issues += clear_issues
        audio_stats.update(clear_stats)
        audio = np.clip(audio, -1, 1)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "voice.wav"
            sf.write(wav, audio, sr)
            total_frames = int(math.ceil(len(audio) / sr * FPS))
            total_s = len(audio) / sr
            cmd = ["ffmpeg", "-y", "-loglevel", "error",
                   "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                   "-i", str(wav),
                   "-c:v", "libx264", "-preset", os.environ.get("X264_PRESET", "veryfast"),
                   "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                   # YouTube plays Shorts at about -14 LUFS: normalize so ours aren't quieter than the rest
                   "-af", os.environ.get("LOUDNORM", "loudnorm=I=-14:TP=-1.5:LRA=11"),
                   "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
                   "-shortest", str(out_path)]
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            chunks = [chunk_words(sc.words) for sc in scenes]
            flash = Image.new("RGB", (W, H), (255, 255, 255))
            blanks = []

            def make(n: int) -> bytes:
                gt = n / FPS
                si = min(int(np.searchsorted(starts, gt, side="right") - 1), len(scenes) - 1)
                sc, t = scenes[si], gt - starts[si]
                frame, tb = self.draw(sc, si, t)
                lp = self.s.get("visual_style") == "lowpoly"
                if not lp and sc.shots[max(0, bisect.bisect_right(sc.beats, t) - 1)][0] != "image":
                    frame = fx.drift(frame, tb)  # images already zoom; everything else drifts in
                if lp:
                    if si > 0:  # camera cuts every beat; a zoom-blur marks each new scene
                        frame = fx.zoom_blur(frame, t)
                    if tb < 0.12 and t > 0.2:  # and a small punch-in lands every cut inside a scene
                        frame = fx.zoom(frame, 1.05 - 0.05 * ease_out(tb / 0.12))
                elif TRANSITION_3D and three_d_ok() and gt > 0.05 and tb < 0.18:
                    # 3D swing: the new shot arrives as a card turning in from the side
                    from .gl3d import card, run3d
                    frame = Image.fromarray(run3d(card, frame, tb / 0.18, (si * 7 + int(t * 3)) % 2,
                                                  self.theme["bg_top"]))
                elif gt > 0.05 and tb < 0.14:  # punch-in + light flash on every cut
                    z = 1.07 - 0.07 * ease_out(tb / 0.14)
                    cw, ch = W / z, H / z
                    frame = frame.resize((W, H), Image.BILINEAR,
                                         box=((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2))
                    if tb < 0.07:
                        frame = Image.blend(frame, flash, 0.22 * (1 - tb / 0.07))
                frame = fx.grade(frame, n)
                if lp:
                    # the name banner sits at the top (famous format): the title goes under it, not behind it
                    fx.hook(frame, self.s.get("title", ""), gt, font, BLACK, y=345 if self.s.get("name_card") else 150)
                self._hud(frame, scenes, si, t)
                self._name(frame, gt)
                self._cta(frame, si, t)
                if sc.shots[max(0, bisect.bisect_right(sc.beats, t) - 1)][0] not in ("3d", "alt", "chartzoom", "wordcard"):
                    self._icon(frame, chunks[si], t, lp)  # never on top of a chart or a word card
                self._caption(frame, chunks[si], t)  # after the CTA dim, so captions stay bright
                # thin progress bar along the top edge keeps people watching to the end
                ImageDraw.Draw(frame).rectangle((0, 0, int(W * min(1.0, gt / total_s)), PROGRESS_H),
                                                fill=self.theme["accent"])
                if n == 0:
                    self._first = frame.copy()
                frame = fx.loop_blend(frame, getattr(self, "_first", None), total_s - gt)
                if n % 15 == 0 and fx.blank(frame):
                    blanks.append(round(gt, 1))
                return frame.tobytes()

            make(0)  # warm the shared caches before going parallel
            # Pillow's resize/paste release the GIL, so frames render in parallel threads;
            # map() keeps them in order for ffmpeg. RENDER_THREADS=1 renders serially.
            workers = int(os.environ.get("RENDER_THREADS", min(4, os.cpu_count() or 1)))
            with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
                for start in range(0, total_frames, 48):  # bounded batches keep memory flat
                    for buf in pool.map(make, range(start, min(start + 48, total_frames))):
                        proc.stdin.write(buf)
            proc.stdin.close()
            if proc.wait() != 0:
                raise RuntimeError("ffmpeg failed")
        mids = [round(float(starts[i] + sc.beats[min(1, len(sc.beats) - 1)] + 0.6), 2) for i, sc in enumerate(scenes)]
        return {"path": str(out_path), "seconds": round(len(audio) / sr, 2), "scenes": len(scenes),
                "cuts": len(cuts), "avg_shot": round(len(audio) / sr / (len(cuts) + 1), 2),
                "scene_mids": mids, "voice": tts.VOICE_ENGINE,
                "timed_words": all(sc.words for sc in scenes),
                "images_ok": sorted(self.images), "blank_frames": blanks, **audio_stats, "audio_issues": audio_issues}

    # ---- like / subscribe / comment call to action
    def _pill(self, label: str, bg, fg, icon: str | None) -> Image.Image:
        f = font(BLACK, 50)
        ph, pad = 100, 34
        iw = 56 if icon else 0
        w = int(f.getlength(label) + 2 * pad + iw)
        img = Image.new("RGBA", (w + 8, ph + 10), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((6, 10, w + 6, ph + 8), ph // 2, fill=(0, 0, 0, 120))  # shadow
        d.rounded_rectangle((0, 2, w, ph + 2), ph // 2, fill=(*bg, 255))
        x, cy = pad, ph // 2 + 2
        if icon == "heart":
            c = (230, 33, 23)
            d.ellipse((x, cy - 18, x + 24, cy + 4), fill=c)
            d.ellipse((x + 18, cy - 18, x + 42, cy + 4), fill=c)
            d.polygon([(x + 1, cy - 4), (x + 41, cy - 4), (x + 21, cy + 20)], fill=c)
        elif icon == "check":
            d.line([(x + 2, cy), (x + 15, cy + 13), (x + 38, cy - 14)], fill=fg, width=8, joint="curve")
        d.text((x + iw, cy - 32), label, font=f, fill=fg)
        return img

    def _bubble(self, text: str) -> Image.Image:
        f, fh = font(BOLD, 34), font(BLACK, 48)
        maxw = SAFE_X1 - SAFE_X0 - 80
        lines = wrap(text[:1].upper() + text[1:], fh, maxw)[:3]
        bw = int(max(f.getlength("COMMENT BELOW"), *(fh.getlength(l) for l in lines)) + 80)
        bh = 40 + 44 + len(lines) * 60 + 26
        img = Image.new("RGBA", (bw + 8, bh + 46), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((6, 8, bw + 6, bh + 6), 36, fill=(0, 0, 0, 120))
        d.rounded_rectangle((0, 0, bw, bh), 36, fill=(255, 255, 255, 255))
        d.polygon([(60, bh - 2), (110, bh - 2), (52, bh + 40)], fill=(255, 255, 255, 255))  # tail
        d.text((40, 36), "COMMENT BELOW", font=f, fill=self.theme["accent2"] if self.s.get("theme") == "bold_bright"
               else (230, 33, 23))
        for i, l in enumerate(lines):
            d.text((40, 84 + i * 60), l, font=fh, fill=(15, 15, 15))
        return img

    @staticmethod
    def _pop(frame: Image.Image, img: Image.Image, cx: float, cy: float, p: float):
        z = max(0.05, ease_out_back(min(1.0, p)))
        im = img if abs(z - 1) < 0.01 else img.resize((max(1, int(img.width * z)), max(1, int(img.height * z))),
                                                       Image.BILINEAR)
        frame.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)), im)

    def _cta(self, frame: Image.Image, si: int, t: float):
        c = self.cta
        if not c or si != c["si"] or not (c["start"] - 0.1 <= t <= c["end"]):
            return
        if c["like"] is None:  # comment + subscribe only (the default end-of-video ask)
            self._cta_end(frame, c, t)
            return
        if not hasattr(self, "_cta_parts"):
            self._cta_parts = {
                "like": self._pill("LIKE", (255, 255, 255), (15, 15, 15), "heart"),
                "sub": self._pill("SUBSCRIBE", (230, 33, 23), (255, 255, 255), None),
                "subbed": self._pill("SUBSCRIBED", (70, 70, 70), (235, 235, 235), "check"),
                "bubble": self._bubble(self.cta_q),
            }
        P = self._cta_parts
        # dim the frame a little so the CTA reads over busy charts/b-roll
        fade = min(1.0, (t - c["like"] + 0.1) / 0.25)
        a = int(110 * fade) // 10 * 10  # few distinct levels so the overlay can be cached
        if ("ctadim", a) not in self._base:
            self._base[("ctadim", a)] = Image.new("RGBA", (W, H), (0, 0, 0, a))
        dim = self._base[("ctadim", a)]
        frame.paste(dim, (0, 0), dim)
        click = c["sub"] + 0.6
        sub_img = P["subbed"] if t >= click else P["sub"]
        gap = 26
        row_w = P["like"].width + gap + max(P["sub"].width, P["subbed"].width)
        x0 = (W - row_w) / 2
        lx = x0 + P["like"].width / 2
        sx = x0 + P["like"].width + gap + sub_img.width / 2
        self._pop(frame, P["like"], lx, CTA_Y, (t - c["like"] + 0.1) / 0.3)
        if t >= c["sub"] - 0.1:
            p = (t - c["sub"] + 0.1) / 0.3
            if click <= t < click + 0.25:  # button bounce on click
                p = 1.0
                sub_img = sub_img.resize((int(sub_img.width * 0.94), int(sub_img.height * 0.94)), Image.BILINEAR)
            self._pop(frame, sub_img, sx, CTA_Y, p)
            # cursor glides in and taps the button
            if t < click + 0.5:
                k = ease_out(min(1.0, max(0.0, (t - c["sub"] - 0.05) / 0.5)))
                ax = sx + 40 + (1 - k) * 260
                ay = CTA_Y + 20 + (1 - k) * 320
                s = 0.85 if click <= t < click + 0.15 else 1.0
                arrow = [(0, 0), (0, 62), (16, 48), (28, 76), (40, 70), (28, 44), (50, 44)]
                pts = [(ax + x * s, ay + y * s) for x, y in arrow]
                d = ImageDraw.Draw(frame)
                d.polygon(pts, fill=(255, 255, 255), outline=(0, 0, 0))
                d.line(pts + [pts[0]], fill=(0, 0, 0), width=4)
        if t >= c["com"] - 0.1:
            b = P["bubble"]
            self._pop(frame, b, W / 2, CTA_Y + 90 + b.height / 2, (t - c["com"] + 0.1) / 0.3)

    def _cta_end(self, frame: Image.Image, c: dict, t: float):
        """Comment bubble pops on "comment", then SUBSCRIBE gets clicked → SUBSCRIBED."""
        if not hasattr(self, "_cta_parts"):
            self._cta_parts = {
                "sub": self._pill("SUBSCRIBE", (230, 33, 23), (255, 255, 255), None),
                "subbed": self._pill("SUBSCRIBED", (70, 70, 70), (235, 235, 235), "check"),
                "bubble": self._bubble(self.cta_q),
            }
        P = self._cta_parts
        fade = min(1.0, (t - c["start"] + 0.1) / 0.25)
        out = min(1.0, max(0.0, (c["end"] - t) / 0.2))  # fade out before the loop line
        a = int(110 * fade * out) // 10 * 10
        if ("ctadim", a) not in self._base:
            self._base[("ctadim", a)] = Image.new("RGBA", (W, H), (0, 0, 0, a))
        dim = self._base[("ctadim", a)]
        frame.paste(dim, (0, 0), dim)
        if out < 1.0:
            return
        b = P["bubble"]
        self._pop(frame, b, W / 2, CTA_Y + b.height / 2, (t - c["com"] + 0.1) / 0.3)
        if t >= c["sub"] - 0.1:
            click = c["sub"] + 0.5
            sub_img = P["subbed"] if t >= click else P["sub"]
            sy = ZONE_TOP - 80  # low and clear of the scene's own text/chart, above captions
            p = (t - c["sub"] + 0.1) / 0.3
            if click <= t < click + 0.25:
                p = 1.0
                sub_img = sub_img.resize((int(sub_img.width * 0.94), int(sub_img.height * 0.94)), Image.BILINEAR)
            self._pop(frame, sub_img, W / 2, sy, p)
            if t < click + 0.5:  # cursor glides in and taps the button
                k = ease_out(min(1.0, max(0.0, (t - c["sub"] - 0.05) / 0.45)))
                ax = W / 2 + 40 + (1 - k) * 260
                ay = sy + 20 + (1 - k) * 320
                s = 0.85 if click <= t < click + 0.15 else 1.0
                arrow = [(0, 0), (0, 62), (16, 48), (28, 76), (40, 70), (28, 44), (50, 44)]
                pts = [(ax + x * s, ay + y * s) for x, y in arrow]
                d = ImageDraw.Draw(frame)
                d.polygon(pts, fill=(255, 255, 255), outline=(0, 0, 0))
                d.line(pts + [pts[0]], fill=(0, 0, 0), width=4)

    def _lp_stat(self, frame, v, tb, b, si=0):
        """Big yellow outlined number with a pop, on the first beat and every other beat. On the
        first beat the number counts up from 0; a billion+ number lands with a coin burst."""
        if not v.get("stat") or b % 2 or tb < 0:
            return
        d = ImageDraw.Draw(frame)
        pop = ease_out_back(min(1.0, tb / 0.25))
        f = fit_font(v["stat"], BLACK, SAFE_X1 - SAFE_X0, 210, 90)
        f = font(BLACK, max(20, int(f.size * (0.5 + 0.5 * pop))))
        cx = (SAFE_X0 + SAFE_X1) / 2
        shown = fx.count_up(v["stat"], tb / 0.5) if b == 0 and fx.ON else v["stat"]
        draw_centered(d, cx, 430, shown, f, (255, 221, 0), 14, (0, 0, 0))
        if b == 0 and fx.is_huge(v["stat"]):
            fx.burst(frame, cx, 430 + f.size / 2, tb - 0.45, seed=si)
            d = ImageDraw.Draw(frame)
        if v.get("stat_sub") and tb > 0.15:
            fs = fit_font(v["stat_sub"].lower(), BOLD, SAFE_X1 - SAFE_X0, 64, 40)
            draw_centered(d, cx, 430 + f.size + 24, v["stat_sub"].lower(), fs, (255, 255, 255), 8, (0, 0, 0))

    def _caption_lp(self, frame, words, t):
        """Low-poly captions: one lowercase yellow word at a time, thick black outline."""
        cur = None
        for w in words:
            if w.start - 0.03 <= t <= w.end + 0.08:
                cur = w
        if cur is None:
            return
        txt = re.sub(r"[^\w$%'.,\-]", "", cur.text).lower().rstrip(".,") or cur.text.lower()  # keep "47,000"
        f = fit_font(txt, BLACK, SAFE_X1 - SAFE_X0, 120, 60)
        k = min(1.0, (t - cur.start + 0.03) / 0.08)
        f = font(BLACK, max(20, int(f.size * (0.85 + 0.15 * k))))
        draw_centered(ImageDraw.Draw(frame), (SAFE_X0 + SAFE_X1) / 2, CAPTION_Y - f.size // 2, txt, f,
                      (255, 221, 0), 12, (0, 0, 0))

    def _hud(self, frame, scenes, si, t):
        """Running counter in the top-left corner (Sam's liked reels: "TIME SINCE HE WOKE UP",
        "$2,001 + HOUSE"). Script: "hud_label": "MONEY LEFT", each scene's visual "hud": "$2,001".
        The value pops when it changes and carries over scenes that don't set one."""
        label = self.s.get("hud_label")
        vals = [sc.visual.get("hud") for sc in scenes[: si + 1]]
        val = next((v for v in reversed(vals) if v), None)
        if not label or not val:
            return
        changed = scenes[si].visual.get("hud") and (si == 0 or val != next((v for v in reversed(vals[:-1]) if v), None))
        pop = ease_out_back(min(1.0, t / 0.3)) if changed else 1.0
        d = ImageDraw.Draw(frame)
        fl = font(BOLD, 30)
        fv = font(BLACK, max(20, int(64 * (0.6 + 0.4 * pop))))
        d.text((SAFE_X0, 60), label.upper(), font=fl, fill=(255, 255, 255), stroke_width=5, stroke_fill=(0, 0, 0))
        d.text((SAFE_X0, 98), val, font=fv, fill=(255, 221, 0), stroke_width=8, stroke_fill=(0, 0, 0))

    def _name(self, frame, gt):
        """Who this Short is about (famous format): name banner slides in after the title punch-in
        and stays ~3 s. Script: "name_card": "CRISTIANO RONALDO", optional "name_sub": "soccer player".
        The name does the identifying; characters never copy a real person's look (STYLE.md)."""
        name = self.s.get("name_card")
        if not name or gt > 4.2:  # Sam, Nov 3: name from the very first frame
            return
        k = min(1.0, (4.2 - gt) / 0.2)
        d = ImageDraw.Draw(frame)
        f = fit_font(name.upper(), BLACK, SAFE_X1 - SAFE_X0 - 60, 76, 40)
        tw = d.textlength(name.upper(), font=f)
        x0 = SAFE_X0 - (1 - k) * (tw + 120)
        y0 = 205
        d.rectangle((x0, y0, x0 + tw + 50, y0 + f.size + 30), fill=(255, 221, 0))
        d.text((x0 + 25, y0 + 12), name.upper(), font=f, fill=(0, 0, 0))
        sub = self.s.get("name_sub")
        if sub:
            fs = font(BOLD, 36)
            sw = d.textlength(sub.upper(), font=fs)
            d.rectangle((x0, y0 + f.size + 30, x0 + sw + 40, y0 + f.size + 82), fill=(0, 0, 0))
            d.text((x0 + 20, y0 + f.size + 36), sub.upper(), font=fs, fill=(255, 255, 255))

    def _icon(self, frame, chunks, t, lp):
        """Small drawn icon above the captions while a matching word (money, truck, plane...) is said."""
        if not fx.ON:
            return
        for w in (w for ch in chunks for w in ch):
            kind = fx.icon_for(w.text)
            if kind and w.start - 0.03 <= t <= w.end + 0.35:
                y = CAPTION_Y - (215 if lp else 225)
                fx.draw_icon(frame, kind, (SAFE_X0 + SAFE_X1) / 2, y, (t - w.start + 0.03) / 0.15)
                return

    def _caption(self, frame: Image.Image, chunks: list[list[Word]], t: float):
        if self.s.get("visual_style") == "lowpoly":
            self._caption_lp(frame, [w for ch in chunks for w in ch], t)
            return
        for ch in chunks:
            if ch[0].start - 0.05 <= t <= ch[-1].end + 0.05:
                hi = 0
                for i, w in enumerate(ch):
                    if t >= w.start:
                        hi = i
                img = self.captions.render(ch, hi)
                frame.paste(img, (0, CAPTION_Y - img.height // 2), img)
                return


def scenes_index(r, sc) -> int:
    return next(i for i, x in enumerate(r._scenes) if x is sc)


def render_script(script_path: Path, out_path: Path) -> dict:
    script = json.loads(Path(script_path).read_text())
    return Renderer(script).render(out_path)
