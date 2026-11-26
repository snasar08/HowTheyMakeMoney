"""Voice-quality checker for a whole-Short TTS read (Gemini "Puck", one request, 24 kHz mono).

  check(a, sr, lines, heard=None) -> Report   hard problems reject the take, soft ones lower the score
  polish(a, sr) -> (audio, seconds_cut_from_start)   free fixes, no new TTS
  best(reports) -> index of the best take
  to_markdown(sid, reports, chosen, engine) -> GitHub step-summary table

`heard` = Whisper word dicts ({"word": " text", "start", "end"}) for the whole read; None runs whisper base.en.
Script lines are compared as pipeline/tts.py speakable() text; digits on both sides are normalised the same way.

Score = 100 minus these penalties (each capped), minus HARD_PENALTY per hard problem (floor 0):
  pace CV over lines   min(20, 8 + 60 * (cv - PACE_CV_MAX))        accuracy 0.90..0.97   min(20, 250 * (0.97 - acc))
  long pauses          5 per pause over its limit, max 20          monotone / sing-song  12
  loudness spread      min(12, 4 + 3 * (range_dB - LOUD_RANGE_DB))  rushed/dragged line   4 each, max 12
  noisy pauses         6
"""
from __future__ import annotations

import difflib
from dataclasses import dataclass, field

import numpy as np

from . import clarity_check, prosody, tts

# ---- thresholds (tune here) -------------------------------------------------------------------------------
ACC_HARD = 0.85          # fraction of script words heard; below = reject  (Nov 26 calibration: Whisper base.en misheard a liked Puck read at 0.885)
ACC_SOFT = 0.95          # between ACC_HARD and this = soft "say every word clearly"
EXTRA_MAX = 0.10         # heard words not in the script / all heard words
TAIL_WORDS = 3           # truncated if at least TAIL_MISS of the last TAIL_WORDS script words are not heard
TAIL_MISS = 2
VOICE_ST_MAX = 5.0       # one line's median pitch vs the whole read's median, semitones
VOICE_MIN_FRAMES = 20    # voiced frames needed to trust a line's pitch
LINE_MIN_WORDS = 4       # shorter lines are skipped for pitch / loudness / rushed checks
CLIP_LEVEL, CLIP_FRAC = 0.999, 0.001
PACE_MIN, PACE_MAX = 2.0, 5.0            # words/s over the whole read (first to last word)
SILENT_PEAK = 0.01
PACE_CV_MAX = 0.22       # coefficient of variation of per-line words/s
PAUSE_IN_S, PAUSE_BETWEEN_S = 0.35, 0.60   # Nov 26 calibration: only disliked/meh reads had >0.6 s between sentences
LOUD_RANGE_DB = 1.8      # max - min of per-line loudness
LINE_PACE_LO, LINE_PACE_HI = 0.70, 1.40  # line pace / median line pace outside this = dragged / rushed
NOISE_DB = -50.0         # median level (dBFS) of the pauses
PAUSE_MIN_GAP = 0.20     # gaps at least this long are measured for the noise floor
HARD_PENALTY = 30.0

HINTS = {
    "pace": "Keep one steady pace the whole time.",
    "pauses": "Read it as one smooth paragraph with only tiny pauses.",
    "melody": "Use natural rise and fall, like talking to a friend.",
    "loud": "Keep the same volume the whole time.",
    "words": "Say every word clearly.",
    "truncated": "Read the complete script all the way to the very last word.",
    "voice": "Keep exactly the same voice and tone the whole time.",
    "clip": "Speak at a calm, moderate volume, never shouting.",
    "silent": "Read the whole script out loud.",
    "noise": "Stay quiet and clean between sentences, no loud breaths.",
}

_WHISPER = None


@dataclass
class Report:
    ok: bool
    score: float
    hard: list = field(default_factory=list)
    soft: list = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    hint: str = ""


