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
KOKORO_VOICE = os.environ.get("KOKORO_VOICE", "am_fenrir")
KOKORO_SPEED = float(os.environ.get("KOKORO_SPEED", "1.35"))
MING_VOICE = os.environ.get("MING_VOICE", "US_James")

_kokoro = {}
_ming_model = None


def speakable(text: str) -> str:
    t = text.replace("%", " percent").replace("&", " and ").replace("~", "about ")
    t = re.sub(r"\$(\d[\d,.]*)\s*(billion|million|trillion)", r"\1 \2 dollars", t)
    return re.sub(r"\s+", " ", t).strip()


def kokoro(text: str, voice: str | None = None, speed: float | None = None):
    voice = voice or KOKORO_VOICE
    speed = speed or KOKORO_SPEED
    lang = "b" if voice.startswith("b") else "a"
    if lang not in _kokoro:
        from kokoro import KPipeline

        _kokoro[lang] = KPipeline(lang_code=lang)
    chunks, words, offset = [], [], 0.0
    for res in _kokoro[lang](text, voice=voice, speed=speed):
        audio = getattr(res, "audio", None)
        if audio is None and isinstance(res, tuple):
            audio = res[2]
        if audio is None:
            continue
        a = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
        a = a.astype(np.float32).reshape(-1)
        for tok in getattr(res, "tokens", None) or []:
            st, en = getattr(tok, "start_ts", None), getattr(tok, "end_ts", None)
            txt = getattr(tok, "text", "")
            if st is not None and en is not None and re.search(r"\w", txt or ""):
                words.append((txt, offset + float(st), offset + float(en)))
        chunks.append(a)
        offset += len(a) / SAMPLE_RATE
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
