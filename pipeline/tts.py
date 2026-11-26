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
QWEN_VOICE = os.environ.get("QWEN_VOICE", "umbriel")  # assets/voice/<name>.wav + .txt = the cloned voice
_engine_now = None  # set per Short by use_engine_for(); None = VOICE_ENGINE


def sentences(text: str) -> list[tuple[str, bool, bool]]:
    """(sentence, is_question, is_speaker_b) exactly as the engines split a line."""
    out = []
    split = (lambda x: [x]) if (VOICE_SOURCE == "edge" and not SPEAKER_B.search(text)) else breath_split
    for sent in (p for s_ in SENTENCE.split(text) for p in (split(s_.strip()) if s_.strip() else [s_])):
        if not sent.strip():
            continue
        b = bool(SPEAKER_B.match(sent))
        sent = SPEAKER_B.sub("", sent).strip()
        out.append((sent, sent.endswith("?"), b))
    return out


# Nov 26, Sam: "i dont like voice ... use what everyone else uses that is free and liked". Default source is now
# Microsoft Edge neural voices (edge-tts): free, no key, no daily quota, the voices MoneyPrinterTurbo/ShortGPT-style
# faceless channels use. VOICE_SOURCE=gemini|qwen brings the old voices back. Edge audio is cached per SENTENCE
# (so the question beat keeps working), keyed by voice+rate so the old Umbriel cache is never reused.
VOICE_SOURCE = os.environ.get("VOICE_SOURCE", "edge")
EDGE_VOICE = os.environ.get("EDGE_VOICE", "en-US-AndrewMultilingualNeural")
EDGE_RATE = {"story": os.environ.get("EDGE_RATE_STORY", "+18%"), "default": os.environ.get("EDGE_RATE", "+18%")}
EDGE_PITCH = os.environ.get("EDGE_PITCH", "+8Hz")
EDGE_RATE_NOW = EDGE_RATE["default"]   # render.py sets this per Short like VOICE_SPEED_NOW


# Nov 26 flow fix (Sam: "the voice is fine but it doesn't flow right"). The Edge voice used to be made one SENTENCE
# (or half sentence, breath_split) at a time, trimmed and glued with fixed gaps: pitch and energy reset every few
# words and the speed jumped. Now every line (or the whole narration, FLOW_SCOPE) is ONE edge-tts call at ONE rate, so
# the voice carries its own melody; word timings come from the service's WordBoundary events; natural pauses stay
# (only silences longer than PAUSE_CAP are shortened). Cache key carries FLOW_TAG so old per-sentence clips are never reused.
FLOW_TAG = "flow1"
FLOW_SCOPE = os.environ.get("FLOW_SCOPE", "short")   # "line" = one call per scene line, "short" = the whole narration in one call
PAUSE_CAP = float(os.environ.get("PAUSE_CAP", "0.22"))      # s: a silence longer than this is shortened to it (reference Shorts: almost no pauses)
QUESTION_CAP = float(os.environ.get("QUESTION_CAP", "0.32"))  # s: the brief beat kept after a question / reveal colon


def edge_rate_for(question: bool = False) -> str:
    """Edge rate string. One rate for everything (the old 7% drop on questions made the speed jump)."""
    return EDGE_RATE_NOW


def cache_path(sent: str) -> str:
    import hashlib
    key = f"edge:{FLOW_TAG}:{EDGE_VOICE}:{EDGE_RATE_NOW}:{EDGE_PITCH}|{sent}" if VOICE_SOURCE == "edge" else f"{QWEN_VOICE}|{sent}"
    return os.path.join(VOICE_CACHE, hashlib.sha1(key.encode()).hexdigest()[:20])


def flow_path(line: str) -> str:
    """Cache key of one line voiced in one Edge call (wav + json word timings)."""
    import hashlib
    return os.path.join(VOICE_CACHE, "F" + hashlib.sha1(
        f"edge:{FLOW_TAG}:{EDGE_VOICE}:{EDGE_RATE_NOW}:{EDGE_PITCH}|{line}".encode()).hexdigest()[:20])


