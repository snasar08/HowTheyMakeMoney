"""Can a listener actually make out every word? Runs speech recognition (Whisper, CPU) on the
final mix — voice plus music, what viewers hear — and compares it with the script. Sam noticed
some words don't come through clearly; this flags them.

A word counts as unclear when Whisper hears something else (or nothing) there, or hears it but
with low confidence. Whisper's own language model papers over some mumbles, so passing here is a
floor, not proof; failing is a strong sign the word is hard to hear.

check() returns (issues, stats). Skipped quietly if openai-whisper isn't installed or
CLARITY_CHECK=off.
"""
from __future__ import annotations

import difflib
import os
import re

import numpy as np

MODEL = os.environ.get("CLARITY_MODEL", "base.en")
CLARITY_MIN = float(os.environ.get("CLARITY_MIN", "0.95"))  # share of script words heard right
PROB_MIN = 0.45  # Whisper's confidence below this = heard, but barely

_NUM = {w: str(i) for i, w in enumerate("zero one two three four five six seven eight nine ten eleven "
                                        "twelve thirteen fourteen fifteen sixteen seventeen eighteen "
                                        "nineteen twenty".split())}
_model = None


def tokens(text: str) -> list[str]:
    """Raw word tokens; '$' stays on the number until fix_dollars() runs over the stream."""
    text = text.lower().replace("%", " percent").replace("&", " and ").replace("u.s.", "us")
    out = []
    for t in re.findall(r"\$?\d[\d.,]*|\.\d+|[a-z']+", text):
        t = t.strip(",'").rstrip(".")
        if t:
            out.append(_NUM.get(t, t.replace(",", "")))
    return out


def fix_dollars(toks: list) -> list:
    """Whisper writes '$5 .9 billion' for 'five point nine billion dollars'. Rejoin split
    decimals and move '$' to a trailing 'dollars' so both sides compare equal. Items are
    (token, payload) pairs; the payload rides along."""
    out = []
    for t, p in toks:
        if t.startswith(".") and out and re.fullmatch(r"\$?\d+", out[-1][0]):
            out[-1] = (out[-1][0] + t, out[-1][1])
            continue
        out.append((t, p))
    res, i = [], 0
    while i < len(out):
        t, p = out[i]
        if t.startswith("$"):
            res.append((t[1:], p))
            if i + 1 < len(out) and out[i + 1][0] in ("million", "billion", "trillion", "thousand"):
                res.append(out[i + 1])
                i += 1
            res.append(("dollars", p))
        else:
            res.append((t, p))
        i += 1
    return res


def _resample(x: np.ndarray, sr: int, to: int = 16000) -> np.ndarray:
    n = int(len(x) * to / sr)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def transcribe(audio: np.ndarray, sr: int) -> list[tuple[str, float, float]]:
    global _model
    import whisper
    if _model is None:
        _model = whisper.load_model(MODEL, device="cpu")
    res = _model.transcribe(_resample(audio, sr), language="en", fp16=False, temperature=0,
                            word_timestamps=True, condition_on_previous_text=False)
    return [(w["word"], w["start"], w.get("probability", 1.0))
            for seg in res["segments"] for w in seg.get("words", [])]


def check(scenes, starts, mix: np.ndarray, sr: int) -> tuple[list[str], dict]:
    if os.environ.get("CLARITY_CHECK", "on") == "off":
        return [], {}
    try:
        heard = transcribe(mix, sr)
    except ImportError:
        return [], {"clarity": None}

    # expected tokens, each tagged with the script word and its time
    e = fix_dollars([(t, (w.text, starts[i] + w.start))
                     for i, sc in enumerate(scenes) for w in sc.words for t in tokens(w.text)])
    exp, exp_at = [t for t, _ in e], [a for _, a in e]
    g = fix_dollars([(t, p) for word, _, p in heard for t in tokens(word)])
    got, got_p = [t for t, _ in g], [p for _, p in g]
    if not exp:
        return [], {}

    ok = [False] * len(exp)
    weak = []
    for a, b, n in difflib.SequenceMatcher(None, exp, got, autojunk=False).get_matching_blocks():
        for k in range(n):
            ok[a + k] = True
            if got_p[b + k] < PROB_MIN:
                weak.append(a + k)
    score = sum(ok) / len(exp)

    issues = []
    misses, i = [], 0
    while i < len(exp):  # group consecutive misses into one phrase
        if not ok[i]:
            j = i
            while j < len(exp) and not ok[j]:
                j += 1
            words = " ".join(dict.fromkeys(exp_at[k][0] for k in range(i, j)))
            misses.append(f"'{words}' at {exp_at[i][1]:.1f}s")
            i = j
        else:
            i += 1
    if score < CLARITY_MIN:
        issues.append(f"clarity {score:.0%} (min {CLARITY_MIN:.0%}) — hard to hear: " + "; ".join(misses))
    for k in weak:
        issues.append(f"'{exp_at[k][0]}' at {exp_at[k][1]:.1f}s heard but unclear (low confidence)")
    heard_text = " ".join(w.strip() for w, _, _ in heard)
    return issues, {"clarity": round(score, 3), "unclear_words": misses + [exp_at[k][0] for k in weak],
                    "heard": heard_text}
