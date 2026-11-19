"""Music + sound effects for the flat 2D silent films (Nov 19). Everything is synthesized with numpy, nothing to license.

Style target = the "Day One" films measured in C:/Users/rsn/tools/dayone-breakdown (DISCIPLINE 8atK0pF4oJY, DOPAMINE, ROOTS):
96 BPM (beat 0.625 s), F pedal drone + sparse piano, ticking clock 0.5 s -> 0.25 s, "silence then slam" on flashes,
swish-before-thud punches, riser -> hit, warm piano arpeggio finale, boom on the title, last 0.5 s silent.

Beat keys read here (film2d.py documents them for the author):
  "music": drone | tick | pulse96 | montage | slam | finale | title | silent   (a beat without it keeps the previous section;
           "mood" or a "card" can pick one when "music" is missing, see MOOD_TAG)
  "sfx":   [["alarm", 0.2], ["punch", 1.25], ["riser", 2.0, {"len": 2}], ["coin", 0.5, 0.8]]   [name, seconds into the beat, extra]
           extra = a number (loudness multiplier) or a dict of options (gain, pan, plus the sound's own options, see SFX_OPTS).
           Offsets mean "the moment you SEE it": riser, punch, swish END/LAND exactly on the offset, the rest start there.
  "flash": [0.1]  -> every flash gets the 0.3 s dropout + broadband slam + sub hit automatically.
Film key "grid": 0.625  -> every cut is snapped onto the beat grid (2 beats = 1.25 s, a bar = 2.5 s) by snap_film().

  python -m pipeline.score2d measure file.wav [ref.wav]   # LUFS, true peak, per-2-s loudness, onsets
"""
from __future__ import annotations

import sys
import wave
from functools import lru_cache
from pathlib import Path

import numpy as np

SR = 48000
BPM = 96
BEAT = 60.0 / BPM          # 0.625 s
BAR = BEAT * 4             # 2.5 s
TARGET_LUFS = -16.5
TP_CEIL = -1.0             # dBTP
SLAM_TRIM = 10 ** (-4 / 20)   # our slam hit sat ~4 dB hotter than the reference's: lowered 4 dB
ROOM_DB = -5.0             # pre-master level of the room tone: lands the post-master dropout at about -23 dB RMS (the reference), our old hole was -41

# beat "mood" words -> music section when the beat has no "music" key
MOOD_TAG = {"night": "drone", "dark": "drone", "quiet": "drone", "calm": "drone", "tense": "tick", "clock": "tick",
            "groove": "pulse96", "fight": "montage", "train": "montage", "flash": "slam", "sunrise": "finale",
            "hope": "finale", "win": "finale", "title": "title", "end": "silent"}
TAGS = ("drone", "tick", "pulse96", "montage", "slam", "finale", "title", "silent")


# ------------------------------------------------------------------ tiny DSP toolbox
def _rng(name: str) -> np.random.Generator:
    return np.random.default_rng(sum(ord(c) * (i + 7) for i, c in enumerate(name)))     # same noise every run


def _t(n: int) -> np.ndarray:
    return np.arange(n) / SR


