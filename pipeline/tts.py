"""Text-to-speech. synthesize() returns (mono float32 audio at SAMPLE_RATE,
word timings or None). Word timings are [(word, start_s, end_s), ...].

Engines (VOICE_ENGINE env var):
  kokoro  - default. Kokoro-82M, Apache-2.0, fast on CPU, gives word timestamps.
  ming    - Ming-3.0-tts-0.5b (MIT). Only GPU-tested upstream; experimental on CPU.
            Needs the Ming-3.0-tts repo on the path (MING_REPO). Falls back to Kokoro.
  silent  - placeholder audio for layout tests.
"""
from __future__ import annotations

import os
import re
import sys

import numpy as np

SAMPLE_RATE = 24000

VOICE_ENGINE = os.environ.get("VOICE_ENGINE", "kokoro")
KOKORO_VOICE = os.environ.get("KOKORO_VOICE", "am_puck")  # Oct 30: Sam wants a male voice; top-rated male, most expressive
KOKORO_SPEED = float(os.environ.get("KOKORO_SPEED", "1.2"))  # Sam: this speed is right
QUESTION_SPEED = 0.93   # questions slightly slower so they land as questions
QUESTION_BEAT = 0.5     # Sam: half-second beat after a question, then the answer
LEAD_KEEP, TAIL_KEEP = 0.06, 0.14  # silence kept before/after each sentence
SENTENCE = re.compile(r"(?<=[.?!])\s+(?=[A-Z\"'$0-9])")
MING_VOICE = os.environ.get("MING_VOICE", "US_James")

_kokoro = {}
_ming_model = None


# words Kokoro tends to misread; whole-word, case-sensitive
SAY = {"vs.": "versus", "vs": "versus", "e.g.": "for example", "i.e.": "that is",
       "Inc.": "Inc", "approx.": "about", "No.": "number", "AI": "A.I.", "CEO": "C.E.O.", "NBA": "N.B.A.",
       "NFL": "N.F.L.", "IPO": "I.P.O.", "Q1": "the first quarter", "Q2": "the second quarter",
       "Q3": "the third quarter", "Q4": "the fourth quarter", "FY": "fiscal year", "YouTube": "YouTube"}
_SAY = re.compile(r"(?<![\w.])(" + "|".join(re.escape(k) for k in sorted(SAY, key=len, reverse=True)) + r")(?![\w])")


def speakable(text: str) -> str:
    t = _SAY.sub(lambda m: SAY[m.group(1)], text)
    t = t.replace("%", " percent").replace("&", " and ").replace("~", "about ")
    t = re.sub(r"\$(\d[\d,.]*)\s*(billion|million|trillion)", r"\1 \2 dollars", t)
    t = re.sub(r"\$(\d[\d,.]*)([BMK])\b",
               lambda m: f"{m.group(1)} {dict(B='billion', M='million', K='thousand')[m.group(2)]} dollars", t)
    return re.sub(r"\s+", " ", t).strip()