def cap_pauses(a, words, cap: float = None, sr: int = SAMPLE_RATE, q_cap: float = None):
    """Shorten every silence longer than `cap` seconds to `cap` (cut from the middle of the silence, 8 ms crossfade) and
    shift the word timings to match. Shorter pauses are untouched, so the read keeps its own rhythm."""
    cap = PAUSE_CAP if cap is None else cap
    q_cap = QUESTION_CAP if q_cap is None else q_cap
    a = np.asarray(a, np.float32)
    fr = int(0.01 * sr)
    k = len(a) // fr
    if k < 3:
        return a, words
    rms = np.sqrt(np.mean(a[:k * fr].reshape(k, fr) ** 2, axis=1))
    sil = rms < max(0.004, 0.04 * float(np.percentile(rms, 95)))
    cuts, i = [], 0       # (cut_start_sample, cut_end_sample)
    while i < k:
        if sil[i]:
            j = i
            while j < k and sil[j]:
                j += 1
            prev = [w for w in words if w[2] <= i * 0.01 + 0.08]
            c_here = q_cap if prev and prev[-1][0].rstrip('")').endswith(("?", ":")) else cap
            if (j - i) * 0.01 > c_here and i > 0 and j < k:          # inside the read, not the lead/tail
                excess = int(((j - i) * 0.01 - c_here) * sr)
                mid = (i + j) * fr // 2
                cuts.append((mid - excess // 2, mid - excess // 2 + excess))
            i = j
        else:
            i += 1
    if not cuts:
        return a, words
    out, pos, removed = [], 0, []
    for c0, c1 in cuts:
        out.append(a[pos:c0])
        pos = c1
    out.append(a[pos:])
    n = int(0.008 * sr)
    res = out[0]
    for seg in out[1:]:
        if len(res) > n and len(seg) > n:
            fade = np.linspace(0, 1, n, dtype=np.float32)
            res = np.concatenate([res[:-n], res[-n:] * (1 - fade) + seg[:n] * fade, seg[n:]])
        else:
            res = np.concatenate([res, seg])

    def shift(t):
        s_ = t * sr
        return (s_ - sum(min(max(s_ - c0, 0), c1 - c0) for c0, c1 in cuts)) / sr
    return res, [(w, max(0.0, shift(st)), max(0.0, shift(en))) for w, st, en in words]


FLOW_JOIN = os.environ.get("FLOW_JOIN", " ")   # how lines are glued when the whole narration goes in one call


def flow_join(lines: list[str]) -> str:
    return FLOW_JOIN.join(lines)


FLOW_LEVEL = os.environ.get("FLOW_LEVEL", "1") != "0"
LEVEL_SYL_S = 5.4        # syllables/s the sentences are nudged toward (the channel's measured pace)
LEVEL_DB = -17.0         # RMS dB the sentences are nudged toward
LEVEL_TEMPO = 0.08       # max +-8% speed change per sentence (atempo: same pitch)
LEVEL_GAIN_DB = 3.0      # max +-3 dB gain change per sentence


def level_flow(a, words, sr: int = SAMPLE_RATE):
    """Even out the read WITHOUT cutting it: each sentence (words ending . ? !) gets a half-strength nudge toward the
    channel pace and loudness (speed +-8% via atempo, gain +-3 dB, 12 ms fades at the seams). Sentence seams sit in the
    middle of the silence between sentences, so no word is touched. Returns (audio, words)."""
    from . import prosody
    a = np.asarray(a, np.float32)
    if len(words) < 4:
        return a, words
    ends = [i for i, w in enumerate(words) if w[0].rstrip('")').endswith((".", "?", "!"))]
    if not ends or ends[-1] != len(words) - 1:
        ends.append(len(words) - 1)
    segs, st = [], 0
    for e in ends:
        segs.append((st, e))
        st = e + 1
    if len(segs) < 2:
        return a, words
    cuts = [0.0] + [(words[e][2] + words[e + 1][1]) / 2 for _s, e in segs[:-1]] + [len(a) / sr]
    out, new_words, t_out, n = [], [], 0.0, int(0.012 * sr)
    for k, (i, e) in enumerate(segs):
        piece = a[int(cuts[k] * sr):int(cuts[k + 1] * sr)]
        talk = words[e][2] - words[i][1]
        syl = sum(prosody.syllables(w[0]) for w in words[i:e + 1])
        tempo = 1.0
        if talk > 0.2 and syl >= 3:
            tempo = float(np.clip((LEVEL_SYL_S / (syl / talk)) ** 0.5, 1 - LEVEL_TEMPO, 1 + LEVEL_TEMPO))
        loud = piece[np.abs(piece) > 0.02]
        gain = 1.0
        if len(loud) > sr // 10:
            db = 20 * np.log10(float(np.sqrt(np.mean(loud ** 2))) + 1e-9) - 3.0   # rms of the voiced samples ~ rms of the sentence + 3 dB
            gain = 10 ** (float(np.clip(0.5 * (LEVEL_DB - db), -LEVEL_GAIN_DB, LEVEL_GAIN_DB)) / 20)
        if abs(tempo - 1.0) > 0.005:
            p2 = _atempo(piece, tempo)
            k_real = len(piece) / max(len(p2), 1)
        else:
            p2, k_real = piece, 1.0
        p2 = np.asarray(p2, np.float32) * gain
        if len(p2) > 2 * n:
            p2[:n] *= np.linspace(0, 1, n, dtype=np.float32)
            p2[-n:] *= np.linspace(1, 0, n, dtype=np.float32)
        for w, st_, en_ in words[i:e + 1]:
            new_words.append((w, t_out + (st_ - cuts[k]) / k_real, t_out + (en_ - cuts[k]) / k_real))
        out.append(p2)
        t_out += len(p2) / sr
    return np.concatenate(out), new_words


def flow_ready(line: str) -> bool:
    return os.path.exists(flow_path(line) + ".wav") and os.path.exists(flow_path(line) + ".json")


def flow_load(line: str):
    """The cached one-call read of a line -> (audio at SAMPLE_RATE with only its lead/tail trimmed and long pauses capped,
    word timings)."""
    import json

    import soundfile as sf
    fp = flow_path(line)
    a, sr = sf.read(fp + ".wav", dtype="float32")
    if a.ndim > 1:
        a = a.mean(axis=1)
    if sr != SAMPLE_RATE:
        a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * SAMPLE_RATE / sr)), np.arange(len(a)), a).astype(np.float32)
    words = [tuple(x) for x in json.load(open(fp + ".json", encoding="utf-8"))]
    loud = np.flatnonzero(np.abs(a) > 0.02)
    c0 = max(0, int(loud[0]) - int(LEAD_KEEP * SAMPLE_RATE)) if len(loud) else 0
    c1 = min(len(a), int(loud[-1]) + int(TAIL_KEEP * SAMPLE_RATE)) if len(loud) else len(a)
    a = a[c0:c1]
    n = len(a) / SAMPLE_RATE
    words = [(t, max(0.0, st - c0 / SAMPLE_RATE), min(n, en - c0 / SAMPLE_RATE)) for t, st, en in words]
    a, words = cap_pauses(a, words)
    if FLOW_LEVEL:
        a, words = level_flow(a, words)
    return a, words


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
    src = f"gemini:{GEMINI_VOICE}" if VOICE_SOURCE != "edge" else f"edge-unused:{EDGE_VOICE}"   # edge never uses whole-line files
    return os.path.join(VOICE_CACHE, "L" + hashlib.sha1(f"{src}|{line}".encode()).hexdigest()[:20])


