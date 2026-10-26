"""Make one video that plays the same line in several voices, numbered on screen,
so the narrator can be picked by ear.

    python -m pipeline.voice_samples out/voice-samples.mp4
    VOICE_SAMPLE_ENGINE=ming python -m pipeline.voice_samples out/voice-ming.mp4
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw

from . import tts
from .render import BLACK, SEMI, H, W, draw_centered, font, gradient

LINE = ("Costco sold almost 300 billion dollars of stuff last year. "
        "But selling stuff isn't really how it makes money.")

KOKORO_VOICES = [
    ("am_michael", "Male, American (current)"),
    ("am_fenrir", "Male, American, deeper"),
    ("am_puck", "Male, American, upbeat"),
    ("am_onyx", "Male, American, low"),
    ("bm_george", "Male, British"),
    ("bm_fable", "Male, British, storyteller"),
    ("af_heart", "Female, American (Kokoro's top rated)"),
    ("af_bella", "Female, American, energetic"),
]


def card(n: int, title: str, sub: str) -> Image.Image:
    img = gradient((10, 14, 12), (16, 40, 26))
    d = ImageDraw.Draw(img)
    draw_centered(d, W / 2, 560, f"VOICE {n}", font(BLACK, 170), (57, 255, 106))
    draw_centered(d, W / 2, 800, title, font(BLACK, 90), (255, 255, 255))
    draw_centered(d, W / 2, 930, sub, font(SEMI, 52), (170, 200, 180))
    return img


def build(items, out: Path):
    sr = tts.SAMPLE_RATE
    audio_parts, frames = [], []
    for n, (title, sub, a) in enumerate(items, 1):
        a = np.concatenate([np.zeros(int(0.35 * sr), np.float32), a, np.zeros(int(0.6 * sr), np.float32)])
        audio_parts.append(a)
        frames.append((card(n, title, sub), len(a) / sr))
    audio = np.concatenate(audio_parts)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        sf.write(wav, audio, sr)
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{W}x{H}", "-r", "30", "-i", "-", "-i", str(wav), "-c:v", "libx264",
               "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac",
               "-b:a", "160k", "-shortest", str(out)]
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for img, secs in frames:
            raw = img.tobytes()
            for _ in range(int(round(secs * 30))):
                p.stdin.write(raw)
        p.stdin.close()
        if p.wait() != 0:
            raise RuntimeError("ffmpeg failed")


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "out/voice-samples.mp4")
    text = tts.speakable(LINE)
    items = []
    if os.environ.get("VOICE_SAMPLE_ENGINE") == "ming":
        t0 = time.time()
        a, _ = tts.ming(text)
        took = time.time() - t0
        secs = len(a) / tts.SAMPLE_RATE
        print(f"::notice title=Ming-3.0 on CPU::{secs:.1f}s of speech took {took:.0f}s to generate "
              f"({took / max(secs, 0.1):.1f}x real time)")
        items.append(("Ming-3.0 US_James", "Experimental, higher-rated model", tts.normalize(a)))
    else:
        for v, desc in KOKORO_VOICES:
            for speed in (1.2,):
                a, _ = tts.kokoro(text, voice=v, speed=speed)
                items.append((v, f"{desc} · speed {speed}", tts.normalize(a)))
    build(items, out)
    print(f"[voices] wrote {out}")


if __name__ == "__main__":
    main()
