"""Google Gemini TTS (Nov 13): the model family at or near the top of the public TTS arenas, with a free tier and
directable delivery (a style per request, <short pause> tags, CAPS for emphasis). Needs the GEMINI_API_KEY secret
(made by Sam in Google AI Studio; never typed or printed by Claude). Standard library only.

  say(text, voice="Charon", style="...") -> (float32 mono audio, 24000)
"""
from __future__ import annotations

import base64
import io
import json
import os
import time
import urllib.error
import urllib.request
import wave

import numpy as np

API = "https://generativelanguage.googleapis.com/v1beta"
MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
STYLE = os.environ.get("GEMINI_TTS_STYLE", (
    "a warm, confident man in his thirties explaining something fascinating to a friend; natural and "
    "conversational, like a great YouTube explainer; medium-low pitch, relaxed but engaged, real rise and fall, "
    "lands each number with quiet excitement; never monotone, never sing-song, never announcer-like"))


def _post(url: str, body: dict, key: str) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def _pcm(raw: bytes) -> np.ndarray:
    if raw[:4] == b"RIFF":
        with wave.open(io.BytesIO(raw)) as w:
            raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, "<i2").astype(np.float32) / 32768.0


def _find_audio(obj) -> bytes | None:
    """The base64 audio, wherever the response puts it (Interactions: steps[].content[].data;
    generateContent: candidates[].content.parts[].inlineData.data)."""
    if isinstance(obj, dict):
        for k in ("inlineData", "inline_data"):
            if k in obj and isinstance(obj[k], dict) and obj[k].get("data"):
                return base64.b64decode(obj[k]["data"])
        if obj.get("type") == "audio" and isinstance(obj.get("data"), str):
            return base64.b64decode(obj["data"])
        for v in obj.values():
            a = _find_audio(v)
            if a:
                return a
    elif isinstance(obj, list):
        for v in reversed(obj):
            a = _find_audio(v)
            if a:
                return a
    return None


def say(text: str, voice: str = "Charon", style: str | None = None, model: str | None = None,
        tries: int = 4) -> tuple[np.ndarray, int]:
    key = os.environ["GEMINI_API_KEY"]
    model = model or MODEL
    style = STYLE if style is None else style
    bodies = [
        (f"{API}/interactions", {
            "model": model,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text, "annotations": (
                [{"type": "speech_metadata", "style": style}] if style else [])}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice}]}}),
        (f"{API}/models/{model}:generateContent", {   # older endpoint, in case Interactions is unavailable
            "contents": [{"parts": [{"text": (f"Read this {style}:\n{text}" if style else text)}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}),
    ]
    last = None
    for attempt in range(tries):
        for url, body in bodies:
            try:
                audio = _find_audio(_post(url, body, key))
                if audio:
                    return _pcm(audio), 24000
                last = "no audio in response"
            except urllib.error.HTTPError as e:
                last = f"HTTP {e.code}: {e.read()[:300]!r}"
                if e.code == 429:            # free-tier rate limit: wait and retry
                    time.sleep(30 * (attempt + 1))
                    break
            except Exception as e:  # noqa: BLE001
                last = repr(e)
        time.sleep(2)
    raise RuntimeError(f"gemini tts failed: {last}")
