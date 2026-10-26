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

import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from . import tts
from .themes import get_theme

W, H = 1080, 1920
FPS = 30
ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "assets" / "fonts"
CACHE = Path(os.environ.get("HTMM_CACHE", ROOT / ".cache"))
SAFE_X0, SAFE_X1 = 70, 950          # keep clear of Shorts' right-side buttons
CAPTION_Y = 1330                     # above the Shorts title/channel overlay
SCENE_GAP = 0.18                     # seconds of silence between scenes
END_HOLD = 0.6

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
        texts = [re.sub(r"[^\w$%'.\-]", "", w.text).upper().rstrip(".") or w.text.upper() for w in chunk]
        size = 82
        f = font(XBOLD, size)
        space = f.getlength(" ")
        total = sum(f.getlength(t) for t in texts) + space * (len(texts) - 1)
        while total > (SAFE_X1 - SAFE_X0) and size > 48:
            size -= 4
            f = font(XBOLD, size)
            space = f.getlength(" ")
            total = sum(f.getlength(t) for t in texts) + space * (len(texts) - 1)
        img = Image.new("RGBA", (W, size + 40), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        x = (W - total) / 2
        for i, t in enumerate(texts):
            fill = self.theme["caption_hi"] if i == hi else self.theme["caption_fill"]
            d.text((x, 14), t, font=f, fill=fill, stroke_width=8,
                   stroke_fill=self.theme["caption_stroke"])
            x += f.getlength(t) + space
        self.cache[key] = img
        return img


# ---------------------------------------------------------------- scenes

@dataclass
class Scene:
    narration: str
    visual: dict
    audio: np.ndarray = field(default=None)
    duration: float = 0.0
    words: list = field(default_factory=list)


class Renderer:
    def __init__(self, script: dict):
        self.s = script
        self.theme = get_theme(script.get("theme", "dark_neon"))
        self.captions = CaptionRenderer(self.theme)
        imgs = script.get("images", {})
        self.images = {k: fetch_image((v or {}).get("url")) for k, v in imgs.items()}
        self.bg = gradient(self.theme["bg_top"], self.theme["bg_bottom"])
        hook = self.images.get("hook")
        if hook is not None:  # faint blurred hook image keeps chart scenes on-topic
            ghost = cover(hook, W, H).filter(ImageFilter.GaussianBlur(28))
            self.bg = Image.blend(self.bg, ghost, 0.16 if script.get("theme") != "clean_navy" else 0.08)
        self._draw_tag(self.bg)
        self.shade = shade_overlay(self.theme["image_tint"])
        self._kb_cache: dict = {}

    def _draw_tag(self, img: Image.Image):
        d = ImageDraw.Draw(img, "RGBA")
        f = font(BOLD, 30)
        label = "HOW THEY MAKE MONEY"
        w = f.getlength(label)
        d.rounded_rectangle((SAFE_X0, 222, SAFE_X0 + w + 44, 274), 26,
                            fill=(*self.theme["accent"][:3], 235))
        d.text((SAFE_X0 + 22, 229), label, font=f, fill=self.theme.get("tag_text", (10, 10, 10)))

    # ---- per-type frame drawers. p = seconds into scene, dur = scene length
    def frame_image(self, sc: Scene, t: float, idx: int) -> Image.Image:
        key = sc.visual.get("image", "hook")
        src = self.images.get(key)
        if src is None:
            frame = self.bg.copy()
        else:
            if key not in self._kb_cache:
                self._kb_cache[key] = cover(src, int(W * 1.14), int(H * 1.14))
            base = self._kb_cache[key]
            p = t / max(sc.duration, 0.1)
            z = 1.0 + 0.14 * (p if idx % 2 == 0 else 1 - p)  # alternate zoom in / out
            cw, ch = base.width / z, base.height / z
            cx = base.width / 2 + (0.03 * base.width * (p - 0.5) * (1 if idx % 2 else -1))
            cy = base.height / 2 - 0.02 * base.height * p
            cx = min(max(cx, cw / 2), base.width - cw / 2)
            cy = min(max(cy, ch / 2), base.height - ch / 2)
            box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
            frame = base.resize((W, H), Image.BILINEAR, box=box)
            frame.paste(self.shade, (0, 0), self.shade)
            self._draw_tag(frame)
        big = sc.visual.get("overlay")
        sub = sc.visual.get("overlay_sub")
        if big:
            d = ImageDraw.Draw(frame)
            pop = ease_out_back(t / 0.35)
            f = fit_font(big, BLACK, SAFE_X1 - SAFE_X0, 150, 70)
            if pop < 1.0:
                f = font(BLACK, max(20, int(f.size * (0.6 + 0.4 * pop))))
            col = self.theme["accent"] if self.s.get("theme") != "clean_navy" else (255, 255, 255)
            draw_centered(d, (SAFE_X0 + SAFE_X1) / 2, 380, big, f, col, 6, (0, 0, 0))
            if sub and t > 0.25:
                fs = fit_font(sub, SEMI, SAFE_X1 - SAFE_X0, 58, 36)
                draw_centered(d, (SAFE_X0 + SAFE_X1) / 2, 380 + f.size + 26, sub, fs,
                              (255, 255, 255), 4, (0, 0, 0))
        return frame

    def frame_stat(self, sc: Scene, t: float, idx: int) -> Image.Image:
        v = sc.visual
        frame = self.bg.copy()
        d = ImageDraw.Draw(frame)
        p = ease_out(t / 1.1)
        val = float(v["value"]) * p
        txt = f'{v.get("prefix", "")}{fmt_number(val, v.get("decimals"))}{v.get("suffix", "")}'
        final = f'{v.get("prefix", "")}{fmt_number(float(v["value"]), v.get("decimals"))}{v.get("suffix", "")}'
        f = fit_font(final, BLACK, SAFE_X1 - SAFE_X0, 300, 120)
        cx = (SAFE_X0 + SAFE_X1) / 2
        draw_centered(d, cx, 640, txt, f, self.theme["accent"], 0)
        fl = font(SEMI, 56)
        for i, line in enumerate(wrap(v.get("label", ""), fl, SAFE_X1 - SAFE_X0)):
            draw_centered(d, cx, 640 + f.size + 60 + i * 72, line, fl, self.theme["text"])
        return frame

    def frame_bars(self, sc: Scene, t: float, idx: int) -> Image.Image:
        v = sc.visual
        frame = self.bg.copy()
        d = ImageDraw.Draw(frame, "RGBA")
        items = v["items"]
        vmax = max(float(i["value"]) for i in items) or 1.0
        y = 520
        if v.get("title"):
            ft = font(BOLD, 50)
            d.text((SAFE_X0, y), v["title"].upper(), font=ft, fill=self.theme["muted"])
            y += 110
        fl, fv = font(BOLD, 56), font(BLACK, 64)
        bw = SAFE_X1 - SAFE_X0
        track = self.theme["track"]
        for k, it in enumerate(items):
            p = ease_out((t - 0.15 - 0.3 * k) / 0.9)
            d.text((SAFE_X0, y), it["label"], font=fl, fill=self.theme["text"])
            y += 82
            d.rounded_rectangle((SAFE_X0, y, SAFE_X1, y + 96), 48,
                                fill=track if len(track) == 4 else (*track, 255))
            frac = float(it["value"]) / vmax * p
            if frac > 0:
                x1 = SAFE_X0 + max(96, bw * frac)
                col = self.theme["accent"] if k == len(items) - 1 or len(items) == 1 else self.theme["accent2"]
                if k == 0 and len(items) > 1:
                    col = self.theme["accent2"] if self.s.get("theme") != "bold_bright" else (255, 255, 255)
                d.rounded_rectangle((SAFE_X0, y, x1, y + 96), 48, fill=col)
            label = f'{v.get("prefix", "")}{fmt_number(float(it["value"]) * p, None if float(it["value"]).is_integer() else 1)}{v.get("suffix", "")}'
            lw = fv.getlength(label)
            lx = min(SAFE_X0 + bw * max(frac, 0.0) + 20, SAFE_X1 - lw)
            on_bar = lx < SAFE_X0 + bw * frac
            fill = (20, 20, 20) if on_bar and self.s.get("theme") != "clean_navy" else self.theme["text"]
            if on_bar and self.s.get("theme") == "clean_navy":
                fill = (255, 255, 255)
            d.text((lx - (lw + 40 if on_bar else 0), y + 12), label, font=fv, fill=fill)
            y += 190
        return frame

    def frame_donut(self, sc: Scene, t: float, idx: int) -> Image.Image:
        v = sc.visual
        frame = self.bg.copy()
        d = ImageDraw.Draw(frame, "RGBA")
        cx, cy, r, w = (SAFE_X0 + SAFE_X1) // 2, 740, 270, 60
        box = (cx - r, cy - r, cx + r, cy + r)
        track = self.theme["track"]
        d.ellipse(box, outline=track if len(track) == 4 else (*track, 255), width=w)
        p = ease_out((t - 0.1) / 1.2)
        pct = float(v["value"]) * p
        if pct > 0.2:
            d.arc(box, -90, -90 + 360 * pct / 100, fill=self.theme["accent"], width=w)
        txt = f"{fmt_number(pct, 0 if float(v['value']).is_integer() else 1)}%"
        f = font(BLACK, 150)
        tw = f.getlength(txt)
        d.text((cx - tw / 2, cy - 98), txt, font=f, fill=self.theme["text"])
        fl = font(SEMI, 56)
        for i, line in enumerate(wrap(v.get("label", ""), fl, SAFE_X1 - SAFE_X0)):
            draw_centered(d, cx, cy + r + 50 + i * 68, line, fl, self.theme["text"])
        return frame

    def frame_text(self, sc: Scene, t: float, idx: int) -> Image.Image:
        v = sc.visual
        frame = self.bg.copy()
        d = ImageDraw.Draw(frame)
        cx = (SAFE_X0 + SAFE_X1) / 2
        maxw = SAFE_X1 - SAFE_X0

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
        p1 = ease_out_back(t / 0.4)
        if p1 > 0.05:
            ff = font(BLACK, max(20, int(f1.size * (0.75 + 0.25 * min(p1, 1.0)))))
            for line in l1:
                draw_centered(d, cx, y + (f1.size - ff.size) / 2, line, ff, self.theme["text"])
                y += f1.size + 14
        if l2 and t > 0.7:
            p2 = ease_out_back((t - 0.7) / 0.4)
            ff = font(BLACK, max(20, int(f2.size * (0.75 + 0.25 * min(p2, 1.0)))))
            y += 40
            for line in l2:
                draw_centered(d, cx, y + (f2.size - ff.size) / 2, line, ff, self.theme["accent"])
                y += f2.size + 12
        return frame

    def still(self, scene_index: int, t: float, scenes: list) -> Image.Image:
        """Single frame for previews (no audio needed)."""
        drawers = {"image": self.frame_image, "stat": self.frame_stat, "bars": self.frame_bars,
                   "donut": self.frame_donut, "text": self.frame_text}
        sc = scenes[scene_index]
        frame = drawers.get(sc.visual.get("type"), self.frame_text)(sc, t, scene_index)
        self._caption(frame, chunk_words(sc.words), min(t, sc.words[-1].end if sc.words else t))
        return frame

    # ---- assemble
    def prepare(self) -> list[Scene]:
        scenes = []
        for raw in self.s["scenes"]:
            sc = Scene(raw["narration"], raw["visual"])
            sc.audio = tts.synthesize(sc.narration)
            sc.duration = len(sc.audio) / tts.SAMPLE_RATE + SCENE_GAP
            sc.words = time_words(sc.narration, len(sc.audio) / tts.SAMPLE_RATE)
            scenes.append(sc)
        scenes[-1].duration += END_HOLD
        return scenes

    def render(self, out_path: Path) -> dict:
        scenes = self.prepare()
        sr = tts.SAMPLE_RATE
        audio = np.concatenate([np.pad(sc.audio, (0, int(round(sc.duration * sr)) - len(sc.audio)))
                                for sc in scenes])
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "voice.wav"
            sf.write(wav, audio, sr)
            total_frames = int(math.ceil(len(audio) / sr * FPS))
            cmd = ["ffmpeg", "-y", "-loglevel", "error",
                   "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                   "-i", str(wav),
                   "-c:v", "libx264", "-preset", os.environ.get("X264_PRESET", "veryfast"),
                   "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                   "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                   "-shortest", str(out_path)]
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            drawers = {"image": self.frame_image, "stat": self.frame_stat, "bars": self.frame_bars,
                       "donut": self.frame_donut, "text": self.frame_text}
            starts = np.cumsum([0] + [sc.duration for sc in scenes])
            chunks = [chunk_words(sc.words) for sc in scenes]
            for n in range(total_frames):
                gt = n / FPS
                si = int(np.searchsorted(starts, gt, side="right") - 1)
                si = min(si, len(scenes) - 1)
                sc, t = scenes[si], gt - starts[si]
                frame = drawers.get(sc.visual.get("type"), self.frame_text)(sc, t, si)
                self._caption(frame, chunks[si], t)
                if t < 0.13 and si > 0:  # small punch-in on each cut
                    z = 1.035 - 0.035 * (t / 0.13)
                    cw, ch = W / z, H / z
                    frame = frame.resize((W, H), Image.BILINEAR,
                                         box=((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2))
                proc.stdin.write(frame.tobytes())
            proc.stdin.close()
            if proc.wait() != 0:
                raise RuntimeError("ffmpeg failed")
        return {"path": str(out_path), "seconds": round(len(audio) / sr, 2), "scenes": len(scenes)}

    def _caption(self, frame: Image.Image, chunks: list[list[Word]], t: float):
        for ch in chunks:
            if ch[0].start - 0.05 <= t <= ch[-1].end + 0.05:
                hi = 0
                for i, w in enumerate(ch):
                    if t >= w.start:
                        hi = i
                img = self.captions.render(ch, hi)
                frame.paste(img, (0, CAPTION_Y - img.height // 2), img)
                return


def render_script(script_path: Path, out_path: Path) -> dict:
    script = json.loads(Path(script_path).read_text())
    return Renderer(script).render(out_path)
