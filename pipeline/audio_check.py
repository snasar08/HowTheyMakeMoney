"""Automatic listen-through of a rendered Short's audio. Catches the things Sam has flagged by
ear: lines run together in one breath, voice too fast or too slow, garbled words, the CTA
sentences blurring into each other, and clipping.

check() returns a list of issue strings (empty = all good) plus a few stats. run.py prints the
issues as GitHub warnings; with AUDIO_CHECK=strict a Short with issues is not delivered.
"""
from __future__ import annotations

import os
import re

import numpy as np

BREATH_MAX = float(os.environ.get("BREATH_MAX", "6.0"))  # longest speech run without a pause (s)
PAUSE_MIN = 0.12        # a gap this long counts as a breath
JOIN_MIN = 0.12         # the beat before the CTA must really be silent
SPS_MIN, SPS_MAX = 3.0, 7.5  # syllables/s; ~6 at speed 1.35, ~5.5 at Sam's current 1.25
SHORT_WORD = 0.06       # a 3+ letter word shorter than this is probably garbled/swallowed
MELODY_MIN = 2.5        # semitones of pitch movement per scene; below this reads as monotone


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return max(1, sum(ch.isdigit() for ch in word))  # "$4.5B" etc. are read as several syllables
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
        n -= 1
    return max(1, n)


def _silence_mask(voice: np.ndarray, sr: int, frame: float = 0.02) -> tuple[np.ndarray, float]:
    n = int(frame * sr)
    k = len(voice) // n
    rms = np.sqrt(np.mean(voice[: k * n].reshape(k, n) ** 2, axis=1))
    thresh = max(0.008, 0.06 * float(np.percentile(rms, 95)))
    return rms < thresh, frame


def _runs(mask: np.ndarray, value: bool) -> list[tuple[int, int]]:
    out, start = [], None
    for i, m in enumerate(np.append(mask, not value)):
        if m == value and start is None:
            start = i
        elif m != value and start is not None:
            out.append((start, i))
            start = None
    return out


def pitch(voice: np.ndarray, sr: int, hop: float = 0.01) -> np.ndarray:
    """F0 in Hz every `hop` s (0 = unvoiced). Plain autocorrelation, 70–300 Hz (male voice)."""
    n, h = int(0.04 * sr), int(hop * sr)
    lo, hi = int(sr / 300), int(sr / 70)
    out = np.zeros(max(0, (len(voice) - n) // h), np.float32)
    for k in range(len(out)):
        x = voice[k * h: k * h + n]
        x = x - x.mean()
        e = float(np.dot(x, x))
        if e < n * 1e-4:
            continue
        ac = np.correlate(x, x, "full")[n - 1 + lo: n - 1 + hi]
        lag = int(np.argmax(ac))
        if ac[lag] / e > 0.45:  # clearly periodic = voiced
            out[k] = sr / (lag + lo)
    return out


def melody(scenes, starts, voice: np.ndarray, sr: int) -> tuple[list[str], dict]:
    """Flat pitch = robotic. Measures how much the voice moves per scene (semitones, std over
    voiced frames). No question-rise test: "Why…?" questions fall at the end in real speech too.
    Calibration (Oct 26, speed 1.25, one sentence per call): am_fenrir 4.9, am_puck 4.1,
    am_eric 4.0, blends 3.9–4.2."""
    issues, spreads = [], []
    f0 = pitch(voice, sr)
    for i, sc in enumerate(scenes):
        seg = f0[int(starts[i] / 0.01): int((starts[i] + sc.duration) / 0.01)]
        v = seg[seg > 0]
        if len(v) < 30:
            continue
        s = float(np.std(12 * np.log2(v / np.median(v))))
        spreads.append(round(s, 2))
        if s < MELODY_MIN:
            issues.append(f"scene {i + 1}: voice sounds flat (pitch moves {s:.1f} semitones, want ≥ {MELODY_MIN})")
    return issues, {"pitch_spread_st": spreads}


def check(scenes, starts, joins, voice: np.ndarray, mix: np.ndarray, sr: int) -> tuple[list[str], dict]:
    issues: list[str] = []
    silent, fr = _silence_mask(voice, sr)

    # 1. one-breath runs: speech stretches with no pause of PAUSE_MIN or more
    min_pause = max(1, int(round(PAUSE_MIN / fr)))
    breaks = np.zeros_like(silent)
    for a, b in _runs(silent, True):
        if b - a >= min_pause:
            breaks[a:b] = True
    longest = 0.0
    for a, b in _runs(breaks, False):
        dur = (b - a) * fr
        longest = max(longest, dur)
        if dur > BREATH_MAX:
            issues.append(f"one-breath run of {dur:.1f}s at {a * fr:.1f}s (max {BREATH_MAX:.0f}s) — "
                          f"add a comma/period or split the line")

    # 2. speaking rate per scene (syllables, so short-word lines don't look fast), swallowed words
    rates = []
    for i, sc in enumerate(scenes):
        if not sc.words:
            issues.append(f"scene {i + 1}: no word timings (captions will drift)")
            continue
        talk = sc.words[-1].end - sc.words[0].start
        sps = sum(syllables(w.text) for w in sc.words) / talk if talk > 0 else 0
        rates.append(round(sps, 2))
        if not SPS_MIN <= sps <= SPS_MAX:
            issues.append(f"scene {i + 1}: {sps:.1f} syllables/s ({'too fast' if sps > SPS_MAX else 'too slow'})")
        for w in sc.words:
            letters = sum(ch.isalpha() for ch in w.text)
            if letters >= 3 and (w.end - w.start) < SHORT_WORD:
                issues.append(f"scene {i + 1}: '{w.text}' at {starts[i] + w.start:.1f}s is only "
                              f"{(w.end - w.start) * 1000:.0f}ms — may be garbled")

    # 3. CTA sentence joins really are silent gaps
    for si, a, b in joins:
        g0, g1 = int((starts[si] + a) / fr), int((starts[si] + b) / fr)
        seg = silent[g0:g1]
        if len(seg) and seg.mean() * (b - a) < JOIN_MIN * 0.9:
            issues.append(f"CTA join at {starts[si] + a:.1f}s isn't clearly silent — sentences may blur")

    # 4. clipping in the final mix
    clipped = float(np.mean(np.abs(mix) >= 0.999))
    if clipped > 0.0005:
        issues.append(f"{clipped * 100:.2f}% of samples clip — lower MUSIC_GAIN or voice level")

    mel_issues, mel = melody(scenes, starts, voice, sr)
    issues += mel_issues
    return issues, {"longest_breath": round(longest, 2), "clipped_pct": round(clipped * 100, 3),
                    "syllables_per_s": rates, **mel}
