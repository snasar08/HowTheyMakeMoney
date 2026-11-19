"""Long-form films (Nov 19, Sam: "replicate [Day One Films] for us in a finance way", one a day from Sunday).

A film is content/films/NNN-slug.json: a cast of looks + a list of beats (one shot each, a few seconds). No voice:
on-screen sentences carry the story (white = narration, red = the inner voice), plus title cards and a day counter.
See docs/LONGFORM_STYLE.md for the style and the reasons.

  python -m pipeline.film plan  content/films/001-practice.json out/props.json    # -> AhFilm inputProps
  python -m pipeline.film audio content/films/001-practice.json out/film.wav       # score + sound effects
  python -m pipeline.film make  content/films/001-practice.json frames/ out/film.mp4  # frames (+ audio) -> mp4
  python -m pipeline.film table content/films/001-practice.json                    # text check of every beat

Frames come from `node scripts/frames.mjs AhFilm props.json frames/ <shard> <shards> 1` (one dir per shard with range.json).
Everything here is free and offline: the music and sounds are synthesized with numpy (nothing to license).
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

FPS = 30
SR = 44100


# ---------------------------------------------------------------- plan
def load(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def plan(film: dict) -> dict:
    """beats -> {"ah": {"shots": [...], "film": {lines, cards, day, hud}}} (frames at 30 fps)"""
    cast = film.get("cast", {})
    shots, lines, cards, days, huds = [], [], [], [], []
    a = 0
    for b in film["beats"]:
        n = int(round(b["s"] * FPS))
        chars = []
        for c in b.get("chars", []):
            c = dict(c)
            if isinstance(c.get("look"), str):
                c["look"] = cast[c["look"]]
            chars.append(c)
        shot = {"a": a, "n": n, "set": b["set"], "chars": chars}
        for k in ("view", "cam", "subject", "things", "cards", "act", "mood", "fade", "coins"):
            if k in b:
                shot[k] = b[k]
        shots.append(shot)
        say = b.get("say")
        if isinstance(say, str):
            say = [{"t": say}]
        say = say or []
        # several sentences in one beat share it evenly; each stays up until just before the next / the cut
        for i, s in enumerate(say):
            k0 = a + 4 + (n * i) // len(say)
            k1 = a + (n * (i + 1)) // len(say) - 2
            ln = {"a": k0, "n": max(20, k1 - k0), "t": s["t"]}
            if s.get("red"):
                ln["red"] = True
            if s.get("at"):
                ln["at"] = s["at"]
            lines.append(ln)
        if b.get("card"):
            cards.append({"a": a, "n": n, **b["card"]})
        if b.get("day"):
            if days and days[-1]["t"] == b["day"] and days[-1]["a"] + days[-1]["n"] == a:
                days[-1]["n"] += n
            else:
                days.append({"a": a, "n": n, "t": b["day"]})
        if b.get("hud"):
            huds.append({"a": a, "n": n, **b["hud"]})
        a += n
    return {"ah": {"shots": shots, "film": {"lines": lines, "cards": cards, "day": days, "hud": huds}}, "split": split(film["beats"])}


# seconds per frame on a GitHub runner, measured on film 1 (Nov 19 run 1): text-only black frames are ~4x cheaper than
# characters on the dark stage or in the bedroom, so equal frame counts per machine left 8-min and 2-min machines
COST = {"void": 1.7, "bedroom": 1.6, "bedroomday": 1.8, "street": 1.3, "courtempty": 0.8, "court": 1.2, "gym": 1.2,
        "garage": 2.4, "office": 1.6, "store": 0.9, "diner": 1.1}   # film 2 run added the last four


def split(beats: list, shards: int = 20) -> list:
    """frame boundaries (shards + 1 numbers) that give every machine about the same render time"""
    cost = []
    for b in beats:
        c = 0.45 if b["set"] == "void" and not b.get("chars") else COST.get(b["set"], 1.3)
        cost += [c] * int(round(b["s"] * FPS))
    tot, acc, out, k = sum(cost), 0.0, [0], 1
    for i, c in enumerate(cost):
        acc += c
        while k < shards and acc >= tot * k / shards:
            out.append(i + 1); k += 1
    while len(out) < shards:
        out.append(len(cost))
    out.append(len(cost))
    return out


def plan_thumb(film: dict, k: int = 0) -> dict:
    """film["thumbs"][k] = {"words": "ONE MORE", "red": ["MORE"], "side": "right", "beat": {...one beat...}} -> AhFilm props
    for a single 1280x720 frame (render frame 20 so pops / poses have settled)"""
    th = film["thumbs"][k]
    beat = {"s": 1.0, **th["beat"]}
    p = plan({**film, "beats": [beat]})
    p["ah"]["film"] = {"thumb": {"words": th["words"], "side": th.get("side", "right"), "red": th.get("red", [])}}
    return p


def table(film: dict) -> str:
    out, t = [], 0.0
    for i, b in enumerate(film["beats"]):
        say = b.get("say")
        say = say if isinstance(say, str) else " / ".join(("[red] " if s.get("red") else "") + s["t"] for s in (say or []))
        if b.get("card"):
            say = f"CARD {b['card'].get('big')} | {b['card'].get('line', '')} | {b['card'].get('cmd', '')}"
        who = ",".join((c["look"] if isinstance(c["look"], str) else "?") + ":" + c.get("pose", "stand") for c in b.get("chars", []))
        act = b.get("act", {}).get("kind", "")
        out.append(f"{i:02d} {t:6.1f}s {b['s']:4.1f}s {b['set']:<11} {b.get('mood', ''):<8} {b.get('day', ''):<7} {who:<28} {act:<12} {say}")
        t += b["s"]
    out.append(f"total {t:.1f} s ({int(t // 60)}:{int(t % 60):02d}), {len(film['beats'])} beats")
    return "\n".join(out)


# ---------------------------------------------------------------- sound
def _hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def _sine(f: float, n: int, harm=(1.0,)) -> np.ndarray:
    t = np.arange(n) / SR
    return sum(a * np.sin(2 * np.pi * f * (k + 1) * t) for k, a in enumerate(harm)).astype(np.float32)


def _env(n: int, att: float, rel: float) -> np.ndarray:
    e = np.ones(n, np.float32)
    a, r = min(n, max(1, int(att * SR))), min(n, max(1, int(rel * SR)))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def _piano(f: float, dur: float, vel: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) * np.exp(-t * 3) + 0.15 * np.sin(6 * np.pi * f * t) * np.exp(-t * 6))
    return (s * np.exp(-t * 1.6) * _env(n, 0.004, 0.3) * vel).astype(np.float32)


MINOR = [0, 2, 3, 5, 7, 8, 10]
MAJOR = [0, 2, 4, 5, 7, 9, 11]


def _triad(root: int, deg: int, scale) -> list[int]:
    return [root + scale[(deg + k) % 7] + 12 * ((deg + k) // 7) for k in (0, 2, 4)]


def score(film: dict, seconds: float) -> np.ndarray:
    """Slow cinematic bed (piano + pad + sub), minor and sparse in the dark part, a riser into "DAY 1.", a steady pulse in
    the grind, warm major from the sunrise payoff. Sections follow the film: the first card beat = DAY 1, the first
    sunrise/day mood = payoff."""
    h = int(hashlib.md5(film.get("id", "").encode()).hexdigest(), 16)
    key = 45 + h % 5                                    # A2..C#3 root
    beats, t, day1, payoff = film["beats"], 0.0, None, None
    for b in beats:
        if day1 is None and b.get("card") and t > 10:
            day1 = t
        if payoff is None and b.get("mood") in ("sunrise", "day") and t > (day1 or 1e9):
            payoff = t
        t += b["s"]
    day1 = day1 if day1 is not None else seconds * 0.4
    payoff = payoff if payoff is not None else seconds * 0.8
    n = int(seconds * SR) + SR
    out = np.zeros(n, np.float32)

    def add(sig, at):
        i = int(at * SR)
        if 0 <= i < n:
            seg = sig[: n - i]
            out[i:i + len(seg)] += seg

    bar = 4 * 60 / 66                                   # 66 bpm
    prog_minor, prog_major = [0, 5, 2, 6], [3, 0, 4, 5]   # i VI III VII  /  IV I V vi
    k = 0
    tb = 0.0
    rng = np.random.default_rng(h % 2**32)
    while tb < seconds:
        major = tb >= payoff
        scale = MAJOR if major else MINOR
        deg = (prog_major if major else prog_minor)[k % 4]
        ch = _triad(key + (2 if major else 0), deg, scale)
        nb = int(bar * SR)
        grind = day1 <= tb < payoff
        # pad (whole bar)
        pad = sum(_sine(_hz(m + 12), nb, (1.0, 0.25)) for m in ch) / 3
        add(pad * _env(nb, 0.8, 0.9) * (0.10 if tb < day1 else 0.13), tb)
        # sub
        add(_sine(_hz(ch[0] - 12), nb, (1.0,)) * _env(nb, 0.3, 0.6) * 0.20, tb)
        # piano: sparse broken chord in the dark part, 8ths in the grind, open arpeggio in the payoff
        if tb < day1:
            for j, m in enumerate([ch[0] + 24, ch[2] + 24, ch[1] + 36]):
                add(_piano(_hz(m), 2.6, 0.16), tb + j * bar / 3 + 0.02 * rng.random())
        else:
            step = bar / 8
            pat = [0, 1, 2, 1, 0, 2, 1, 2] if grind else [0, 1, 2, 3, 2, 1, 2, 3]
            notes = ch + [ch[0] + 12]
            for j, p in enumerate(pat):
                add(_piano(_hz(notes[p] + 24), 1.4, 0.10 if grind else 0.12), tb + j * step)
        # grind pulse: soft low drum on 1 and 3
        if grind:
            for bt in (0, 2):
                m = int(0.4 * SR)
                tt = np.arange(m) / SR
                add((np.sin(2 * np.pi * (50 + 60 * np.exp(-tt * 25)) * tt) * np.exp(-tt * 9)).astype(np.float32) * 0.35, tb + bt * bar / 4)
        tb += bar
        k += 1
    # riser into DAY 1
    rl = 4.0
    m = int(rl * SR)
    tt = np.arange(m) / SR
    noise = np.random.default_rng(7).standard_normal(m).astype(np.float32)
    noise = np.convolve(noise, np.ones(8) / 8, mode="same").astype(np.float32)
    rise = (noise * 0.08 + _sine(1, m) * 0) * (tt / rl) ** 2
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 900 * (tt / rl) ** 2) / SR).astype(np.float32) * 0.05 * (tt / rl) ** 2
    add((rise + sweep).astype(np.float32), max(0.0, day1 - rl))
    out = out[: int(seconds * SR)]
    out = np.convolve(out, np.ones(4, np.float32) / 4, mode="same").astype(np.float32)
    f = int(2.5 * SR)
    out[-f:] *= np.linspace(1, 0, f)
    return out / (float(np.max(np.abs(out))) or 1.0)


def sfx(kind: str) -> np.ndarray:
    """small synthesized sound effects (peak ~1)"""
    if kind == "alarm":      # digital beeps: 4 x (beep beep)
        out = np.zeros(int(2.4 * SR), np.float32)
        for g in range(4):
            for j in range(2):
                m = int(0.09 * SR)
                i = int((g * 0.6 + j * 0.15) * SR)
                out[i:i + m] += np.sign(_sine(2600, m)) * 0.5 * _env(m, 0.002, 0.01)
        return out
    if kind == "buzz":       # phone vibrate
        m = int(0.9 * SR)
        t = np.arange(m) / SR
        s = np.sign(np.sin(2 * np.pi * 150 * t)) * 0.4 * ((t % 0.45) < 0.32)
        return np.convolve(s, np.ones(30) / 30, mode="same").astype(np.float32)
    if kind == "heart":      # lub-dub
        out = np.zeros(int(0.6 * SR), np.float32)
        for at, a in ((0.0, 1.0), (0.18, 0.7)):
            m = int(0.16 * SR)
            t = np.arange(m) / SR
            out[int(at * SR):int(at * SR) + m] += (np.sin(2 * np.pi * (45 + 30 * np.exp(-t * 30)) * t) * np.exp(-t * 22) * a).astype(np.float32)
        return out
    if kind in ("thud", "hit", "boom"):
        L = {"thud": 0.35, "hit": 1.2, "boom": 2.5}[kind]
        m = int(L * SR)
        t = np.arange(m) / SR
        f0 = {"thud": 70, "hit": 55, "boom": 38}[kind]
        body = np.sin(2 * np.pi * (f0 + 80 * np.exp(-t * 20)) * t) * np.exp(-t * (14 if kind == "thud" else 3.0 if kind == "hit" else 1.4))
        nz = np.random.default_rng(3).standard_normal(m) * np.exp(-t * 40) * 0.3
        return (body + nz).astype(np.float32)
    if kind == "bounce":     # basketball on wood
        m = int(0.25 * SR)
        t = np.arange(m) / SR
        return (np.sin(2 * np.pi * (110 + 120 * np.exp(-t * 60)) * t) * np.exp(-t * 28) + np.random.default_rng(5).standard_normal(m) * np.exp(-t * 90) * 0.4).astype(np.float32) * 0.8
    if kind == "bell":       # soft chime
        m = int(2.5 * SR)
        t = np.arange(m) / SR
        return sum((np.sin(2 * np.pi * f * t) * np.exp(-t * d) * a) for f, d, a in ((1318, 1.6, 0.5), (1976, 2.4, 0.25), (2637, 3.5, 0.12))).astype(np.float32)
    if kind == "riser":
        m = int(3.5 * SR)
        t = np.arange(m) / SR
        return (np.sin(2 * np.pi * np.cumsum(120 + 500 * (t / 3.5) ** 2) / SR) * (t / 3.5) ** 2 * 0.5).astype(np.float32)
    return np.zeros(1, np.float32)


SFX_GAIN = {"alarm": 0.32, "buzz": 0.4, "heart": 0.7, "thud": 0.55, "hit": 0.6, "boom": 0.6, "bounce": 0.45, "bell": 0.3, "riser": 0.3}


def audio(film: dict) -> np.ndarray:
    seconds = sum(b["s"] for b in film["beats"])
    mix = score(film, seconds) * 0.42
    t = 0.0
    for b in film["beats"]:
        for kind, off in b.get("sfx", []):
            s = sfx(kind) * SFX_GAIN.get(kind, 0.4)
            i = int((t + off) * SR)
            if i < len(mix):
                seg = s[: len(mix) - i]
                mix[i:i + len(seg)] += seg
        t += b["s"]
    peak = float(np.max(np.abs(mix))) or 1.0
    return (mix / peak * 0.89).astype(np.float32)   # -1 dBFS peak; loudness checked with ffmpeg ebur128 after mixing


def write_wav(x: np.ndarray, path: str | Path) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- make
def collect_frames(frames_dir: str | Path) -> list[Path]:
    """frames.mjs shard dirs (each with range.json) -> one ordered list of jpgs covering the whole film"""
    out: dict[int, Path] = {}
    for rj in sorted(Path(frames_dir).rglob("range.json")):
        r = json.loads(rj.read_text())
        jp = sorted(p for p in rj.parent.iterdir() if p.suffix.lower() in (".jpg", ".jpeg"))
        for i, p in enumerate(jp):
            out[r["start"] + i] = p
    if not out:
        raise SystemExit(f"no frames under {frames_dir}")
    total = max(out) + 1
    missing = [i for i in range(total) if i not in out]
    if missing:
        print(f"WARNING: {len(missing)} missing frames (first {missing[:5]}); holding the previous frame")
    seq, last = [], out[min(out)]
    for i in range(total):
        last = out.get(i, last)
        seq.append(last)
    return seq


def make(film: dict, frames_dir: str, out_mp4: str, loudnorm: bool = True) -> None:
    seq = collect_frames(frames_dir)
    work = Path(out_mp4).with_suffix("")
    work.mkdir(parents=True, exist_ok=True)
    lst = work / "frames.txt"
    lst.write_text("".join(f"file '{p.resolve().as_posix()}'\nduration {1 / FPS:.6f}\n" for p in seq), encoding="utf-8")
    wav = work / "film.wav"
    write_wav(audio(film), wav)
    af = ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.79:level=false"] if loudnorm else []   # Nov 19: the limiter catches the peaks single-pass loudnorm lets through (film 1 hit -0.2 dBTP)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-i", str(wav), *af,
           "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", out_mp4]
    subprocess.run(cmd, check=True)
    print(f"made {out_mp4}: {len(seq)} frames ({len(seq) / FPS:.1f} s)")


if __name__ == "__main__":
    cmd, src = sys.argv[1], sys.argv[2]
    f = load(src)
    if cmd == "plan":
        Path(sys.argv[3]).parent.mkdir(parents=True, exist_ok=True)
        Path(sys.argv[3]).write_text(json.dumps(plan(f)), encoding="utf-8")
        print(table(f))
    elif cmd == "audio":
        write_wav(audio(f), sys.argv[3])
    elif cmd == "make":
        make(f, sys.argv[3], sys.argv[4])
    elif cmd == "thumb":   # python -m pipeline.film thumb film.json out_props.json [k]
        Path(sys.argv[3]).write_text(json.dumps(plan_thumb(f, int(sys.argv[4]) if len(sys.argv) > 4 else 0)), encoding="utf-8")
    elif cmd == "table":
        print(table(f))