def _filt(x: np.ndarray, lo: float | None = None, hi: float | None = None, order: int = 2) -> np.ndarray:
    """zero-phase band limiting in the frequency domain: lo = high-pass corner, hi = low-pass corner (Hz)"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    mag = np.ones_like(f)
    if hi:
        mag /= np.sqrt(1 + (f / hi) ** (2 * order))
    if lo:
        r = (f / lo) ** order
        mag *= r / np.sqrt(1 + r * r)
    return np.fft.irfft(X * mag, len(x)).astype(np.float32)


def _noise(n: int, name: str, lo=None, hi=None) -> np.ndarray:
    return _filt(_rng(name).standard_normal(n).astype(np.float32), lo, hi)


def _decay(n: int, tau: float, att: float = 0.002) -> np.ndarray:
    t = _t(n)
    return (np.exp(-t / tau) * np.minimum(1, t / max(att, 1e-4))).astype(np.float32)


def _sweep(n: int, f0: float, f1: float, tau: float | None = None) -> np.ndarray:
    """sine whose pitch glides f0 -> f1: exponential with time constant tau, or log-linear over the whole length"""
    t = _t(n)
    f = f1 + (f0 - f1) * np.exp(-t / tau) if tau else f0 * (f1 / f0) ** (t / (n / SR))
    return np.sin(2 * np.pi * np.cumsum(f) / SR).astype(np.float32)


def _mid(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def _norm(x: np.ndarray, peak: float = 1.0) -> np.ndarray:
    m = float(np.max(np.abs(x))) or 1.0
    return (x / m * peak).astype(np.float32)


# ------------------------------------------------------------------ sound effects (each returns a mono array, peak ~1)
@lru_cache(maxsize=None)
def s_boom(dur: float = 3.0, f0: float = 95.0, f1: float = 40.0) -> np.ndarray:
    """sub boom: low sine that falls in pitch and rings out (the 'boom drops')"""
    n = int(dur * SR)
    x = _sweep(n, f0, f1, tau=0.35) * _decay(n, dur / 4.5, 0.004)
    x += 0.25 * _sweep(n, f0 * 2, f1 * 2, tau=0.3) * _decay(n, dur / 9, 0.004)
    return _norm(np.tanh(1.3 * x))


@lru_cache(maxsize=None)
def s_kick(dur: float = 0.55) -> np.ndarray:
    """808-style kick: pitch drops 170 -> 36 Hz"""
    n = int(dur * SR)
    x = _sweep(n, 170, 36, tau=0.045) * _decay(n, dur / 3.2, 0.001)
    c = int(0.01 * SR)
    x[:c] += 0.25 * _noise(c, "kickclick", 1500, 6000) * _decay(c, 0.003)
    return _norm(np.tanh(1.5 * x))


@lru_cache(maxsize=None)
def s_thud(dur: float = 0.4) -> np.ndarray:
    """punch / impact thud: short low body + dull noise slap"""
    n = int(dur * SR)
    x = _sweep(n, 120, 48, tau=0.035) * _decay(n, 0.09, 0.001)
    sl = int(0.12 * SR)
    x[:sl] += 0.7 * _noise(sl, "thudslap", 80, 1800) * _decay(sl, 0.03, 0.0005)
    return _norm(np.tanh(1.4 * x))


@lru_cache(maxsize=None)
def s_swish(dur: float = 0.4) -> np.ndarray:
    """wind-up swish (centroid ~3 kHz): band noise that swells then cuts; ends at the end of the array"""
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    env = (t ** 2.2) * np.minimum(1, (1 - t) * 14)
    return _norm(_noise(n, "swish", 1500, 6500) * env.astype(np.float32))


@lru_cache(maxsize=None)
def s_tick(bright: float = 1.0) -> np.ndarray:
    """clock / UI tick: very short high click"""
    n = int(0.03 * SR)
    t = _t(n)
    x = _noise(n, "tick", 2500, 9000) * _decay(n, 0.0025, 0.0003) + 0.6 * np.sin(2 * np.pi * 3100 * bright * t) * _decay(n, 0.004, 0.0003)
    return _norm(x)


@lru_cache(maxsize=None)
def s_hat() -> np.ndarray:
    n = int(0.05 * SR)
    return _norm(_noise(n, "hat", 6000, None) * _decay(n, 0.012, 0.0005))


@lru_cache(maxsize=None)
def s_beep(f: float = 2100.0, dur: float = 0.12) -> np.ndarray:
    n = int(dur * SR)
    t = _t(n)
    x = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 3 * f * t)    # 2.1 kHz + the 6.3 kHz harmonic
    env = np.minimum(1, np.minimum(t / 0.004, (dur - t) / 0.006))
    return _norm(x * env)


def s_alarm(n: int = 12, dt: float = 0.25, f: float = 2100.0) -> np.ndarray:
    """alarm: n beeps of 2.1 kHz exactly dt (0.25 s) apart"""
    out = np.zeros(int((n * dt + 0.2) * SR), np.float32)
    b = s_beep(f)
    for k in range(int(n)):
        i = int(round(k * dt * SR))
        out[i:i + len(b)] += b
    return out


def s_ticks(n: int = 8, dt: float = 0.5, accel: float = 1.0) -> np.ndarray:
    """a run of clock ticks; accel < 1 shortens the gap after every tick"""
    gaps = [dt * accel ** k for k in range(int(n))]
    out = np.zeros(int((sum(gaps) + 0.1) * SR), np.float32)
    tk, t = s_tick(), 0.0
    for g in gaps:
        i = int(t * SR)
        out[i:i + len(tk)] += tk
        t += g
    return out


@lru_cache(maxsize=None)
def s_ping(f: float = 1900.0, dur: float = 0.6) -> np.ndarray:
    """notification ping: short bell-like tone"""
    n = int(dur * SR)
    t = _t(n)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.12) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.05)
    return _norm(x * np.minimum(1, t / 0.002))


@lru_cache(maxsize=None)
def s_buzz(n: int = 3) -> np.ndarray:
    """phone buzz: n gated 180 Hz vibration pulses"""
    pulse = int(0.16 * SR)
    t = _t(pulse)
    p = sum(np.sin(2 * np.pi * 180 * k * t) / k for k in (1, 2, 3, 5, 8)) * np.minimum(1, np.minimum(t / 0.01, (0.16 - t) / 0.02))
    out = np.zeros(int((n * 0.27 + 0.1) * SR), np.float32)
    for k in range(n):
        i = int(k * 0.27 * SR)
        out[i:i + pulse] += p
    return _norm(out)


@lru_cache(maxsize=None)
def s_ring() -> np.ndarray:
    """phone ring: double tone, twice"""
    n = int(0.4 * SR)
    t = _t(n)
    b = (np.sin(2 * np.pi * 880 * t) + np.sin(2 * np.pi * 960 * t)) * np.minimum(1, np.minimum(t / 0.01, (0.4 - t) / 0.02))
    out = np.zeros(int(1.1 * SR), np.float32)
    out[:n] += b
    out[int(0.55 * SR):int(0.55 * SR) + n] += b
    return _norm(out)


@lru_cache(maxsize=None)
def s_lowbatt() -> np.ndarray:
    """low-battery double beep (700 + 900 Hz)"""
    out = np.zeros(int(0.7 * SR), np.float32)
    for k, f in enumerate((700, 900)):
        b = s_beep(f, 0.18)
        i = int(k * 0.3 * SR)
        out[i:i + len(b)] += b
    return out


@lru_cache(maxsize=None)
def s_powerdown(dur: float = 1.0) -> np.ndarray:
    """power-down: sine sweeping 1 kHz -> 30 Hz"""
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    return _norm(_sweep(n, 1000, 30) * (1 - t) ** 1.2 * np.minimum(1, t * 200).astype(np.float32))


@lru_cache(maxsize=None)
def s_riser(dur: float = 2.0) -> np.ndarray:
    """riser: a 300 Hz -> 2 kHz sweep + noise that opens up to 9 kHz; it ENDS at the end of the array (the hit follows)"""
    n = int(dur * SR)
    r = np.linspace(0, 1, n).astype(np.float32)
    lo, hi = _noise(n, "riserlo", 300, 2000), _noise(n, "riserhi", 2500, 9000)
    x = (0.55 * _sweep(n, 300, 2000) + (1 - r) * lo + r * 1.3 * hi) * r ** 2.2
    x[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))
    return _norm(x)


@lru_cache(maxsize=None)
def s_slam(dur: float = 1.6) -> np.ndarray:
    """white-flash slam: broadband noise crash + sub hit + crack"""
    n = int(dur * SR)
    x = 1.1 * _noise(n, "slamnoise", 60, 12000) * _decay(n, 0.22, 0.0008)
    x += 1.2 * s_boom(dur, 80, 34)[:n]
    x += 0.8 * _noise(n, "slamcrack", 1500, 9000) * _decay(n, 0.03, 0.0003)
    return _norm(np.tanh(1.1 * x))


@lru_cache(maxsize=None)
def s_step(freq: float = 130.0) -> np.ndarray:
    n = int(0.16 * SR)
    x = _sweep(n, freq, freq * 0.5, tau=0.03) * _decay(n, 0.04, 0.001) + 0.6 * _noise(n, "step", 100, 1400) * _decay(n, 0.02, 0.0005)
    return _norm(x)


def s_steps(n: int = 4, dt: float = 0.42) -> np.ndarray:
    """footsteps, one every dt (heavy ones 0.42 s)"""
    out = np.zeros(int((n * dt + 0.3) * SR), np.float32)
    for k in range(int(n)):
        st = s_step(120 + 20 * (k % 2))
        i = int(k * dt * SR)
        out[i:i + len(st)] += st * (0.8 + 0.2 * (k % 2))
    return out


@lru_cache(maxsize=None)
def s_whoosh(dur: float = 0.6) -> np.ndarray:
    """whoosh: airy swell"""
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    return _norm(_noise(n, "whoosh", 500, 5000) * np.sin(np.pi * t ** 0.8).astype(np.float32) ** 1.5)


@lru_cache(maxsize=None)
def s_page() -> np.ndarray:
    """page flip: short flutter of high noise"""
    n = int(0.35 * SR)
    t = np.linspace(0, 1, n)
    return _norm(_noise(n, "page", 1500, 7000) * (np.sin(np.pi * t) ** 2 * (1 + 0.5 * np.sin(2 * np.pi * 14 * t))).astype(np.float32))


def s_bounce(n: int = 5, dt: float = 0.55, shrink: float = 0.78) -> np.ndarray:
    """basketball bouncing: hollow thumps whose gaps and loudness shrink"""
    gaps = [dt * shrink ** k for k in range(int(n))]
    out = np.zeros(int((sum(gaps) + 0.4) * SR), np.float32)
    t, m = 0.0, int(0.2 * SR)
    for k, g in enumerate(gaps):
        b = _sweep(m, 200, 95, tau=0.02) * _decay(m, 0.05, 0.0008) + 0.5 * _noise(m, "bounce", 200, 2500) * _decay(m, 0.015, 0.0005)
        i = int(t * SR)
        out[i:i + m] += _norm(b) * (0.75 ** k)
        t += g
    return out


@lru_cache(maxsize=None)
def s_crowd(dur: float = 2.5) -> np.ndarray:
    """crowd murmur swell (basketball): filtered noise with a slow roar"""
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    wob = 1 + 0.25 * np.sin(2 * np.pi * 5 * t * dur) * np.sin(2 * np.pi * 1.3 * t * dur)
    return _norm(_noise(n, "crowd", 250, 2800) * (np.sin(np.pi * t) ** 1.2 * wob).astype(np.float32))


@lru_cache(maxsize=None)
def s_coin(f: float = 2650.0) -> np.ndarray:
    """coin clink: two bright inharmonic rings"""
    n = int(0.45 * SR)
    t = _t(n)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.09) + 0.7 * np.sin(2 * np.pi * f * 1.51 * t) * np.exp(-t / 0.06)
    return _norm(x * np.minimum(1, t / 0.001))


@lru_cache(maxsize=None)
def s_register() -> np.ndarray:
    """cash register 'ka-ching': drawer thump, then two bells"""
    out = np.zeros(int(1.3 * SR), np.float32)
    th = s_thud(0.25) * 0.9
    out[:len(th)] += th
    n = int(0.9 * SR)
    t = _t(n)
    for dt, f in ((0.12, 2093.0), (0.2, 3136.0)):
        b = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.0 * t)) * np.exp(-t / 0.25) * np.minimum(1, t / 0.002)
        i = int(dt * SR)
        out[i:i + n] += 0.6 * _norm(b)
    return _norm(out)


@lru_cache(maxsize=None)
def s_heart(n: int = 2) -> np.ndarray:
    """heartbeat: lub-dub"""
    out = np.zeros(int((0.3 * n + 0.5) * SR), np.float32)
    m = int(0.35 * SR)
    for k in range(n):
        b = _sweep(m, 75, 42, tau=0.05) * _decay(m, 0.12, 0.004)
        i = int(k * 0.28 * SR)
        out[i:i + m] += b * (1 if k == 0 else 0.7)
    return _norm(out)


# name -> (builder, default gain, pan, anchor)
#   anchor "end": the sound's last instant lands on the offset (it builds up to it); "punch": swish 0.65 s before + thud on it
SFX = {
    "alarm": (s_alarm, 0.30, 0.0, "start"), "tick": (s_tick, 0.30, 0.0, "start"), "ticks": (s_ticks, 0.30, 0.0, "start"),
    "boom": (s_boom, 0.75, 0.0, "start"), "kick": (s_kick, 0.8, 0.0, "start"), "swish": (s_swish, 0.45, 0.0, "end"),
    "thud": (s_thud, 0.9, 0.0, "start"), "hit": (s_thud, 0.9, 0.0, "start"),
    "punch": (None, 0.0, 0.0, "punch"), "ping": (s_ping, 0.30, 0.15, "start"), "buzz": (s_buzz, 0.35, 0.0, "start"),
    "ring": (s_ring, 0.30, 0.0, "start"), "lowbatt": (s_lowbatt, 0.28, 0.0, "start"), "powerdown": (s_powerdown, 0.35, 0.0, "start"),
    "riser": (s_riser, 0.50, 0.0, "end"), "slam": (s_slam, 1.3 * SLAM_TRIM, 0.0, "start"), "steps": (s_steps, 0.55, 0.0, "start"),
    "whoosh": (s_whoosh, 0.40, 0.0, "start"), "page": (s_page, 0.40, 0.0, "start"), "bounce": (s_bounce, 0.65, 0.0, "start"),
    "crowd": (s_crowd, 0.30, 0.0, "start"), "coin": (s_coin, 0.30, 0.2, "start"), "register": (s_register, 0.45, 0.0, "start"),
    "heart": (s_heart, 0.9, 0.0, "start"), "bell": (lambda: s_ping(1200.0, 1.2), 0.30, 0.0, "start"),
    "duck": (None, 0.0, 0.0, "duck"),     # ["duck", t, {"dur": 0.3}]: mute the music for a moment (silence as punctuation)
}
# options a sfx entry may carry in its dict (key in the dict -> argument of the builder)
SFX_OPTS = {"alarm": ("n", "dt", "f"), "ticks": ("n", "dt", "accel"), "boom": ("dur", "f0", "f1"), "riser": ("dur",), "steps": ("n", "dt"),
            "bounce": ("n", "dt", "shrink"), "ping": ("f",), "coin": ("f",), "crowd": ("dur",), "whoosh": ("dur",), "buzz": ("n",)}


def _sfx_array(name: str, opts: dict) -> np.ndarray:
    kw = {k: opts[k] for k in SFX_OPTS.get(name, ()) if k in opts}
    if name == "riser" and "len" in opts:
        kw["dur"] = opts["len"]
    return SFX[name][0](**kw)


def _place(buf: np.ndarray, sig: np.ndarray, t: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """add a mono sound into the stereo buffer (2, N) at time t (seconds, may start before 0)"""
    i = int(round(t * SR))
    a, b = max(0, i), min(buf.shape[1], i + len(sig))
    if b <= a:
        return
    seg = sig[a - i:b - i] * gain
    th = (pan + 1) * np.pi / 4
    buf[0, a:b] += seg * np.cos(th)
    buf[1, a:b] += seg * np.sin(th)


# ------------------------------------------------------------------ plan helpers: beat grid, sections, events
def snap_film(film: dict, grid: float | None = None) -> dict:
    """Move every cut onto the tempo grid (default: film "grid", else the 96 BPM beat 0.625 s) without drifting: the cumulative
    cut times are rounded, so a run of 1.25 s shots stays exactly 2 beats each. A beat with "nosnap": true keeps its length."""
    grid = grid or film.get("grid") or BEAT
    out = dict(film)
    beats, t_raw, t_snap = [], 0.0, 0.0
    for b in film["beats"]:
        b = dict(b)
        t_raw += b["s"]
        t_new = t_snap + b["s"] if b.get("nosnap") else max(t_snap + grid, round(t_raw / grid) * grid)
        b["s"] = round(t_new - t_snap, 6)
        t_snap = t_new
        beats.append(b)
    out["beats"] = beats
    return out


def prepare(film: dict) -> dict:
    """apply the film-level "grid" snap (idempotent)"""
    return snap_film(film) if film.get("grid") else film


def sections(film: dict) -> list[dict]:
    """merge beats into music sections [{tag, t0, t1}]"""
    out, t, cur = [], 0.0, "drone"
    for i, b in enumerate(film["beats"]):
        tag = b.get("music") or MOOD_TAG.get(b.get("mood", ""))
        if tag is None and (b.get("card") or {}).get("big"):
            tag = "title"
        cur = tag or cur
        if cur not in TAGS:
            raise SystemExit(f"beat {i}: unknown music tag {cur!r} (use one of {TAGS})")
        if out and out[-1]["tag"] == cur:
            out[-1]["t1"] = t + b["s"]
        else:
            out.append({"tag": cur, "t0": t, "t1": t + b["s"]})
        t += b["s"]
    return out


def sfx_events(film: dict) -> list[tuple[str, float, dict]]:
    """(name, absolute seconds, options) for every "sfx" entry; flash beats add the slam"""
    ev, t = [], 0.0
    for b in film["beats"]:
        for e in b.get("sfx", []):
            name, off = e[0], (e[1] if len(e) > 1 else 0.0)
            ex = e[2] if len(e) > 2 else {}
            ex = {"gain": float(ex)} if isinstance(ex, (int, float)) else dict(ex)
            if name not in SFX:
                print(f"score2d: unknown sfx {name!r} ignored (known: {', '.join(sorted(SFX))})")
                continue
            ev.append((name, t + off, ex))
        for off in b.get("flash", []) or []:
            if not any(n == "slam" and abs(tt - (t + off)) < 0.05 for n, tt, _ in ev):
                ev.append(("slam", t + off, {}))
        t += b["s"]
    return sorted(ev, key=lambda e: e[1])


# ------------------------------------------------------------------ music
# dark chords over an F pedal (Dm Bb F C) and the same chords re-ordered for the hopeful finale (F C Dm Bb)
PROG_DARK = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]
PROG_HOPE = [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]]
# arpeggio notes (300-700 Hz piano register) for the same chords
ARP_DARK = [[62, 65, 69, 74], [58, 62, 65, 70], [60, 65, 69, 72], [60, 64, 67, 72]]
ARP_HOPE = [[65, 69, 72, 77], [64, 67, 72, 76], [62, 65, 69, 74], [62, 65, 70, 74]]

# per section: pad level, sub-drone level, event level (relative; calibrated against the DISCIPLINE loudness curve)
LEVEL = {"drone": dict(pad=0.80, sub=0.73, ev=1.16), "tick": dict(pad=0.80, sub=0.73, ev=1.30),
         "pulse96": dict(pad=0.80, sub=1.09, ev=1.45), "montage": dict(pad=0.38, sub=1.05, ev=1.14),
         "slam": dict(pad=0.38, sub=0.90, ev=1.0), "finale": dict(pad=1.0, sub=0.0, ev=1.2),
         "title": dict(pad=1.35, sub=0.30, ev=0.50), "silent": dict(pad=0, sub=0, ev=0)}


def _ramp(n: int, a: int, b: int) -> np.ndarray:
    """trapezoid with linear fade-in a / fade-out b samples"""
    w = np.ones(n, np.float32)
    a, b = min(a, n // 2), min(b, n // 2)
    if a:
        w[:a] = np.linspace(0, 1, a)
    if b:
        w[-b:] = np.linspace(1, 0, b)
    return w


def _pad(t0: float, t1: float, prog: list, gain: float, bright: float) -> np.ndarray:
    """soft chord pad (2, n): one chord per 2.5 s bar, neighbouring bars cross-fade linearly; absolute-time phases so equal
    notes join cleanly"""
    n = int(round((t1 - t0) * SR))
    out = np.zeros((2, n), np.float32)
    f = int(0.45 * SR)
    nb = int(np.ceil((t1 - t0) / BAR))
    for k in range(nb):
        c0 = int(k * BAR * SR)
        c1 = n if k == nb - 1 else int((k + 1) * BAR * SR)
        i0, i1 = max(0, c0 - f), min(n, c1 + f)
        idx = np.arange(i0, i1)
        up = np.ones(len(idx)) if k == 0 else np.clip((idx - (c0 - f)) / (2 * f), 0, 1)           # first bar starts at full level
        down = np.ones(len(idx)) if k == nb - 1 else np.clip(((c1 + f) - idx) / (2 * f), 0, 1)    # last bar ends at full level
        w = up * down
        tt = idx / SR + t0
        for note in prog[k % len(prog)]:
            fr = _mid(note)
            for j, det in enumerate((-0.0016, 0.0016)):      # slight detune left/right = width
                ph = 2 * np.pi * fr * (1 + det) * tt
                sg = np.sin(ph) + 0.35 * np.sin(2 * ph) + bright * (0.18 * np.sin(3 * ph) + 0.1 * np.sin(5 * ph))
                out[j, i0:i1] += (sg * w * 0.11).astype(np.float32)
    out *= (1 + 0.06 * np.sin(2 * np.pi * 0.2 * (_t(n) + t0))).astype(np.float32)     # slow breathing
    return out * gain


def _sub(t0: float, t1: float, gain: float) -> np.ndarray:
    """F1 + C2 + F2 pedal drone (43 / 65 / 87 Hz) with a little saturation so small speakers still hear it"""
    n = int(round((t1 - t0) * SR))
    t = _t(n) + t0
    x = np.sin(2 * np.pi * 43.65 * t) + 0.6 * np.sin(2 * np.pi * 65.41 * t) + 0.45 * np.sin(2 * np.pi * 87.31 * t)
    x = np.tanh(1.1 * x) * (1 + 0.15 * np.sin(2 * np.pi * 0.11 * t))
    return (x * gain * _ramp(n, int(0.3 * SR), int(0.3 * SR)) * 0.5).astype(np.float32)


@lru_cache(maxsize=None)
def _pluck(midi: int, dur: float = 1.4) -> np.ndarray:
    """soft piano / pluck note"""
    n = int(dur * SR)
    t = _t(n)
    f = _mid(midi)
    x = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) * np.exp(-t * 4) + 0.2 * np.sin(6 * np.pi * f * t) * np.exp(-t * 8)
         + 0.08 * np.sin(8 * np.pi * f * t) * np.exp(-t * 14))
    return _norm(x * np.exp(-t * 2.6) * np.minimum(1, t / 0.003) * np.minimum(1, (dur - t) / 0.2))


@lru_cache(maxsize=None)
def _subnote(midi: int, dur: float = 1.0) -> np.ndarray:
    n = int(dur * SR)
    t = _t(n)
    return (np.sin(2 * np.pi * _mid(midi) * t) * np.exp(-t * 3.2) * np.minimum(1, t / 0.005)).astype(np.float32)


@lru_cache(maxsize=None)
def _title_boom() -> np.ndarray:
    n = int(1.0 * SR)
    return _norm(_noise(n, "titleboom", 60, 5000) * _decay(n, 0.25, 0.001))


def _music_section(buf: np.ndarray, tag: str, t0: float, t1: float) -> list[tuple[float, float]]:
    """render one section into buf; returns the dropout windows (t_start, t_end) to cut out of the music afterwards"""
    if tag == "silent":
        return []
    L = LEVEL[tag]
    t0, t1 = round(t0 * SR) / SR, round(t1 * SR) / SR      # sample-aligned section edges (a start that is not on a sample used to crash _pad)
    dur = t1 - t0
    major = tag in ("finale", "title")
    prog, arp = (PROG_HOPE, ARP_HOPE) if major else (PROG_DARK, ARP_DARK)
    i0, i1 = int(round(t0 * SR)), min(buf.shape[1], int(round(t1 * SR)))
    ev = L["ev"]
    pad = _pad(t0, t1, prog, L["pad"], 1.0 if major else 0.0)
    k = min(i1 - i0, pad.shape[1])
    buf[:, i0:i0 + k] += (pad * _ramp(pad.shape[1], int(0.12 * SR), int(0.12 * SR)))[:, :k]
    if L["sub"] > 0:
        buf[:, i0:i0 + k] += _sub(t0, t1, L["sub"])[None, :k]
    ducks: list[tuple[float, float]] = []
    if t0 == 0 and tag == "drone":      # the film opens almost silent (reference: first 3 s are near-inaudible sub pulses)
        k = min(buf.shape[1] - i0, int(3 * SR))
        buf[:, i0:i0 + k] *= np.linspace(0.45, 1.0, k).astype(np.float32)
    if tag == "drone":
        # quiet opener: very soft sub pulses ~0.9 s apart, then a boom drop every ~4 s
        for k in range(int(dur / 0.9)):
            _place(buf, _subnote(29, 0.7), t0 + 0.27 + k * 0.9, 0.35 * ev)
        if dur > 3.2:
            for k in range(int(dur / 4.1) + 1):
                if t0 + 1.0 + k * 4.1 < t1 - 1.5:
                    _place(buf, s_boom(4.0, 70, 36), t0 + 1.0 + k * 4.1, 0.55 * ev)
    elif tag == "tick":
        # ticking clock: 0.5 s ticks for the first part, then 0.25 s, with boom drops in between
        switch = t0 + dur * 0.45 if dur > 5 else t0
        t = t0 + 0.2
        while t < t1 - 0.05:
            _place(buf, s_tick(), t, 0.42 * ev * (0.8 + 0.4 * (t - t0) / dur))
            t += 0.5 if t < switch else 0.25
        for k in range(int((dur - 0.5) / 3.7)):
            _place(buf, s_boom(4.0, 70, 36), t0 + 0.8 + k * 3.7, 0.5 * ev)
    elif tag in ("pulse96", "montage", "slam", "finale"):
        for k in range(int(dur / BEAT + 1e-6)):          # beat grid starting exactly at the section start
            tb, bar, pos = t0 + k * BEAT, k // 4, k % 4
            ch = arp[bar % 4]
            if tag in ("pulse96", "slam"):
                if pos == 0:
                    _place(buf, s_kick(0.9), tb, 0.50 * ev)
                elif pos == 2:
                    _place(buf, s_kick(0.6), tb, 0.22 * ev)
                if pos in (1, 2, 3) and not (pos == 2 and bar % 2):
                    _place(buf, _pluck(ch[(k + pos) % 4]), tb, 0.30 * ev, -0.2 + 0.4 * (k % 2))
            elif tag == "montage":
                _place(buf, s_kick(0.55), tb, (0.8 if pos == 0 else 0.5) * ev)
                for q in (1, 3):                           # 16th-note hats
                    _place(buf, s_hat(), tb + q * BEAT / 4, 0.22 * ev * (1.0 if q == 3 else 0.7), 0.3)
                if pos == 2:
                    _place(buf, _pluck(ch[(bar + 1) % 4]), tb, 0.2 * ev, 0.2)
            else:   # finale: warm piano arpeggio on EVERY beat, soft sub notes on the root
                _place(buf, _pluck(ch[(0, 1, 2, 3, 2, 1)[k % 6]]), tb, 0.55 * ev, -0.25 + 0.5 * (k % 2))
                if pos in (0, 2):
                    _place(buf, _subnote(prog[bar % 4][0] - 12, 1.2), tb, 0.55 * ev)
        if tag == "slam":
            _place(buf, s_slam(), t0, 0.8 * SLAM_TRIM)
            if t0 > 0.35:
                ducks.append((t0 - 0.3, t0))
    elif tag == "title":
        _place(buf, s_boom(5.0, 100, 38), t0, 1.0 * ev)
        _place(buf, _title_boom(), t0, 0.45 * ev)
    return ducks


def _duck(buf: np.ndarray, windows: list[tuple[float, float]]) -> None:
    """cut the music down to a quiet room tone (8 ms fade down) - the silence before a slam. The floor is a faint band-limited
    noise bed (ROOM_DB) so it is a quiet room, not a digital hole."""
    for a, b in windows:
        i0, i1 = max(0, int(round(a * SR))), min(buf.shape[1], int(round(b * SR)))
        if i1 > i0:
            n = i1 - i0
            r = min(int(0.008 * SR), n // 2)
            g = np.zeros(n, np.float32)
            g[:r] = np.linspace(1, 0, r)
            buf[:, i0:i1] *= g
            room = np.stack([_noise(n, f"room{i0}{c}", 80, 1800) for c in (0, 1)]) * (10 ** (ROOM_DB / 20)) * 0.9
            w = np.ones(n, np.float32)
            w[:r] = np.linspace(0, 1, r)
            buf[:, i0:i1] += (room * w).astype(np.float32)


# ------------------------------------------------------------------ mix + master
def render(film: dict) -> np.ndarray:
    """un-mastered stereo mix (2, N)"""
    film = prepare(film)
    seconds = sum(b["s"] for b in film["beats"])
    music = np.zeros((2, int(seconds * SR)), np.float32)
    ducks: list[tuple[float, float]] = []
    secs = sections(film)
    for s in secs:
        ducks += _music_section(music, s["tag"], s["t0"], s["t1"])
    sfxbuf = np.zeros_like(music)
    for name, t, o in sfx_events(film):
        fn, g, pan, anchor = SFX[name]
        gn, pan = o.get("gain", 1.0), o.get("pan", pan)
        if anchor == "punch":      # swish 0.65 s before the thud, thud on the offset
            _place(sfxbuf, s_swish(), t - 0.65, 0.45 * gn, pan)
            _place(sfxbuf, s_thud(), t, 0.9 * gn, pan)
        elif anchor == "duck":
            ducks.append((t, t + o.get("dur", 0.3)))
        else:
            sig = _sfx_array(name, o)
            if name == "slam":
                ducks.append((t - o.get("dropout", 0.3), t))
            _place(sfxbuf, sig, t - (len(sig) / SR if anchor == "end" else 0.0), gn * g, pan)
    for t in film.get("audio_onsets", []):       # optional extra transient grid (bright clicks) for matching a reference
        _place(sfxbuf, s_tick(), t, 1.6)
    _duck(music, ducks)
    mix = music + sfxbuf
    b = film.get("audio_bright", 0)              # optional harmonic exciter: saturate, keep only the highs, add back
    if b:
        for c in range(2):
            mix[c] += (b * _filt(np.tanh(8 * mix[c]) / 8, 900, None)).astype(np.float32)
    tr = film.get("audio_trim")                  # optional gain curve [[t, dB], ...]
    if tr:
        tt = np.arange(mix.shape[1]) / SR
        mix *= (10 ** (np.interp(tt, [x[0] for x in tr], [x[1] for x in tr]) / 20)).astype(np.float32)[None, :]
    # fade to black: steep fade ending 0.8 s before the end, then true silence
    f1 = seconds - 0.4
    f0 = max(f1 - 2.5, secs[-1]["t0"] + 0.35)
    if f1 > f0:
        i0, i1 = int(f0 * SR), int(f1 * SR)
        mix[:, i0:i1] *= np.cos(np.linspace(0, np.pi / 2, i1 - i0)).astype(np.float32) ** 3
        mix[:, i1:] = 0
    return mix


def audio(film: dict) -> np.ndarray:
    """mastered stereo audio (N, 2) float, 48 kHz, ~-16.5 LUFS integrated, true peak <= -1 dBTP"""
    return master(render(film).T)


def write_wav(x: np.ndarray, path: str | Path) -> None:
    """16-bit 48 kHz stereo wav"""
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


# ------------------------------------------------------------------ measurement (BS.1770 loudness, true peak, onsets)
def _kweight(x: np.ndarray) -> np.ndarray:
    """K-weighting filter (48 kHz) applied in the frequency domain; x is (N, channels)"""
    n = x.shape[0]
    z = np.exp(-1j * 2 * np.pi * np.fft.rfftfreq(n, 1 / SR) / SR)

    def biquad(b, a):
        return (b[0] + b[1] * z + b[2] * z ** 2) / (a[0] + a[1] * z + a[2] * z ** 2)

    H = biquad([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]) * \
        biquad([1, -2, 1], [1, -1.99004745483398, 0.99007225036621])
    return np.fft.irfft(np.fft.rfft(x, axis=0) * H[:, None], n, axis=0)


def _blocks(x: np.ndarray, win: float, hop: float) -> np.ndarray:
    """mean-square power per window (summed over channels) of the K-weighted signal"""
    y = _kweight(x.astype(np.float64)) ** 2
    cs = np.vstack([np.zeros((1, y.shape[1])), np.cumsum(y, axis=0)])
    w, h = int(win * SR), int(hop * SR)
    starts = np.arange(0, max(1, len(y) - w + 1), h)
    return (cs[np.minimum(starts + w, len(y))] - cs[starts]).sum(axis=1) / w


def _lufs(p: np.ndarray) -> np.ndarray:
    return -0.691 + 10 * np.log10(np.maximum(p, 1e-12))


def integrated_lufs(x: np.ndarray) -> float:
    """BS.1770-4 integrated loudness (400 ms blocks, 75 % overlap, -70 abs gate, -10 LU relative gate)"""
    p = _blocks(x, 0.4, 0.1)
    p = p[_lufs(p) > -70]
    if not len(p):
        return -70.0
    p = p[_lufs(p) > _lufs(np.array([p.mean()]))[0] - 10]
    return float(_lufs(np.array([p.mean()]))[0])


def short_term(x: np.ndarray, win: float = 3.0, hop: float = 2.0) -> list[tuple[float, float]]:
    """[(window end time, LUFS)] for a sliding window (3 s = EBU short-term; 4 s to match the DISCIPLINE breakdown)"""
    return [(round(i * hop + win, 1), float(v)) for i, v in enumerate(_lufs(_blocks(x, win, hop)))]


def true_peak_db(x: np.ndarray, os: int = 4) -> float:
    """true peak (dBTP): 4x oversampling by FFT zero padding, in 1M-sample chunks"""
    pk = 0.0
    for c in range(x.shape[1]):
        for i in range(0, len(x), 1 << 20):
            seg = x[i:i + (1 << 20), c].astype(np.float64)
            if len(seg) < 64:
                continue
            X = np.fft.rfft(seg)
            Y = np.zeros(len(seg) * os // 2 + 1, complex)
            Y[:len(X)] = X
            pk = max(pk, float(np.max(np.abs(np.fft.irfft(Y, len(seg) * os) * os))))
    return 20 * np.log10(max(pk, 1e-9))


def _limit(x: np.ndarray, ceil_db: float) -> np.ndarray:
    """look-ahead peak limiter: the gain follows the smoothed minimum of ceiling/|x| (~5 ms look-ahead)"""
    ceil = 10 ** (ceil_db / 20)
    need = np.minimum(1.0, ceil / np.maximum(np.max(np.abs(x), axis=1), 1e-9))
    blk = 48
    m = len(need) // blk * blk
    if m == 0:
        return x * need.min()
    bm = need[:m].reshape(-1, blk).min(axis=1)
    bm = np.minimum(bm, np.minimum(np.r_[1.0, bm[:-1]], np.r_[bm[1:], 1.0]))
    g = np.r_[np.repeat(bm, blk), np.full(len(need) - m, bm[-1])]
    k = np.hanning(2 * 240 + 1)
    gs = np.convolve(np.pad(g, 240, mode="edge"), k / k.sum(), "valid")
    return x * np.minimum(gs, 1.0)[:, None]


def master(x: np.ndarray, target: float = TARGET_LUFS, tp: float = TP_CEIL) -> np.ndarray:
    """gain to the target integrated loudness, peak-limit under the true-peak ceiling, re-aim a few times, verify"""
    g_db = target - integrated_lufs(x)
    ceil = tp - 0.5
    y = x
    for _ in range(6):
        y = _limit(x * 10 ** (g_db / 20), ceil)
        err = target - integrated_lufs(y)
        if abs(err) < 0.05:
            break
        g_db += err
    for _ in range(4):
        over = true_peak_db(y) - tp
        if over <= 0:
            break
        ceil -= over + 0.1
        y = _limit(x * 10 ** (g_db / 20), ceil)
    return y.astype(np.float32)


def onsets(x: np.ndarray, band: tuple[float, float] = (0, 24000), thr: float = 3.0, gap: float = 0.08) -> list[float]:
    """onset times (s) from the positive flux of log band energy (10 ms hop)"""
    m = x.mean(axis=1) if x.ndim > 1 else x
    hop, win = 480, 1024
    nf = (len(m) - win) // hop
    if nf < 3:
        return []
    S = np.abs(np.fft.rfft(np.stack([m[i * hop:i * hop + win] * np.hanning(win) for i in range(nf)]), axis=1))
    f = np.fft.rfftfreq(win, 1 / SR)
    e = np.log10(S[:, (f >= band[0]) & (f <= band[1])].sum(axis=1) + 1e-6)
    flux = np.maximum(0, np.diff(e, prepend=e[0]))
    med = np.median(flux[flux > 0]) if np.any(flux > 0) else 0
    th = thr * max(med, 1e-3) + 0.05
    out, last = [], -1.0
    for i in range(1, nf - 1):
        if flux[i] > th and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1] and e[i] > e.max() - 3.5:
            t = (i * hop + win / 2) / SR
            if t - last >= gap:
                out.append(round(t, 3))
                last = t
    return out


def load_wav(path: str | Path) -> np.ndarray:
    import soundfile as sf
    d, sr = sf.read(str(path), always_2d=True)
    if sr != SR:
        raise SystemExit(f"{path}: need {SR} Hz (ffmpeg -i in -ac 2 -ar 48000 out.wav)")
    return d.astype(np.float32)


def report(x: np.ndarray, label: str = "") -> None:
    print(f"{label} integrated {integrated_lufs(x):.1f} LUFS, true peak {true_peak_db(x):.2f} dBTP, length {len(x) / SR:.1f} s")
    print(" short-term (4 s window every 2 s):", " ".join(f"{t:.0f}:{v:.0f}" for t, v in short_term(x, 4.0, 2.0)))
    on = onsets(x)
    print(f" {len(on)} onsets:", " ".join(f"{t:.2f}" for t in on[:80]), "..." if len(on) > 80 else "")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "measure":
        for p in sys.argv[2:]:
            report(load_wav(p), Path(p).name)