def kokoro(text: str, voice: str | None = None, speed: float | None = None):
    voice = voice or KOKORO_VOICE
    speed = speed or KOKORO_SPEED
    lang = "b" if voice.startswith("b") else "a"
    if lang not in _kokoro:
        from kokoro import KPipeline

        _kokoro[lang] = KPipeline(lang_code=lang)
    chunks, words, offset = [], [], 0.0
    # One sentence per call: read as one block, Kokoro flattens the melody and a question
    # comes out sounding like a statement (Sam: "you don't realize it's a question").
    # Questions are read a touch slower, with a short beat after them.
    for sent in SENTENCE.split(text):
        if not sent.strip():
            continue
        q = sent.rstrip().endswith("?")
        # Kokoro swallows a weak first syllable ("Across" -> "cross", "The rest" -> "rest",
        # per clarity_check). A leading "..." gives it a run-up and fixes it.
        for res in _kokoro[lang]("... " + sent, voice=voice, speed=speed * (QUESTION_SPEED if q else 1.0)):
            audio = getattr(res, "audio", None)
            if audio is None and isinstance(res, tuple):
                audio = res[2]
            if audio is None:
                continue
            a = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
            a = a.astype(np.float32).reshape(-1)
            # the "..." run-up leaves silence; keep only a natural gap between sentences
            loud = np.flatnonzero(np.abs(a) > 0.02)
            cut0 = max(0, int(loud[0]) - int(LEAD_KEEP * SAMPLE_RATE)) if len(loud) else 0
            cut1 = min(len(a), int(loud[-1]) + int(TAIL_KEEP * SAMPLE_RATE)) if len(loud) else len(a)
            a = a[cut0:cut1]
            shift = cut0 / SAMPLE_RATE
            for tok in getattr(res, "tokens", None) or []:
                st, en = getattr(tok, "start_ts", None), getattr(tok, "end_ts", None)
                txt = getattr(tok, "text", "")
                if st is not None and en is not None and re.search(r"\w", txt or ""):
                    words.append((txt, offset + max(0.0, float(st) - shift),
                                  offset + min(len(a) / SAMPLE_RATE, float(en) - shift)))
            chunks.append(a)
            offset += len(a) / SAMPLE_RATE
        if q:
            chunks.append(np.zeros(int(QUESTION_BEAT * SAMPLE_RATE), np.float32))
            offset += QUESTION_BEAT
    if not chunks:
        raise RuntimeError("Kokoro returned no audio")
    return np.concatenate(chunks), (words or None)


def ming(text: str):
    """Ming-3.0-tts built-in voice ('IP' task). API per the repo cookbook."""
    global _ming_model
    import tempfile

    import soundfile as sf

    repo = os.environ.get("MING_REPO", "Ming-3.0-tts")
    if repo not in sys.path:
        sys.path.insert(0, repo)
    if _ming_model is None:
        from ming_tts import MingTTS  # type: ignore

        _ming_model = MingTTS(os.environ.get("MING_MODEL", "inclusionAI/Ming-3.0-tts-0.5b"))
    out = tempfile.mktemp(suffix=".wav")
    kwargs = dict(task="IP", text=text, controls={"ip": MING_VOICE}, use_zero_spk_emb=True)
    try:
        res = _ming_model.synthesize(output_path=out, **kwargs)
    except TypeError:
        res = _ming_model.synthesize(**kwargs)
    if os.path.exists(out):
        audio, sr = sf.read(out, dtype="float32")
    else:
        if isinstance(res, dict):
            res = res.get("audio", res.get("wav"))
        if isinstance(res, tuple):
            res, sr = res[0], res[1]
        else:
            sr = getattr(_ming_model, "sample_rate", 24000)
        audio = res.detach().cpu().numpy() if hasattr(res, "detach") else np.asarray(res)
    audio = np.asarray(audio, np.float32)
    if audio.ndim > 1:
        audio = audio.mean(axis=0 if audio.shape[0] < audio.shape[-1] else 1)
    if sr != SAMPLE_RATE:
        idx = np.linspace(0, len(audio) - 1, int(len(audio) * SAMPLE_RATE / sr))
        audio = np.interp(idx, np.arange(len(audio)), audio).astype(np.float32)
    return audio, None


def silent(text: str):
    seconds = max(1.2, len(text.split()) / 3.1)
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (0.02 * np.sin(2 * np.pi * 220 * t)).astype(np.float32), None


def synthesize(text: str):
    text = speakable(text)
    engine = VOICE_ENGINE
    if engine == "ming":
        try:
            a, w = ming(text)
            return normalize(a), w
        except Exception as exc:  # never lose a night
            print(f"::warning::[tts] Ming failed ({exc!r}); falling back to Kokoro")
            engine = "kokoro"
    if engine == "kokoro":
        a, w = kokoro(text)
        return normalize(a), w
    return silent(text)


def normalize(a: np.ndarray, peak: float = 0.89) -> np.ndarray:
    a = np.asarray(a, np.float32)
    m = float(np.max(np.abs(a))) or 1.0
    return a * (peak / m)
