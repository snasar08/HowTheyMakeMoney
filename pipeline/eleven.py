"""ElevenLabs voice (REST, no SDK): one text-to-speech call with timestamps per Short, like the Edge flow path.

  POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps   -> base64 mp3 + per-character alignment
  GET  https://api.elevenlabs.io/v1/user/subscription                          -> character_count / character_limit

The key is read from ELEVENLABS_API_KEY only when a request is built; it is never printed, logged or cached.
Responses are cached by a hash of voice + model + settings + text (VOICE_CACHE/E<hash>.json, no secrets inside),
so a Short is never paid for twice. Any API problem raises ElevenError and the caller falls back to Edge.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import urllib.error
import urllib.request

API = "https://api.elevenlabs.io/v1"
# premade voices (ids checked against GET https://api.elevenlabs.io/v1/voices, Nov 26): Adam = "Dominant, Firm", Brian = "Deep, Resonant and Comforting"
VOICES = {"adam": "pNInz6obpgDQGcFmaJgB", "brian": "nPczCjzI2devNBz1zQrb"}
OUTPUT_FORMAT = "mp3_44100_128"


class ElevenError(RuntimeError):
    status = None


def _env(name: str, default: str) -> str:
    return (os.environ.get(name) or "").strip() or default   # an unset repo variable arrives as ""


def voice_id() -> str:
    v = _env("ELEVEN_VOICE_ID", VOICES["adam"])
    return VOICES.get(v.lower(), v)


def model_id() -> str:
    return _env("ELEVEN_MODEL", "eleven_multilingual_v2")


def settings() -> dict:
    return {"stability": float(_env("ELEVEN_STABILITY", "0.45")),
            "similarity_boost": float(_env("ELEVEN_SIMILARITY", "0.8")),
            "style": float(_env("ELEVEN_STYLE", "0.2")),
            "use_speaker_boost": _env("ELEVEN_SPEAKER_BOOST", "1") not in ("0", "false", "no"),
            "speed": float(_env("ELEVEN_SPEED", "1.1"))}


def cache_key(text: str, voice: str | None = None, model: str | None = None, vs: dict | None = None) -> str:
    """Stable hash of everything that changes the audio. Never includes the API key."""
    blob = json.dumps({"voice": voice or voice_id(), "model": model or model_id(), "settings": vs or settings(), "text": text},
                      sort_keys=True, ensure_ascii=True)
    return "E" + hashlib.sha256(blob.encode()).hexdigest()[:24]


def _request(method: str, url: str, body: dict | None = None, timeout: int = 180) -> dict:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise ElevenError("no ELEVENLABS_API_KEY")
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:   # message only: no headers, no key
        detail = ""
        try:
            detail = json.loads(e.read().decode("utf-8", "replace")).get("detail", "")
            detail = detail.get("message", detail) if isinstance(detail, dict) else detail
        except Exception:  # noqa: BLE001
            pass
        err = ElevenError(f"HTTP {e.code} {str(detail)[:160]}")
        err.status = e.code
        raise err from None
    except Exception as e:  # noqa: BLE001
        raise ElevenError(f"{type(e).__name__}: {str(e)[:120]}") from None


def remaining_chars() -> int:
    s = _request("GET", f"{API}/user/subscription", timeout=30)
    return int(s["character_limit"]) - int(s["character_count"])


def words_from_alignment(alignment: dict) -> list[tuple[str, float, float]]:
    """Character alignment -> [(word, start_s, end_s)]: a word is a run of non-space characters, its start is the first
    character's start and its end the last character's end."""
    chars = alignment["characters"]
    t0, t1 = alignment["character_start_times_seconds"], alignment["character_end_times_seconds"]
    if not (len(chars) == len(t0) == len(t1)):
        raise ElevenError("alignment lists differ in length")
    words, cur, s, e = [], [], 0.0, 0.0
    for c, a, b in zip(chars, t0, t1):
        if c.isspace():
            if cur:
                words.append(("".join(cur), float(s), float(e)))
                cur = []
            continue
        if not cur:
            s = a
        cur.append(c)
        e = b
    if cur:
        words.append(("".join(cur), float(s), float(e)))
    return words


def synth(text: str, cache_dir: str, voice: str | None = None) -> tuple[bytes, list, int, bool]:
    """`text` in ONE call -> (mp3 bytes, words, characters billed, from_cache). A cached response costs nothing."""
    vs, v, m = settings(), voice or voice_id(), model_id()
    path = os.path.join(cache_dir, cache_key(text, v, m, vs) + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return base64.b64decode(d["audio_base64"]), [tuple(w) for w in d["words"]], 0, True
    need = len(text)
    try:
        left = remaining_chars()
        if left < need:
            raise ElevenError(f"only {left} characters left this month, this Short needs {need}")
    except ElevenError as e:
        if e.status not in (401, 403):   # a key without the "user read" permission cannot see the quota: try the call itself
            raise
        print("::warning title=eleven::cannot read the subscription (key lacks user read permission?); trying anyway", flush=True)
    r = _request("POST", f"{API}/text-to-speech/{v}/with-timestamps?output_format={OUTPUT_FORMAT}",
                 {"text": text, "model_id": m, "voice_settings": vs})
    if not r.get("audio_base64") or not r.get("alignment"):
        raise ElevenError("response had no audio or alignment")
    words = words_from_alignment(r["alignment"])
    os.makedirs(cache_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"audio_base64": r["audio_base64"], "words": words, "chars": need, "voice": v, "model": m}, f)
    return base64.b64decode(r["audio_base64"]), words, need, False
