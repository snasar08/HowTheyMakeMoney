"""Text-to-speech. synthesize() returns (mono float32 audio at SAMPLE_RATE,
word timings or None). Word timings are [(word, start_s, end_s), ...].

Engines (VOICE_ENGINE env var):
  kokoro  - default. Kokoro-82M, Apache-2.0, fast on CPU, gives word timestamps.
  ming    - Ming-3.0-tts-0.5b (MIT). Only GPU-tested upstream; experimental on CPU.
            Needs the Ming-3.0-tts repo on the path (MING_REPO). Falls back to Kokoro.
  qwen    - Qwen3-TTS (Apache-2.0) voice clone, far more human than Kokoro (Nov 3). Too heavy for
            the pipeline venv, so pipeline/voice_prepass.py voices every sentence ahead of time on
            separate GitHub machines into VOICE_CACHE (wav + Whisper word timings). A Short only
            uses it when EVERY sentence is cached (one voice per Short); otherwise Kokoro.
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
# Optional second speaker for back-and-forth lines (Nov 1, Sam picked sample #5: am_puck blended with
# am_michael). A sentence starting with "B:" is read in this voice; everything else stays KOKORO_VOICE.
KOKORO_VOICE2 = os.environ.get("KOKORO_VOICE2", "am_puck,am_michael")
SPEAKER_B = re.compile(r"^\s*B:\s*")


def strip_speakers(text: str) -> str:
    """Narration as shown in captions / checked by Whisper: speaker tags removed."""
    return re.sub(r"(?<![A-Za-z])B:\s*", "", text)

_kokoro = {}
_ming_model = None
VOICE_CACHE = os.path.join(os.environ.get("HTMM_CACHE", ".cache"), "voice")
QWEN_VOICE = os.environ.get("QWEN_VOICE", "narrator4")  # assets/voice/<name>.wav + .txt = the cloned voice
_engine_now = None  # set per Short by use_engine_for(); None = VOICE_ENGINE


def sentences(text: str) -> list[tuple[str, bool, bool]]:
    """(sentence, is_question, is_speaker_b) exactly as the engines split a line."""
    out = []
    for sent in (p for s_ in SENTENCE.split(text) for p in (breath_split(s_.strip()) if s_.strip() else [s_])):
        if not sent.strip():
            continue
        b = bool(SPEAKER_B.match(sent))
        sent = SPEAKER_B.sub("", sent).strip()
        out.append((sent, sent.endswith("?"), b))
    return out


def cache_path(sent: str) -> str:
    import hashlib
    return os.path.join(VOICE_CACHE, hashlib.sha1(f"{QWEN_VOICE}|{sent}".encode()).hexdigest()[:20])


def _gemini_voice() -> str:
    """Repo variable GEMINI_VOICE wins; else the voice the Gemini test picked (assets/voice/gemini_voice.txt)."""
    v = os.environ.get("GEMINI_VOICE", "").strip()
    if v:
        return v
    f = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "voice", "gemini_voice.txt")
    return open(f, encoding="utf-8").read().strip() if os.path.exists(f) else "Charon"


GEMINI_VOICE = _gemini_voice()


def line_path(line: str) -> str:
    """Cache key for a whole line voiced in one pass (Gemini TTS, Nov 13): reads like a person, not a list."""
    import hashlib
    return os.path.join(VOICE_CACHE, "L" + hashlib.sha1(f"gemini:{GEMINI_VOICE}|{line}".encode()).hexdigest()[:20])


def qwen_ready(texts) -> bool:
    return all(os.path.exists(line_path(speakable(t)) + ".wav")
               or all(os.path.exists(cache_path(s) + ".wav") for s, _, b in sentences(speakable(t)) if not b)
               for t in texts)


def use_engine_for(texts):
    """Pick one engine for a whole Short so the voice never changes mid-video."""
    global _engine_now
    _engine_now = None
    if VOICE_ENGINE == "qwen":
        if qwen_ready(texts):
            _engine_now = "qwen"
        else:
            print("::warning::[tts] new voice not ready for every line of this Short; using Kokoro")
            _engine_now = "kokoro"
    return _engine_now or VOICE_ENGINE


QWEN_SPEED = float(os.environ.get("QWEN_SPEED", "1.1"))


def _atempo(a, speed: float):
    """Time-stretch without changing pitch (ffmpeg atempo); returns the input unchanged if ffmpeg fails."""
    import subprocess
    try:
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
                            "-filter:a", f"atempo={speed:.3f}", "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "pipe:1"],
                           input=np.asarray(a, np.float32).tobytes(), capture_output=True, check=True)
        out = np.frombuffer(r.stdout, np.float32)
        return out if len(out) > len(a) / speed * 0.8 else a
    except Exception as e:  # noqa: BLE001
        print(f"::warning::[tts] atempo failed ({e!r}); normal speed", flush=True)
        return a


def qwen(text: str):
    """Assemble cached Qwen sentences like kokoro() does: trimmed gaps, a beat after questions,
    word timings shifted into place. Speaker-B lines use Kokoro's second voice."""
    import json

    import soundfile as sf
    lp = line_path(text)
    if os.path.exists(lp + ".wav"):              # the whole line in one Gemini pass
        a, sr = sf.read(lp + ".wav", dtype="float32")
        if a.ndim > 1:
            a = a.mean(axis=1)
        if sr != SAMPLE_RATE:
            a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * SAMPLE_RATE / sr)), np.arange(len(a)), a).astype(np.float32)
        loud = np.flatnonzero(np.abs(a) > 0.02)
        c0 = max(0, int(loud[0]) - int(LEAD_KEEP * SAMPLE_RATE)) if len(loud) else 0
        c1 = min(len(a), int(loud[-1]) + int(TAIL_KEEP * SAMPLE_RATE)) if len(loud) else len(a)
        shift = c0 / SAMPLE_RATE
        ws = [(t, max(0.0, st - shift), min((c1 - c0) / SAMPLE_RATE, en - shift))
              for t, st, en in json.load(open(lp + ".json", encoding="utf-8"))]
        return np.asarray(a[c0:c1], np.float32), (ws or None)
    chunks, words, offset = [], [], 0.0
    for sent, q, b in sentences(text):
        if b:
            a, w = kokoro(sent, voice=KOKORO_VOICE2)
            ws = w or []
        else:
            a, sr = sf.read(cache_path(sent) + ".wav", dtype="float32")
            if a.ndim > 1:
                a = a.mean(axis=1)
            if sr != SAMPLE_RATE:
                idx = np.linspace(0, len(a) - 1, int(len(a) * SAMPLE_RATE / sr))
                a = np.interp(idx, np.arange(len(a)), a).astype(np.float32)
            loud = np.flatnonzero(np.abs(a) > 0.02)
            c0 = max(0, int(loud[0]) - int(LEAD_KEEP * SAMPLE_RATE)) if len(loud) else 0
            c1 = min(len(a), int(loud[-1]) + int(TAIL_KEEP * SAMPLE_RATE)) if len(loud) else len(a)
            a, shift = a[c0:c1], c0 / SAMPLE_RATE
            ws = [(t, max(0.0, st - shift), min(len(a) / SAMPLE_RATE, en - shift))
                  for t, st, en in json.load(open(cache_path(sent) + ".json", encoding="utf-8"))]
            if abs(QWEN_SPEED - 1.0) > 0.01:      # same pitch, faster read (the deeper narrator reads ~15% slower)
                n0, a = len(a), _atempo(a, QWEN_SPEED)
                k = n0 / max(len(a), 1)           # the real stretch (1.0 if ffmpeg failed)
                ws = [(t, st / k, min(len(a) / SAMPLE_RATE, en / k)) for t, st, en in ws]
        words += [(t, offset + st, offset + en) for t, st, en in ws]
        chunks.append(np.asarray(a, np.float32))
        offset += len(a) / SAMPLE_RATE
        if q:
            chunks.append(np.zeros(int(QUESTION_BEAT * SAMPLE_RATE), np.float32))
            offset += QUESTION_BEAT
    return np.concatenate(chunks), (words or None)


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


