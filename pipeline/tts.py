"""Text-to-speech. Returns mono float32 audio at SAMPLE_RATE.

Engines (set VOICE_ENGINE env var):
  kokoro  - default. Kokoro-82M, Apache-2.0, runs fast on CPU.
  ming    - Ming-3.0-tts (MIT). Higher quality but heavier; needs the
            Ming-3.0-tts GitHub repo installed (see CLAUDE.md). Optional.
  silent  - placeholder audio for layout testing only (no speech).
"""
from __future__ import annotations

import os
import re

import numpy as np

SAMPLE_RATE = 24000

VOICE_ENGINE = os.environ.get("VOICE_ENGINE", "kokoro")
# Kokoro American English male voice. Alternatives: am_fenrir, am_puck, af_heart.
KOKORO_VOICE = os.environ.get("KOKORO_VOICE", "am_michael")
KOKORO_SPEED = float(os.environ.get("KOKORO_SPEED", "1.05"))

_kokoro_pipeline = None
_ming_model = None


def _speakable(text: str) -> str:
    """Small fixes so numbers and symbols read naturally."""
    t = text.replace("%", " percent").replace("&", " and ")
    t = re.sub(r"\$(\d[\d,.]*)\s*(billion|million|trillion)", r"\1 \2 dollars", t)
    t = t.replace("~", "about ")
    return re.sub(r"\s+", " ", t).strip()


def _kokoro(text: str) -> np.ndarray:
    global _kokoro_pipeline
    if _kokoro_pipeline is None:
        from kokoro import KPipeline  # noqa: WPS433

        _kokoro_pipeline = KPipeline(lang_code="a")
    chunks = []
    for _, _, audio in _kokoro_pipeline(text, voice=KOKORO_VOICE, speed=KOKORO_SPEED):
        if audio is None:
            continue
        a = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
        chunks.append(a.astype(np.float32))
    if not chunks:
        raise RuntimeError("Kokoro returned no audio")
    return np.concatenate(chunks)


def _ming(text: str) -> np.ndarray:
    """Ming-3.0-tts via its official repo (github.com/inclusionAI/Ming-3.0-tts).

    The repo must be cloned and importable (MING_REPO env var points at it).
    Verify the API against the repo README; adjust here if it changed.
    """
    global _ming_model
    import sys
    import tempfile

    import soundfile as sf

    repo = os.environ.get("MING_REPO", "Ming-3.0-tts")
    if repo not in sys.path:
        sys.path.insert(0, repo)
    if _ming_model is None:
        from ming_tts import MingTTS  # type: ignore  # provided by the Ming repo

        _ming_model = MingTTS(os.environ.get("MING_MODEL", "inclusionAI/Ming-3.0-tts-0.5B"))
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        out = f.name
    kwargs = {"task": "TTS", "text": text, "output_path": out}
    if os.environ.get("MING_PROMPT_AUDIO"):
        kwargs["prompt_audio"] = os.environ["MING_PROMPT_AUDIO"]
    _ming_model.generate(**kwargs)
    audio, sr = sf.read(out, dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != SAMPLE_RATE:
        idx = np.linspace(0, len(audio) - 1, int(len(audio) * SAMPLE_RATE / sr))
        audio = np.interp(idx, np.arange(len(audio)), audio).astype(np.float32)
    return audio


def _silent(text: str) -> np.ndarray:
    seconds = max(1.2, len(text.split()) / 2.6)
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (0.02 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def synthesize(text: str) -> np.ndarray:
    text = _speakable(text)
    engine = VOICE_ENGINE
    if engine == "ming":
        try:
            return _normalize(_ming(text))
        except Exception as exc:  # fall back so a night is never lost
            print(f"[tts] Ming failed ({exc!r}); falling back to Kokoro")
            engine = "kokoro"
    if engine == "kokoro":
        return _normalize(_kokoro(text))
    return _silent(text)


def _normalize(a: np.ndarray, peak: float = 0.89) -> np.ndarray:
    a = a.astype(np.float32)
    m = float(np.max(np.abs(a))) or 1.0
    return a * (peak / m)