def _whisper_words(a, sr: int) -> list[dict]:
    global _WHISPER
    import whisper
    if _WHISPER is None:
        _WHISPER = whisper.load_model("base.en")
    a = np.asarray(a, np.float32).ravel()
    if sr != 16000:
        try:
            from math import gcd
            from scipy.signal import resample_poly
            g = gcd(16000, int(sr))
            a16 = resample_poly(a, 16000 // g, int(sr) // g).astype(np.float32)
        except Exception:
            a16 = np.interp(np.linspace(0, len(a) - 1, int(len(a) * 16000 / sr)), np.arange(len(a)), a).astype(np.float32)
    else:
        a16 = a
    res = _WHISPER.transcribe(a16, language="en", word_timestamps=True, fp16=False)
    return [w for seg in res["segments"] for w in seg.get("words", [])]


# ---- text alignment ---------------------------------------------------------------------------------------
def _norm(pairs):
    """[(text, payload)] -> [(token, payload)]; "49 thousand", "$49,000", "2,700" and "2700" compare equal."""
    toks = [(t, p) for text, p in pairs for t in clarity_check.tokens(text)]
    out = []
    for t, p in clarity_check.fix_dollars(toks):
        t = t.lstrip("$")
        if out and out[-1][0].isdigit() and t in ("thousand", "000"):
            out[-1] = (out[-1][0] + "000", out[-1][1])
        else:
            out.append((t, p))
    return out


def _align(lines: list[str], heard: list[dict]):
    """(expected tokens, owner line per token, matched index into `got` per token or None, got=[(token, heard idx)], used flags)."""
    exp, owner = [], []
    for i, ln in enumerate(lines):
        for t, _ in _norm([(tts.speakable(ln), None)]):
            exp.append(t)
            owner.append(i)
    got = _norm([(tts.speakable(x["word"]), k) for k, x in enumerate(heard)])
    gt = [t for t, _ in got]
    match = [None] * len(exp)
    used = [False] * len(gt)
    for tag, a0, a1, b0, b1 in difflib.SequenceMatcher(None, exp, gt, autojunk=False).get_opcodes():
        if tag == "equal":
            for k in range(a1 - a0):
                match[a0 + k] = b0 + k
                used[b0 + k] = True
        elif tag == "replace":  # fuzzy: in-order pairing of similar tokens ("billions" ~ "billion")
            j = b0
            for i in range(a0, a1):
                for k in range(j, b1):
                    if difflib.SequenceMatcher(None, exp[i], gt[k]).ratio() >= 0.75:
                        match[i], used[k], j = k, True, k + 1
                        break
    return exp, owner, match, got, used


# ---- audio helpers ----------------------------------------------------------------------------------------
def _db(x: float) -> float:
    return float(20 * np.log10(max(x, 1e-6)))


def _active_rms_db(seg: np.ndarray, sr: int):
    n = int(0.02 * sr)
    k = len(seg) // n
    if k < 3:
        return None
    fr = seg[: k * n].reshape(k, n)
    rms = np.sqrt(np.mean(fr ** 2, axis=1))
    act = rms > max(0.008, 0.06 * float(np.percentile(rms, 95)))
    if not act.any():
        return None
    return _db(float(np.sqrt(np.mean(fr[act] ** 2))))


def _seg(a, sr, t0, t1):
    return a[max(0, int(t0 * sr)): max(0, int(t1 * sr))]


def _f(x):
    return round(float(x), 3)


# ---- the check --------------------------------------------------------------------------------------------
def _quiet_run(a, sr: int, t0: float, t1: float, thr_db: float):
    """Longest run of 10 ms frames quieter than thr_db inside [t0-0.12, t1+0.12] (Whisper word edges are loose, so the
    real silence is found from the sound itself) -> (seconds, median level dBFS of that run or None)."""
    fr = int(0.01 * sr)
    seg = _seg(a, sr, max(0.0, t0 - 0.12), t1 + 0.12)
    n = len(seg) // fr
    if n < 2:
        return 0.0, None
    rms = np.sqrt(np.mean(seg[:n * fr].reshape(n, fr) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    best, cur, b0, c0 = 0, 0, 0, 0
    for i, q in enumerate(db < thr_db):
        if q:
            if cur == 0:
                c0 = i
            cur += 1
            if cur > best:
                best, b0 = cur, c0
        else:
            cur = 0
    if not best:
        return 0.0, None
    return best * 0.01, float(np.median(db[b0:b0 + best]))


def check(a, sr: int, lines: list[str], heard: list[dict] | None = None) -> Report:
    a = np.asarray(a, np.float32).ravel()
    lines = [x for x in lines if x and x.strip()]
    hard: list[str] = []
    soft: list[str] = []
    pen: list[tuple[float, str]] = []          # (penalty, hint key); hard problems count 100
    m: dict = {"duration_s": _f(len(a) / sr), "lines": len(lines)}
    peak = float(np.max(np.abs(a))) if len(a) else 0.0
    m["peak"] = _f(peak)

    def add_hard(msg, key):
        hard.append(msg)
        pen.append((100.0, key))

    def add_soft(msg, key, p):
        soft.append(msg)
        pen.append((p, key))

    if heard is None and peak >= SILENT_PEAK and len(a):
        heard = _whisper_words(a, sr)
    heard = [w for w in (heard or []) if "start" in w and "end" in w]
    m["heard_words"] = len(heard)
    if peak < SILENT_PEAK or not heard:
        add_hard("silent: empty or silent audio" if peak < SILENT_PEAK else "silent: no words heard", "silent")
        return _finish(hard, soft, pen, m)

    clip = float(np.mean(np.abs(a) >= CLIP_LEVEL))
    m["clip_frac"] = round(clip, 5)
    if clip > CLIP_FRAC:
        add_hard(f"clipping:{clip * 100:.2f}% of samples", "clip")

    # words
    exp, owner, match, got, used = _align(lines, heard)
    acc = sum(x is not None for x in match) / max(1, len(exp))
    extra = (len(got) - sum(used)) / max(1, len(got))
    m["accuracy"], m["extra_frac"] = round(acc, 4), round(extra, 4)
    m["missed"] = [exp[i] for i in range(len(exp)) if match[i] is None][:30]
    miss_tail = sum(x is None for x in match[-TAIL_WORDS:])
    m["tail_missed"] = miss_tail
    if len(exp) >= TAIL_WORDS and miss_tail >= TAIL_MISS:
        add_hard(f"truncated: {miss_tail} of the last {TAIL_WORDS} words not heard", "truncated")
    if acc < ACC_HARD:
        add_hard(f"accuracy:{acc:.2f}", "words")
    elif acc < ACC_SOFT:
        add_soft(f"accuracy:{acc:.2f}", "words", min(20.0, 250 * (ACC_SOFT - acc)))
    if extra > EXTRA_MAX:
        add_hard(f"extra-words:{extra * 100:.0f}%", "words")

    # per-line spans: (first heard idx, last heard idx, expected word count)
    spans = {}
    for i in range(len(lines)):
        ks = [got[match[j]][1] for j in range(len(exp)) if owner[j] == i and match[j] is not None]
        if ks:
            spans[i] = (min(ks), max(ks), sum(1 for o in owner if o == i))
    span = max(0.1, float(heard[-1]["end"]) - float(heard[0]["start"]))
    pace = len(got) / span
    m["pace_wps"] = _f(pace)
    if not PACE_MIN <= pace <= PACE_MAX:
        add_hard(f"pace:{pace:.2f}words/s", "pace")

    # pauses
    line_end_idx = {v[1] for v in spans.values()}
    ins, betw, quiet_levels = [], [], []
    fr = int(0.01 * sr)
    nfr = len(a) // fr
    speech_db = float(np.percentile(20 * np.log10(np.sqrt(np.mean(a[:nfr * fr].reshape(nfr, fr) ** 2, axis=1) + 1e-12)), 90)) if nfr else -20.0
    thr = speech_db - 30.0                     # "silence" = 30 dB under the loud speech frames
    m["speech_db"] = round(speech_db, 1)
    for k in range(len(heard) - 1):
        t0, t1 = float(heard[k]["end"]), float(heard[k + 1]["start"])
        if t1 - t0 < 0.05:
            continue
        dur, lvl = _quiet_run(a, sr, t0, t1, thr)
        if lvl is not None and dur >= PAUSE_MIN_GAP:
            quiet_levels.append(lvl)
        sentence_end = k in line_end_idx or heard[k]["word"].rstrip().endswith((".", "?", "!"))
        if sentence_end and dur > PAUSE_BETWEEN_S:
            betw.append(_f(dur))
        elif not sentence_end and dur > PAUSE_IN_S:
            ins.append(_f(dur))
    m["long_pauses_in_sentence"], m["long_pauses_between"] = ins, betw
    if ins or betw:
        add_soft(f"pauses:{len(ins)} inside sentences (max {max(ins, default=0):.2f}s), {len(betw)} between (max {max(betw, default=0):.2f}s)",
                 "pauses", min(20.0, 5.0 * (len(ins) + len(betw))))

    # per-line pace
    lp = {}
    for i, (k0, k1, n) in spans.items():
        d = float(heard[k1]["end"]) - float(heard[k0]["start"])
        if n >= 3 and d > 0.2:
            lp[i] = n / d
    m["line_wps"] = [_f(lp[i]) for i in sorted(lp)]
    if len(lp) >= 3:
        v = np.array(list(lp.values()))
        cv = float(np.std(v) / np.mean(v))
        m["pace_cv"] = round(cv, 3)
        if cv > PACE_CV_MAX:
            add_soft(f"uneven-pace:cv {cv:.2f}", "pace", min(20.0, 8 + 60 * (cv - PACE_CV_MAX)))
        med = float(np.median(v))
        odd = [i for i, x in lp.items() if spans[i][2] >= LINE_MIN_WORDS and not LINE_PACE_LO <= x / med <= LINE_PACE_HI]
        m["odd_pace_lines"] = odd
        if odd:
            add_soft("rushed-or-dragged:" + ",".join(f"line{i}({'fast' if lp[i] > med else 'slow'})" for i in odd), "pace",
                     min(12.0, 4.0 * len(odd)))

    # pitch (voice change, melody) and loudness per line
    f_all = prosody.pitch_track(a, sr)
    whole = float(np.median(f_all)) if len(f_all) else 0.0
    m["median_hz"] = _f(whole)
    devs, spreads, louds = {}, [], []
    for i, (k0, k1, n) in spans.items():
        if n < LINE_MIN_WORDS:
            continue
        seg = _seg(a, sr, float(heard[k0]["start"]), float(heard[k1]["end"]))
        ms = prosody.measure(seg, sr)
        if whole and ms["voiced_frames"] >= VOICE_MIN_FRAMES and ms["median_hz"]:
            devs[i] = 12 * float(np.log2(ms["median_hz"] / whole))
            spreads.append(ms["spread_st"])
        db = _active_rms_db(seg, sr)
        if db is not None:
            louds.append(db)
    m["line_pitch_dev_st"] = {str(i): _f(d) for i, d in devs.items()}
    # Nov 26 (first real run, Short 179): all 3 Puck takes "changed voice" (+6..+9 st) only on the call-to-action question
    # and the loop line, which are SUPPOSED to lift. Those lines (a "?" or ending ":", or the last 2 lines) and any line
    # of numbers-only pitch stay out of the hard check; a real voice change shows up in the story lines too.
    lively = {i for i, ln in enumerate(lines) if "?" in ln or ln.rstrip().endswith(":") or i >= len(lines) - 2}
    m["lively_lines"] = sorted(lively)
    bad = {i: d for i, d in devs.items() if abs(d) > VOICE_ST_MAX and i not in lively}
    if bad:
        add_hard("voice-change:" + ",".join(f"line{i}({d:+.1f}st)" for i, d in bad.items()), "voice")
    if spreads:
        sp = float(np.median(spreads))
        m["pitch_spread_st"] = round(sp, 2)
        if sp < prosody.FLAT_ST:
            add_soft(f"monotone:{sp:.1f}st", "melody", 12.0)
        elif sp > prosody.WIDE_ST:
            add_soft(f"sing-song:{sp:.1f}st", "melody", 12.0)
    if len(louds) >= 2:
        rng = max(louds) - min(louds)
        m["loud_range_db"] = round(rng, 2)
        if rng > LOUD_RANGE_DB:
            add_soft(f"loudness-spread:{rng:.1f}dB", "loud", min(12.0, 4 + 3 * (rng - LOUD_RANGE_DB)))

    # noise floor in pauses: hiss/breath level inside the real silences (each under thr by definition, so judge vs NOISE_DB)
    levels = quiet_levels
    if levels:
        nf = float(np.median(levels))
        m["pause_noise_db"] = round(nf, 1)
        if nf > NOISE_DB:
            add_soft(f"noisy-pauses:{nf:.0f}dBFS", "noise", 6.0)

    return _finish(hard, soft, pen, m)


def _finish(hard, soft, pen, m) -> Report:
    score = 100.0 - sum(p for p, _ in pen if p < 100) - HARD_PENALTY * len(hard)
    score = float(min(100.0, max(0.0, score)))
    hint = HINTS[max(pen)[1]] if pen else ""
    return Report(ok=not hard, score=round(score, 1), hard=hard, soft=soft, metrics=m, hint=hint)


# ---- free fixes -------------------------------------------------------------------------------------------
def _medfilt(x: np.ndarray, k: int = 7) -> np.ndarray:
    xp = np.pad(x, k // 2, mode="edge")
    return np.median(np.lib.stride_tricks.sliding_window_view(xp, k), axis=1).astype(np.float32)


def _declick(x: np.ndarray, max_run: int = 4) -> np.ndarray:
    """Replace isolated spikes of up to `max_run` samples with a straight line between their neighbours."""
    if len(x) < 128:
        return x
    res = np.abs(x - _medfilt(x))
    csum = np.concatenate([[0.0], np.cumsum(res, dtype=np.float64)])
    w = 64
    env = (csum[w:] - csum[:-w]) / w
    env = np.pad(env, (w // 2, len(x) - len(env) - w // 2), mode="edge")
    flag = (res > 0.08) & (res > 12 * env)
    if not flag.any():
        return x
    x = x.copy()
    idx = np.flatnonzero(flag)
    for r in np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1):
        if len(r) > max_run:
            continue                           # longer than a click: real signal, leave it
        lo, hi = max(0, r[0] - 1), min(len(x) - 1, r[-1] + 1)
        x[r[0]: r[-1] + 1] = np.interp(np.arange(r[0], r[-1] + 1), [lo, hi], [x[lo], x[hi]])
    return x


LEAD_KEEP_S, TAIL_KEEP_S = 0.06, 0.15
PEAK_TARGET = 10 ** (-1.0 / 20)                # -1 dBFS
GAIN_MIN, GAIN_MAX = 0.5, 3.0                  # "gentle"


def polish(a, sr: int) -> tuple[np.ndarray, float]:
    """DC offset, isolated clicks, leading/trailing silence, gentle peak normalise to -1 dBFS.
    Returns (audio, seconds_cut_from_start). Only ever shortens the silence; never touches the words."""
    a = np.asarray(a, np.float32).ravel()
    if len(a) == 0:
        return a, 0.0
    a = _declick(a - float(np.mean(a)))
    n = max(1, int(0.01 * sr))
    k = len(a) // n
    start = 0
    if k >= 3:
        rms = np.sqrt(np.mean(a[: k * n].reshape(k, n) ** 2, axis=1))
        act = np.flatnonzero(rms > max(0.003, 0.03 * float(np.percentile(rms, 95))))
        if len(act):
            start = max(0, int(act[0] * n - LEAD_KEEP_S * sr))
            end = min(len(a), int((act[-1] + 1) * n + TAIL_KEEP_S * sr))
            a = a[start:end]
    pk = float(np.max(np.abs(a))) if len(a) else 0.0
    if pk > 1e-6:
        g = float(np.clip(PEAK_TARGET / pk, GAIN_MIN, GAIN_MAX))
        a = a * g
        if g == GAIN_MIN and pk * g > PEAK_TARGET:      # very hot input: attenuate more than "gentle" rather than clip
            a = a * (PEAK_TARGET / (pk * g))
    return a.astype(np.float32), start / sr


def best(reports: list[Report]) -> int:
    return max(range(len(reports)), key=lambda i: (reports[i].ok, reports[i].score, -i))


def to_markdown(sid: str, reports: list[Report], chosen: int, engine: str) -> str:
    def cell(xs):
        return "; ".join(xs).replace("|", "/") or "-"
    rows = [f"**Voice check {sid}** ({engine}), chosen take: {chosen + 1}", "",
            "| take | ok | score | hard | soft | retake hint |", "|---|---|---|---|---|---|"]
    for i, r in enumerate(reports):
        rows.append(f"| {i + 1}{' *' if i == chosen else ''} | {'yes' if r.ok else 'NO'} | {r.score:.0f} | "
                    f"{cell(r.hard)} | {cell(r.soft)} | {r.hint or '-'} |")
    return "\n".join(rows) + "\n"
