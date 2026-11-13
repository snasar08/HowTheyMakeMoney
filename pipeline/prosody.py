"""Does a voice line sound like a person reading it? (Sam, Nov 13: "sounds so monotone", "it needs to sound
like as if you were reading it ... a test, and if it fails it redoes the voice until it passes")

Pure numpy, so the voice pre-pass and the render can both use it. For one sentence of audio:
  - pitch movement (semitone spread of the voiced frames): too flat = monotone, too wide = sing-song;
  - median pitch: in the normal adult male speaking range (not squeaky, not a growl);
  - pace (syllables per second, from the text): not dragging, not rushed.
`problems(audio, sr, text)` returns a list like ["flat:1.4st"]; empty = passes.

  python -m pipeline.prosody file.wav "the sentence"     # check one take
"""
from __future__ import annotations

import os
import re
import sys

import numpy as np

FLAT_ST = float(os.environ.get("PROSODY_FLAT_ST", "2.6"))      # below this a line sounds monotone
WIDE_ST = float(os.environ.get("PROSODY_WIDE_ST", "5.5"))      # above this it sounds sing-song / out of tune
HZ_LO, HZ_HI = 90.0, 175.0                                      # median pitch for this channel's male narrator
SYL_LO, SYL_HI = 2.6, 6.2                                       # syllables per second, before QWEN_SPEED
MIN_WORDS = 4                                                   # shorter lines can be flat on purpose ("Per restaurant.")


def pitch_track(a: np.ndarray, sr: int) -> np.ndarray:
    """Voiced-frame pitch in Hz (normalized autocorrelation, 40 ms frames, 10 ms hop, 70-300 Hz)."""
    a = np.asarray(a, np.float32).ravel()
    if sr != 16000:
        a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * 16000 / sr)), np.arange(len(a)), a).astype(np.float32)
        sr = 16000
    n, hop = 640, 160
    lo, hi = sr // 300, sr // 70
    if len(a) < n:
        return np.zeros(0, np.float32)
    rms_all = float(np.sqrt(np.mean(a ** 2))) + 1e-9
    out = []
    win = np.hanning(n).astype(np.float32)
    for i in range(0, len(a) - n, hop):
        f = a[i:i + n] * win
        if np.sqrt(np.mean(f ** 2)) < 0.25 * rms_all:
            continue
        f = f - f.mean()
        spec = np.fft.rfft(f, 2 * n)
        ac = np.fft.irfft(spec * np.conj(spec))[:n]
        if ac[0] <= 0:
            continue
        ac = ac / ac[0]
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] < 0.45:
            continue
        if 1 <= k < n - 1:                     # parabolic peak refinement
            y0, y1, y2 = ac[k - 1], ac[k], ac[k + 1]
            d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-9)
            k = k + float(np.clip(d, -0.5, 0.5))
        out.append(sr / k)
    f0 = np.asarray(out, np.float32)
    if len(f0) > 4:                            # drop octave jumps
        med = np.median(f0)
        f0 = f0[(f0 > med * 0.6) & (f0 < med * 1.7)]
    return f0


def syllables(text: str) -> int:
    n = 0
    for w in re.findall(r"[A-Za-z]+|\d+", text):
        if w.isdigit():
            n += 2 * len(w)                    # numbers are read as several words
        else:
            n += max(1, len(re.findall(r"[aeiouy]+", w.lower())) - (1 if w.lower().endswith("e") and len(w) > 3 else 0))
    return n


def measure(a, sr: int, text: str = "") -> dict:
    f0 = pitch_track(a, sr)
    st = 12 * np.log2(f0 / np.median(f0)) if len(f0) else np.zeros(0)
    a = np.asarray(a, np.float32).ravel()
    loud = np.flatnonzero(np.abs(a) > 0.02)
    dur = (loud[-1] - loud[0]) / sr if len(loud) > 1 else len(a) / sr
    return {"spread_st": round(float(np.std(st)), 2) if len(st) else 0.0,
            "median_hz": round(float(np.median(f0)), 1) if len(f0) else 0.0,
            "voiced_frames": int(len(f0)),
            "syl_per_s": round(syllables(text) / max(dur, 0.1), 2) if text else 0.0}


TARGET_ST = 3.6   # a lively but natural read; among passing takes the one nearest this wins


def badness(a, sr: int, text: str) -> float:
    """0 = ideal; used to rank takes that pass or fail equally."""
    m = measure(a, sr, text)
    return abs(m["spread_st"] - TARGET_ST)


def problems(a, sr: int, text: str) -> list[str]:
    if len(re.findall(r"[A-Za-z0-9]+", text)) < MIN_WORDS:
        return []
    m = measure(a, sr, text)
    out = []
    if m["voiced_frames"] < 20:
        return out                             # too little voiced audio to judge; the clarity check covers it
    if m["spread_st"] < FLAT_ST:
        out.append(f"flat:{m['spread_st']}st")
    elif m["spread_st"] > WIDE_ST:
        out.append(f"singsong:{m['spread_st']}st")
    if not HZ_LO <= m["median_hz"] <= HZ_HI:
        out.append(f"pitch:{m['median_hz']:.0f}Hz")
    if m["syl_per_s"] and m["syl_per_s"] < SYL_LO:
        out.append(f"slow:{m['syl_per_s']}syl/s")
    elif m["syl_per_s"] > SYL_HI:
        out.append(f"rushed:{m['syl_per_s']}syl/s")
    return out


if __name__ == "__main__":
    import soundfile as sf
    w, r = sf.read(sys.argv[1], dtype="float32")
    if w.ndim > 1:
        w = w.mean(1)
    t = sys.argv[2] if len(sys.argv) > 2 else ""
    print(measure(w, r, t), problems(w, r, t) if t else "")
