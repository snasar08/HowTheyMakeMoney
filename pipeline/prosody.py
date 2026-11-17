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


CHANNEL_HZ = float(os.environ.get("CHANNEL_HZ", "131"))        # the channel's voiced median (Nike 119 sounds right at ~131)
LEVEL_MIN_ST = float(os.environ.get("LEVEL_MIN_ST", "-1.5"))     # total pitch shift stays inside this window: always still Umbriel
LEVEL_MAX_ST = float(os.environ.get("LEVEL_MAX_ST", "3.0"))
LINE_OFF_ST = float(os.environ.get("LEVEL_LINE_OFF_ST", "2.0"))  # a line this far from the Short's median gets nudged
LINE_NUDGE_MAX = 2.0


def short_median(pieces, sr: int) -> float:
    """Voiced median Hz over all the audio of a Short (pooled frames; 0 if nothing voiced)."""
    f = [pitch_track(p, sr) for p in pieces]
    f = np.concatenate(f) if f else np.zeros(0)
    return float(np.median(f)) if len(f) else 0.0


def level_plan(pieces, texts, sr: int, shift_now: float, target: float | None = None, in_pieces: float = 0.0):
    """Free post-processing plan, no new TTS requests. `pieces` are the lines of ONE Short carrying `in_pieces` semitones
    of shift; the listener will hear `shift_now` in total (the render still adds the rest). Returns (short_delta_st, [line_nudge_st],
    info): the Short-level change that brings the pooled median to `target` with the total shift kept in
    [LEVEL_MIN_ST, LEVEL_MAX_ST], and a per-line nudge (max +-2 st) for lines far from the Short's median."""
    target = target or CHANNEL_HZ
    k = 2 ** ((shift_now - in_pieces) / 12)
    med = short_median(pieces, sr) * k
    if not med:
        return 0.0, [0.0] * len(pieces), {"median_hz": 0.0}
    want = 12 * np.log2(target / med)
    delta = float(np.clip(shift_now + want, LEVEL_MIN_ST, LEVEL_MAX_ST) - shift_now)
    new_med = med * 2 ** (delta / 12)
    nudges, devs = [], []
    for p, t in zip(pieces, texts):
        m = measure(p, sr)
        ok = m["median_hz"] and m["voiced_frames"] >= 20 and len(re.findall(r"[A-Za-z0-9]+", t)) >= MIN_WORDS
        d = 12 * np.log2(m["median_hz"] * k * 2 ** (delta / 12) / new_med) if ok else 0.0
        devs.append(d)
        if abs(d) > LINE_OFF_ST:
            nudges.append(float(-np.sign(d) * min(LINE_NUDGE_MAX, abs(d) - 0.5)))   # gentle: stop 0.5 st short of the median
        else:
            nudges.append(0.0)
    return delta, nudges, {"median_hz": med, "new_median_hz": new_med, "line_dev_st": devs}


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