def qwen_ready(texts) -> bool:
    if VOICE_SOURCE == "edge":
        return all(not speakable(t).strip() or flow_ready(speakable(t))
                   or all(os.path.exists(cache_path(s) + ".wav") for s, _, b in sentences(speakable(t)) if not b)
                   for t in texts)
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


QWEN_SPEED = float(os.environ.get("QWEN_SPEED", "1.0"))   # 1.0 for the Umbriel clone (1.1 made some lines rushed, Nov 15)
# Nov 14, Sam: the Gemini voice is "a tad too deep" -> raised one semitone, same speed and timing
GEMINI_PITCH_ST = float(os.environ.get("GEMINI_PITCH_ST", "1.5"))   # Sam picked +1.5 over +1
# Nov 15 (Sam: the Nike story was "very very slow"; his reference channel reads ~1.3x faster than we did):
# the Gemini read is sped up with atempo (same pitch/voice). render.py sets it per Short from VOICE_SPEED_FOR.
VOICE_SPEED_FOR = {"story": float(os.environ.get("VOICE_SPEED_STORY", "1.2")),
                   "default": float(os.environ.get("VOICE_SPEED", "1.1"))}
VOICE_SPEED_NOW = 1.0
# Nov 15: the Umbriel clone sat at 142 Hz vs real Umbriel +1.5 at 136 Hz -> lower it 0.75 st to match
QWEN_PITCH_ST = float(os.environ.get("QWEN_PITCH_ST", "-0.75")) if QWEN_VOICE == "umbriel" else 0.0