BREATH_MAX = 14  # words; longer sentences get split so no line runs past ~6 s in one breath
_JOIN = re.compile(r",\s+|\s+(?=(?:and|but|so|because|which|while)\s)")


def breath_split(sent: str) -> list[str]:
    """Split a long sentence at the comma/conjunction nearest its middle (both halves >= 5 words).
    Each half is its own Kokoro call, so it gets a natural breath; the words don't change."""
    words = sent.split()
    if len(words) <= BREATH_MAX:
        return [sent]
    mid, best = len(sent) / 2, None
    for m in _JOIN.finditer(sent):
        a, b = sent[:m.start()].rstrip(), sent[m.end():].lstrip()
        if len(a.split()) >= 5 and len(b.split()) >= 5 and (best is None or abs(m.start() - mid) < abs(best[0] - mid)):
            best = (m.start(), a + ",", b)
    if best is None:
        return [sent]
    return breath_split(best[1]) + breath_split(best[2])


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
    for sent in (p for s in SENTENCE.split(text) for p in (breath_split(s.strip()) if s.strip() else [s])):
        if not sent.strip():
            continue
        q = sent.rstrip().endswith("?")
        v = voice
        if SPEAKER_B.match(sent):
            sent, v = SPEAKER_B.sub("", sent), KOKORO_VOICE2
        # Kokoro swallows a weak first syllable ("Across" -> "cross", "The rest" -> "rest",
        # per clarity_check). A leading "..." gives it a run-up and fixes it.
        for res in _kokoro[lang]("... " + sent, voice=v, speed=speed * (QUESTION_SPEED if q else 1.0)):
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
    engine = _engine_now or VOICE_ENGINE
    if engine == "qwen":
        try:
            a, w = qwen(text)
            return normalize(a), w
        except Exception as exc:  # never lose a night
            print(f"::warning::[tts] cached voice failed ({exc!r}); falling back to Kokoro")
            engine = "kokoro"
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
