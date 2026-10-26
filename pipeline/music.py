"""Background music, synthesized from scratch with numpy (so there is nothing to license and
nothing for Content ID to match). bed() returns a mono float32 lo-fi loop: pad chords, a soft
arpeggio, sub bass and a light kick/hat groove. The key, progression and tempo are picked from
a seed (the script slug), so every Short gets its own track and re-renders sound the same.
duck() lowers the bed while the voice is talking.

MUSIC_GAIN env var sets the bed level (default 0.12; 0 turns music off).
"""
from __future__ import annotations

import hashlib
import os

import numpy as np

MUSIC_GAIN = float(os.environ.get("MUSIC_GAIN", "0.12"))

# Progressions as scale degrees (0 = tonic) in a major key; all loop cleanly.
PROGRESSIONS = [
    [5, 3, 0, 4],   # vi IV I V
    [0, 4, 5, 3],   # I V vi IV
    [3, 4, 2, 5],   # IV V iii vi
    [0, 5, 3, 4],   # I vi IV V
]
MAJOR = [0, 2, 4, 5, 7, 9, 11]


def _hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def _chord(root_midi: int, degree: int) -> list[int]:
    notes = []
    for step in (0, 2, 4, 6):  # 7th chord from stacked thirds
        d = degree + step
        notes.append(root_midi + MAJOR[d % 7] + 12 * (d // 7))
    return notes


def _tone(freq: float, n: int, sr: int, harmonics=(1.0, 0.35, 0.12)) -> np.ndarray:
    t = np.arange(n) / sr
    out = np.zeros(n, np.float32)
    for k, a in enumerate(harmonics, 1):
        out += a * np.sin(2 * np.pi * freq * k * t)
    return out


def _env(n: int, sr: int, attack: float, release: float) -> np.ndarray:
    a, r = max(1, int(attack * sr)), max(1, int(release * sr))
    e = np.ones(n, np.float32)
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def bed(seconds: float, sr: int, seed: str = "") -> np.ndarray:
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    rng = np.random.default_rng(h % 2**32)
    key = 57 + h % 7                       # tonic between A3 and D#4
    prog = PROGRESSIONS[(h >> 8) % len(PROGRESSIONS)]
    bpm = 84 + (h >> 16) % 14              # 84-97 bpm, lo-fi range
    beat = 60.0 / bpm
    bar = 4 * beat
    total = int(seconds * sr) + sr
    out = np.zeros(total, np.float32)

    def add(sig: np.ndarray, start: float):
        i = int(start * sr)
        if i >= total:
            return
        seg = sig[: total - i]
        out[i:i + len(seg)] += seg

    nb = int(bar * sr)
    t_bar = 0.0
    bar_i = 0
    while t_bar < seconds + bar:
        chord = _chord(key, prog[bar_i % len(prog)])
        # pad: whole bar, slow swell
        pad = sum(_tone(_hz(m), nb, sr, (1.0, 0.2)) for m in chord) / len(chord)
        add(pad * _env(nb, sr, 0.35, 0.5) * 0.30, t_bar)
        # sub bass on beats 1 and 3
        for b in (0, 2):
            nn = int(beat * 1.6 * sr)
            add(_tone(_hz(chord[0] - 24), nn, sr, (1.0, 0.1)) * _env(nn, sr, 0.01, 0.3) * 0.45,
                t_bar + b * beat)
        # arpeggio in 8ths, one octave up, soft pluck
        pattern = [0, 1, 2, 3, 2, 1, 2, 3]
        for s, p in enumerate(pattern):
            nn = int(beat * 0.5 * sr)
            pluck = _tone(_hz(chord[p] + 12), nn, sr, (1.0, 0.25, 0.05))
            decay = np.exp(-np.arange(nn) / (0.12 * sr)).astype(np.float32)
            vel = 0.10 + 0.04 * rng.random()
            add(pluck * decay * _env(nn, sr, 0.003, 0.02) * vel, t_bar + s * beat * 0.5)
        # drums: kick on 1 and 3, hat on the off-beats
        for b in range(4):
            if b in (0, 2):
                nn = int(0.25 * sr)
                tt = np.arange(nn) / sr
                kick = np.sin(2 * np.pi * (45 + 70 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 14)
                add(kick.astype(np.float32) * 0.55, t_bar + b * beat)
            nn = int(0.05 * sr)
            hat = rng.standard_normal(nn).astype(np.float32)
            hat = np.diff(hat, prepend=0) * np.exp(-np.arange(nn) / (0.012 * sr))
            add(hat * 0.05, t_bar + (b + 0.5) * beat)
        t_bar += bar
        bar_i += 1

    out = out[: int(seconds * sr)]
    # gentle low-pass for the lo-fi feel
    k = np.ones(6, np.float32) / 6
    out = np.convolve(out, k, mode="same")
    fade = min(len(out), int(1.2 * sr))
    out[-fade:] *= np.linspace(1, 0, fade)
    fin = min(len(out), int(0.3 * sr))
    out[:fin] *= np.linspace(0, 1, fin)
    peak = float(np.max(np.abs(out))) or 1.0
    return (out / peak).astype(np.float32)


def duck(music: np.ndarray, voice: np.ndarray, sr: int, depth: float = 0.45) -> np.ndarray:
    """Scale music down to `depth` while the voice is active, with smooth attack/release."""
    win = int(0.05 * sr)
    energy = np.sqrt(np.convolve(voice[: len(music)] ** 2, np.ones(win) / win, mode="same"))
    active = (energy > 0.02).astype(np.float32)
    # widen speech by 0.2 s each side so the music is already down when a word starts —
    # otherwise the first consonant of a line gets masked ("Food" heard as "ood")
    pad = int(0.2 * sr)
    active = (np.convolve(active, np.ones(2 * pad + 1), mode="same") > 0).astype(np.float32)
    smooth = np.convolve(active, np.ones(int(0.15 * sr)) / int(0.15 * sr), mode="same")
    gain = 1.0 - (1.0 - depth) * np.clip(smooth, 0, 1)
    return music * gain.astype(np.float32)