def _pitch(a, st: float, sr: int = SAMPLE_RATE):
    """Shift pitch by st semitones, keeping duration (ffmpeg asetrate + atempo); unchanged if ffmpeg fails."""
    import subprocess
    f = 2 ** (st / 12)
    try:
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
                            "-filter:a", f"asetrate={sr * f:.1f},aresample={sr},atempo={1 / f:.5f}",
                            "-f", "f32le", "-ar", str(sr), "-ac", "1", "pipe:1"],
                           input=np.asarray(a, np.float32).tobytes(), capture_output=True, check=True)
        out = np.frombuffer(r.stdout, np.float32)
        return out if abs(len(out) - len(a)) < 0.05 * len(a) + sr * 0.05 else a
    except Exception as e:  # noqa: BLE001
        print(f"::warning::[tts] pitch shift failed ({e!r}); original pitch", flush=True)
        return a


def level_pieces(pieces, texts, sr: int, shift_total: float = None, in_pieces: float = 0.0, target: float = None,
                 fade_s: float = 0.012):
    """Nov 17: the register drifted between Shorts (Ninja 121 Hz, Shaq 167 Hz vs Nike 131 Hz) and inside one.
    Free post-processing, no extra Gemini request. ONE pitch shift per line: the Short-level delta that lands the
    Short's median on CHANNEL_HZ (total shift, shift_total + delta, clamped 0..+3 st so it is still Umbriel) plus a
    +-2 st nudge for lines far from the Short's median; then a short fade at both ends so joining never clicks.
    `shift_total` = what the listener ends up with before leveling (default GEMINI_PITCH_ST, which qwen() applies
    later); `in_pieces` = how much of it the pieces already carry. Returns (pieces, info)."""
    from . import prosody
    shift_total = GEMINI_PITCH_ST if shift_total is None else shift_total
    delta, nudges, info = prosody.level_plan(pieces, texts, sr, shift_total, target, in_pieces)
    out, n = [], max(1, int(fade_s * sr))
    for p, nz in zip(pieces, nudges):
        q, st = np.asarray(p, np.float32), delta + nz
        if abs(st) > 0.02:
            q = _pitch(q, st, sr).copy()
            if len(q) > 2 * n:
                q[:n] *= np.linspace(0, 1, n, dtype=np.float32)
                q[-n:] *= np.linspace(1, 0, n, dtype=np.float32)
        out.append(q)
    info.update(delta_st=delta, nudges=nudges)
    return out, info


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
    if VOICE_SOURCE == "edge" and not SPEAKER_B.search(text) and flow_ready(text):
        return flow_load(text)                   # the whole line in one Edge call, natural pauses kept
    lp = line_path(text)
    if os.path.exists(lp + ".wav"):              # the whole line in one Gemini pass
        a, sr = sf.read(lp + ".wav", dtype="float32")
        if a.ndim > 1:
            a = a.mean(axis=1)
        if sr != SAMPLE_RATE:
            a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * SAMPLE_RATE / sr)), np.arange(len(a)), a).astype(np.float32)
        if abs(GEMINI_PITCH_ST) > 0.01 and VOICE_SOURCE != "edge":
            a = _pitch(a, GEMINI_PITCH_ST)
        k = 1.0
        if abs(VOICE_SPEED_NOW - 1.0) > 0.01:   # same voice and pitch, quicker read (Sam, Nov 15: Nike "very very slow")
            n0, a = len(a), _atempo(a, VOICE_SPEED_NOW)
            k = n0 / max(len(a), 1)
        loud = np.flatnonzero(np.abs(a) > 0.02)
        c0 = max(0, int(loud[0]) - int(LEAD_KEEP * SAMPLE_RATE)) if len(loud) else 0
        c1 = min(len(a), int(loud[-1]) + int(TAIL_KEEP * SAMPLE_RATE)) if len(loud) else len(a)
        shift = c0 / SAMPLE_RATE
        ws = [(t, max(0.0, st / k - shift), min((c1 - c0) / SAMPLE_RATE, en / k - shift))
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
            if abs(QWEN_SPEED - 1.0) > 0.01 and VOICE_SOURCE != "edge":      # same pitch, faster read (the deeper narrator reads ~15% slower)
                n0, a = len(a), _atempo(a, QWEN_SPEED)
                k = n0 / max(len(a), 1)           # the real stretch (1.0 if ffmpeg failed)
                ws = [(t, st / k, min(len(a) / SAMPLE_RATE, en / k)) for t, st, en in ws]
            if abs(QWEN_PITCH_ST) > 0.01 and VOICE_SOURCE != "edge":         # same length, so word timings stay
                a = _pitch(a, QWEN_PITCH_ST)
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
