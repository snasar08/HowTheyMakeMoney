"""Voice a script's lines with Qwen3-TTS ahead of the render (runs in its own Python 3.12 venv:
torch CPU, qwen-tts, openai-whisper, soundfile). Writes VOICE_CACHE/<key>.wav + .json word timings
for every sentence the renderer will ask for, in the cloned voice assets/voice/<QWEN_VOICE>.wav.

  python -m pipeline.voice_prepass 043 [044 ...]

Sentences already cached are skipped, so reruns are cheap. Only needs numpy from the pipeline.
"""
from __future__ import annotations

import difflib
import json
import os
import re
import sys
import time
from pathlib import Path

import numpy as np

from . import clarity_check, prosody, tts

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "assets" / "voice"
MAX_TAKES = 6  # a flagged line (unclear words, or monotone / sing-song / off-pitch, pipeline/prosody.py) is re-recorded; the best take is kept
RETAKE_UNTIL_S = 40 * 60  # no new retakes after this, so the job stays well inside its time limit
SHORT_WORD_S = 0.06


def lines_for(script: dict) -> list[str]:
    """Every text render.prepare() sends to tts.synthesize, in the same form."""
    src = (ROOT / "pipeline" / "render.py").read_text(encoding="utf-8")
    m = re.search(r'CTA_LINE = os\.environ\.get\("CTA_LINE", "([^"]+)"\)', src)
    cta = " ".join(p.strip() for p in script.get("cta", os.environ.get("CTA_LINE", m.group(1))).split("|") if p.strip())
    return [sc["narration"] for sc in script["scenes"]] + [cta, (script.get("loop") or "").strip()]


def problems(sent: str, heard: list[dict]) -> list[str]:
    """What a listener would trip on in one take: missed, barely heard or rushed words."""
    def norm(pairs):
        out = []  # "49 thousand", "$49,000" and "885 ,000" must all compare equal
        for t, p in clarity_check.fix_dollars([(t, p) for text, p in pairs for t in clarity_check.tokens(text)]):
            if out and out[-1][0].isdigit() and t in ("thousand", "000"):
                out[-1] = (out[-1][0] + "000", out[-1][1])
            elif t == "000" and len(out) > 1 and out[-1][0] == "dollars" and out[-2][0].isdigit():
                out[-2] = (out[-2][0] + "000", out[-2][1])
            else:
                out.append((t, p))
        return out
    exp = [t for t, _ in norm([(sent, None)])]
    got = norm([(tts.speakable(x["word"]), x) for x in heard])
    words = [t for t, _ in got]
    out, ok = [], [False] * len(exp)
    for a, b, n in difflib.SequenceMatcher(None, exp, words, autojunk=False).get_matching_blocks():
        for k in range(n):
            ok[a + k] = True
            x = got[b + k][1]
            if x.get("probability", 1.0) < clarity_check.PROB_MIN:
                out.append(f"unclear:{exp[a + k]}")
    out += [f"missed:{t}" for t, hit in zip(exp, ok) if not hit]
    for x in heard:
        if sum(c.isalpha() for c in x["word"]) >= 3 and x["end"] - x["start"] < SHORT_WORD_S:
            out.append(f"rushed:{x['word'].strip()}")
    return out


GEMINI_TAKES = int(os.environ.get("GEMINI_TAKES", "2"))   # whole-Short takes (each is one request of 10/day)
LINE_FIXES = int(os.environ.get("GEMINI_LINE_FIXES", "2"))  # then up to this many single-line re-records per Short
DROP_ST, RISE_ST = 2.3, 3.5   # a line whose pitch sits this far below / above the rest of the read sounds "off"


def odd_lines(parts, sr) -> None:
    """Nov 14, Sam: "the way it says 'just to help his family' gets me nervous". That line had dropped ~2.9 semitones
    below the rest of the read (a sudden low, croaky tone) and nothing flagged it. Flag any line whose median pitch
    is far from the Short's median: it sounds like a different mood."""
    med = {i: prosody.measure(p[1], sr)["median_hz"] for i, p in enumerate(parts)}
    vals = [v for v in med.values() if v]
    if len(vals) < 3:
        return
    ref = float(np.median(vals))
    for i, p in enumerate(parts):
        if med[i] and len(p[0].split()) >= prosody.MIN_WORDS:
            d = 12 * np.log2(med[i] / ref)
            if d < -DROP_ST or d > RISE_ST:
                p[3].append(f"odd-pitch:{d:+.1f}st")


def channel_dist_st(pieces, sr) -> float:
    """|semitones| between the Short's voiced median (after the render's GEMINI_PITCH_ST) and CHANNEL_HZ, 0.5 st steps."""
    m = prosody.short_median(pieces, sr) * 2 ** (tts.GEMINI_PITCH_ST / 12)
    return round(abs(12 * float(np.log2(m / prosody.CHANNEL_HZ))) * 2) / 2 if m else 99.0


def split_lines(lines: list[str], heard: list[dict], total: float):
    """Cut points between lines of a whole-Short read: midway between the last heard word of a line and the
    first of the next (words matched to the script with difflib). None if any line can't be found."""
    exp, owner = [], []
    for i, ln in enumerate(lines):
        for t in clarity_check.tokens(ln):
            exp.append(t)
            owner.append(i)
    got, gw = [], []
    for k, x in enumerate(heard):
        for t in clarity_check.tokens(tts.speakable(x["word"])):
            got.append(t.lstrip("$"))
            gw.append(k)
    exp_n = [t.lstrip("$") for t in exp]
    first, last = {}, {}
    for a, b, n in difflib.SequenceMatcher(None, exp_n, got, autojunk=False).get_matching_blocks():
        for j in range(n):
            i, k = owner[a + j], gw[b + j]
            first.setdefault(i, k)
            first[i] = min(first[i], k)
            last[i] = max(last.get(i, k), k)
    if len(first) < len(lines):
        return None
    cuts = [0.0]
    for i in range(len(lines) - 1):
        e, s = float(heard[last[i]]["end"]), float(heard[first[i + 1]]["start"])
        if s < e:
            return None
        cuts.append((e + s) / 2)
    cuts.append(total)
    return list(zip(cuts[:-1], cuts[1:]))


def gemini_pass(ids: list[str]) -> bool:
    """Voice every line of the Short(s) with Gemini TTS, one pass per line, re-recording a line that fails
    the clarity or natural-delivery test (best take kept). All lines or nothing: a Short never mixes voices."""
    import soundfile as sf
    import whisper
    from . import gemini_tts
    ok = True
    for sid in ids:                            # one Short at a time: each is its own single request
        ok = _gemini_short(sid) and ok
    return ok


def _gemini_short(sid: str) -> bool:
    import soundfile as sf
    import whisper
    from . import gemini_tts
    lines = []
    for sid in [sid]:
        path = next((ROOT / "content" / "scripts").glob(f"{sid}*.json"), None)
        if path:
            lines += [tts.speakable(x) for x in lines_for(json.loads(path.read_text(encoding="utf-8"))) if x.strip()]
    lines = list(dict.fromkeys(lines))
    if not lines or all(os.path.exists(tts.line_path(x) + ".wav") for x in lines):
        return True
    asr = whisper.load_model("base.en")
    best = None
    for take in range(1, GEMINI_TAKES + 1):
        try:   # the whole Short in ONE request: it flows like one read, and fits the free tier's 10 a day
            w, sr = gemini_tts.say("\n\n".join(lines), voice=tts.GEMINI_VOICE)
        except Exception as e:  # noqa: BLE001
            print(f"::warning title=voice::gemini: {str(e)[:300]}", flush=True)
            break
        a16 = np.interp(np.linspace(0, len(w) - 1, int(len(w) * 16000 / sr)), np.arange(len(w)), w).astype(np.float32)
        heard = [x for seg in asr.transcribe(a16, language="en", word_timestamps=True, fp16=False)["segments"]
                 for x in seg.get("words", [])]
        segs = split_lines(lines, heard, len(w) / sr)
        if not segs:
            print(f"[prepass] gemini take {take}: could not find every line in the read; retaking", flush=True)
            continue
        parts, bad_all = [], []
        for line, (t0, t1) in zip(lines, segs):
            piece = w[int(t0 * sr):int(t1 * sr)]
            ws = [(x["word"].strip(), float(x["start"]) - t0, float(x["end"]) - t0) for x in heard if t0 <= float(x["start"]) < t1]
            # "rushed" is left out for Gemini: in fluent speech Whisper's word timings often give a normally
            # spoken short word (The, and, Still) under 60 ms (Nov 14: 4 of 6 "failures" on a clean read were this)
            bad = [b for b in problems(line, [x for x in heard if t0 <= float(x["start"]) < t1])
                   if not b.startswith("rushed:")] + prosody.problems(piece, sr, line)
            parts.append((line, piece, ws, bad))
        odd_lines(parts, sr)
        bad_all = [b for p in parts for b in p[3]]
        # among takes, the one nearer the channel pitch wins (after flags; no extra requests): distance in semitones
        # of the take's pooled median, as heard after the +GEMINI_PITCH_ST shift, from CHANNEL_HZ
        rank = (sum(bool(p[3]) for p in parts), channel_dist_st([p[1] for p in parts], sr), prosody.badness(w, sr, " ".join(lines)))
        if best is None or rank < best[0]:
            best = (rank, parts, sr)
        if not bad_all:
            break
        print(f"[prepass] gemini take {take} flagged {bad_all[:4]}", flush=True)
    if best is None:
        return False                           # API down or out of quota: the caller falls back
    _rank, parts, sr = best
    # a line that still fails after the whole-Short takes gets re-recorded on its own (one request each)
    fixes = 0
    for k, (line, piece, ws, bad) in enumerate(parts):
        if not bad or fixes >= LINE_FIXES:
            continue
        fixes += 1
        try:
            w2, sr2 = gemini_tts.say(line, voice=tts.GEMINI_VOICE)
        except Exception as e:  # noqa: BLE001
            print(f"::warning title=voice::gemini line retake: {str(e)[:200]}", flush=True)
            break
        if sr2 != sr:
            w2 = np.interp(np.linspace(0, len(w2) - 1, int(len(w2) * sr / sr2)), np.arange(len(w2)), w2).astype(np.float32)
        a16 = np.interp(np.linspace(0, len(w2) - 1, int(len(w2) * 16000 / sr)), np.arange(len(w2)), w2).astype(np.float32)
        h2 = [x for seg in asr.transcribe(a16, language="en", word_timestamps=True, fp16=False)["segments"]
              for x in seg.get("words", [])]
        trial = parts[:k] + [(line, w2, [], [])] + parts[k + 1:]
        bad2 = [b for b in problems(line, h2) if not b.startswith("rushed:")] + prosody.problems(w2, sr, line)
        trial[k] = (line, w2, [(x["word"].strip(), float(x["start"]), float(x["end"])) for x in h2], bad2)
        odd_lines([(p[0], p[1], p[2], list(p[3]) if i != k else p[3]) for i, p in enumerate(trial)], sr)
        if len(trial[k][3]) < len(bad):
            print(f"[prepass] line re-recorded ({bad[:2]} -> {trial[k][3][:2]}): {line[:50]}", flush=True)
            parts[k] = trial[k]
    # Nov 17: level the register (Short median -> CHANNEL_HZ, outlier lines nudged), one pitch shift, no requests
    try:
        lv, info = tts.level_pieces([p[1] for p in parts], [p[0] for p in parts], sr)
        print(f"[prepass] leveled: median {info.get('median_hz', 0):.0f} Hz -> {info.get('new_median_hz', 0):.0f} Hz "
              f"(shift {info.get('delta_st', 0):+.1f} st, line nudges {[round(x, 1) for x in info.get('nudges', []) if x]})", flush=True)
        parts = [(p[0], q, p[2], p[3]) for p, q in zip(parts, lv)]
    except Exception as e:  # noqa: BLE001
        print(f"::warning title=voice::leveling skipped: {e!r}", flush=True)
    for line, piece, ws, _bad in parts:
        sf.write(tts.line_path(line) + ".wav", piece, sr)
        Path(tts.line_path(line) + ".json").write_text(json.dumps(ws), encoding="utf-8")
    passed = sum(not p[3] for p in parts)
    print(f"::notice title=voice test::Gemini {tts.GEMINI_VOICE}: {passed}/{len(parts)} line(s) pass "
          f"(clear words + natural pitch movement), one read of the whole Short", flush=True)
    return True


def _decode_mp3(f: str):
    import subprocess
    try:   # libsndfile reads mp3 (no ffmpeg needed on the voice machines); ffmpeg as the fallback
        import soundfile as sf
        a, sr0 = sf.read(f, dtype="float32")
        a = a.mean(axis=1) if a.ndim > 1 else a
        if sr0 != 24000:
            a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * 24000 / sr0)), np.arange(len(a)), a).astype(np.float32)
        return a
    except Exception:  # noqa: BLE001
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", f, "-f", "f32le", "-ar", "24000", "-ac", "1", "pipe:1"],
                           capture_output=True, check=True)
        return np.frombuffer(r.stdout, np.float32)


def edge_stream(text: str, rate: str, voice: str | None = None, pitch: str | None = None):
    """`text` in ONE edge-tts call -> (float32 mono, 24000, [(word, start_s, end_s)]). The words come from the
    service's own WordBoundary events (exact for this audio, no Whisper guess); a boundary that holds two words
    ("2,700 years") is split by letter count."""
    import asyncio
    import tempfile

    import edge_tts
    f = tempfile.mktemp(suffix=".mp3")

    async def go():
        ev, buf = [], bytearray()
        c = edge_tts.Communicate(text, voice or tts.EDGE_VOICE, rate=rate, pitch=pitch or tts.EDGE_PITCH, boundary="WordBoundary")
        async for ch in c.stream():
            if ch["type"] == "audio":
                buf += ch["data"]
            elif ch["type"] == "WordBoundary":
                ev.append(ch)
        Path(f).write_bytes(bytes(buf))
        return ev
    last = None
    for attempt in range(4):
        try:
            ev = asyncio.run(go())
            a = _decode_mp3(f)
            os.unlink(f)
            if len(a) > 2400:
                words = []
                for e in ev:
                    t0, d = e["offset"] / 1e7, e["duration"] / 1e7
                    parts = e["text"].split()
                    tot = sum(len(x) for x in parts) or 1
                    acc = 0
                    for x in parts:
                        words.append((x, t0 + d * acc / tot, t0 + d * (acc + len(x)) / tot))
                        acc += len(x)
                return a, 24000, words
            last = "empty audio"
        except Exception as e:  # noqa: BLE001
            last = repr(e)
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"edge-tts failed: {last}")


def edge_say(text: str, rate: str, voice: str | None = None, pitch: str | None = None):
    """One piece of text through Microsoft Edge neural TTS (edge-tts, free, no key) -> (float32 mono, 24000)."""
    a, sr, _w = edge_stream(text, rate, voice, pitch)
    return a, sr


def cut_lines(lines: list[str], a, sr: int, words):
    """Cut the one-call read of several lines into one piece per line, inside the silence between the last word of a
    line and the first of the next (words matched to the script by their letters). Returns [(audio, words)] or None."""
    norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())  # noqa: E731
    owner = [i for i, ln in enumerate(lines) for w in ln.split() if norm(w)]
    toks = [(norm(w), st, en, w) for w, st, en in words if norm(w)]
    if len(toks) != len(owner):
        return None
    first, last = {}, {}
    for k, i in enumerate(owner):
        first.setdefault(i, k)
        last[i] = k
    cuts = [0.0]
    for i in range(len(lines) - 1):
        e, s_ = toks[last[i]][2], toks[first[i + 1]][1]
        cuts.append((e + s_) / 2 if s_ > e else e)
    cuts.append(len(a) / sr)
    out = []
    for i in range(len(lines)):
        t0, t1 = cuts[i], cuts[i + 1]
        ws = [(w, st - t0, en - t0) for _n, st, en, w in toks[first[i]:last[i] + 1]]
        out.append((a[int(t0 * sr):int(t1 * sr)], ws))
    return out


def with_punctuation(line: str, words):
    """Give each timed word its script spelling (with . , ? :) when the two lists line up, so tts can keep a beat after a question."""
    sw = line.split()
    if len(sw) == len(words):
        return [(w, st, en) for w, (_t, st, en) in zip(sw, words)]
    return words


def eleven_stream(text: str, voice: str | None = None):
    """`text` in ONE ElevenLabs call (pipeline/eleven.py: cached by hash, quota checked first) -> (float32 mono, 24000,
    [(word, start_s, end_s)], characters billed). Raises eleven.ElevenError on any API problem."""
    import tempfile

    from . import eleven
    mp3, words, used, _cached = eleven.synth(text, tts.VOICE_CACHE, voice)
    f = tempfile.mktemp(suffix=".mp3")
    try:
        Path(f).write_bytes(mp3)
        a = _decode_mp3(f)
    finally:
        if os.path.exists(f):
            os.unlink(f)
    if len(a) <= 2400:
        raise eleven.ElevenError("empty audio")
    return a, 24000, words, used


def gemini_stream(text: str):
    """`text` in ONE free Gemini TTS request (voice tts.GEMINI_FLOW_VOICE) -> (float32 mono, 24000, Whisper word dicts).
    Word timings from Whisper. Raises on any problem (quota, error, silence)."""
    import whisper
    from . import gemini_tts
    global _ASR
    w, sr = gemini_tts.say(text, voice=tts.GEMINI_FLOW_VOICE)
    a = np.asarray(w, np.float32).ravel()
    if sr != 24000:
        a = np.interp(np.linspace(0, len(a) - 1, int(len(a) * 24000 / sr)), np.arange(len(a)), a).astype(np.float32)
    if abs(tts.GEMINI_FLOW_PITCH_ST) > 0.01:
        a = tts._pitch(a, tts.GEMINI_FLOW_PITCH_ST)
    if len(a) <= 2400:
        raise RuntimeError("gemini returned no audio")
    _ASR = _ASR or whisper.load_model("base.en")
    a16 = np.interp(np.linspace(0, len(a) - 1, int(len(a) * 16000 / 24000)), np.arange(len(a)), a).astype(np.float32)
    heard = [x for seg in _ASR.transcribe(a16, language="en", word_timestamps=True, fp16=False)["segments"]
             for x in seg.get("words", []) if x["word"].strip()]
    return a, 24000, heard


def gemini_cut(lines: list[str], a, sr: int, heard):
    """Cut a Gemini read into one piece per line with split_lines (the fuzzy Whisper matcher the old Gemini path used:
    Whisper writes numbers as digits and can mishear names, so exact letter matching fails). -> [(audio, words)] or None."""
    segs = split_lines(lines, heard, len(a) / sr)
    if not segs:
        return None
    out = []
    for t0, t1 in segs:
        ws = [(x["word"].strip(), float(x["start"]) - t0, float(x["end"]) - t0) for x in heard if t0 <= float(x["start"]) < t1]
        out.append((a[int(t0 * sr):int(t1 * sr)], ws))
    return out


_ASR = None


def _voice_groups(groups: list[list[str]], engine: str):
    """Voice each group of lines in one call -> ([(line, audio, words)], sr, characters billed)."""
    out, used, sr = [], 0, 24000
    for grp in groups:
        if engine == "gemini":   # free quota: no line-by-line fallback; one retake, then the Short falls back to the next engine
            pieces = None
            for _take in range(2):
                a, sr, heard = gemini_stream(tts.flow_join(grp))
                pieces = gemini_cut(grp, a, sr, heard)
                if pieces is not None:
                    break
                print("[prepass] gemini: could not match words to lines; retaking", flush=True)
            if pieces is None:
                raise RuntimeError("gemini read did not match the script twice")
            out += [(line, pa, pw) for line, (pa, pw) in zip(grp, pieces)]
            continue
        if engine == "eleven":
            a, sr, words, n = eleven_stream(tts.flow_join(grp))
            used += n
        else:
            a, sr, words = edge_stream(tts.flow_join(grp), tts.edge_rate_for())
        pieces = [(a, words)] if len(grp) == 1 else cut_lines(grp, a, sr, words)
        if pieces is None:
            print("[prepass] could not match words to lines; voicing line by line", flush=True)
            if engine == "eleven":
                pieces = [(p[0], p[2]) for p in (eleven_stream(x) for x in grp)]
            else:
                pieces = [(p[0], p[2]) for p in (edge_stream(x, tts.edge_rate_for()) for x in grp)]
        out += [(line, pa, pw) for line, (pa, pw) in zip(grp, pieces)]
    return out, sr, used


def edge_pass(ids: list[str]) -> int:
    """Voice every line of the Short(s) with the flow engine: ElevenLabs when VOICE_SOURCE=eleven (key present), else Edge
    neural TTS. FLOW_SCOPE=short: the whole narration in ONE call; =line: one call per line. No splitting into sentences:
    the voice keeps its own melody and natural pauses. Word timings come from the service (Edge WordBoundary events /
    ElevenLabs character alignment). If ElevenLabs fails for a Short (quota, 401, 429, any error) that Short is voiced
    by Edge instead, so posting never stops; a Short never mixes the two voices."""
    import soundfile as sf
    os.makedirs(tts.VOICE_CACHE, exist_ok=True)
    asr, seen = None, set()
    fails = 0
    gemini_ok = tts.VOICE_SOURCE == "geminiflow" and bool(os.environ.get("GEMINI_API_KEY", "").strip())
    eleven_ok = tts.VOICE_SOURCE == "eleven" or (tts.VOICE_SOURCE == "geminiflow" and bool(os.environ.get("ELEVENLABS_API_KEY", "").strip()))
    for sid in ids:
        path = next((ROOT / "content" / "scripts").glob(f"{sid}*.json"), None)
        if not path:
            continue
        script = json.loads(path.read_text(encoding="utf-8"))
        tts.EDGE_RATE_NOW = tts.EDGE_RATE.get(script.get("format"), tts.EDGE_RATE["default"])   # same rate render.py will ask for
        lines = [tts.speakable(x) for x in lines_for(script) if x.strip()]
        todo = [x for x in dict.fromkeys(lines) if not tts.flow_ready(x) and not tts.SPEAKER_B.search(x)]
        if not todo:
            continue
        groups = [todo] if tts.FLOW_SCOPE == "short" else [[x] for x in todo]
        voiced, sr, engine = None, 24000, "edge"
        if gemini_ok:
            try:
                voiced, sr, _ = _voice_groups(groups, "gemini")
                engine = "gemini"
            except Exception as e:  # noqa: BLE001   (free daily quota, network, no match ...)
                print(f"::warning title=voice::Short {sid}: Gemini {tts.GEMINI_FLOW_VOICE} failed ({str(e)[:200]}); using the backup voice", flush=True)
                voiced = None
        if voiced is None and eleven_ok:
            try:
                voiced, sr, used = _voice_groups(groups, "eleven")
                engine = "eleven"
                print(f"::notice title=eleven::Short {sid}: {used} characters billed ({sum(len(x) for x in todo)} in the script)", flush=True)
            except Exception as e:  # noqa: BLE001   (ElevenError, network, decode ...)
                print(f"::warning title=eleven::Short {sid}: ElevenLabs failed ({str(e)[:200]}); using Edge Andrew for this Short", flush=True)
                voiced = None
        if voiced is None:
            try:
                voiced, sr, _ = _voice_groups(groups, "edge")
            except Exception as e:  # noqa: BLE001
                fails += 1
                print(f"::warning title=voice::edge-tts: {str(e)[:200]}", flush=True)
                continue
        for line, pa, pw in voiced:
            seen.add(line)
            try:   # flag unclear words (a note only: the same text is read the same way, a retake would not change it)
                import whisper
                asr = asr or whisper.load_model("base.en")
                a16 = np.interp(np.linspace(0, len(pa) - 1, int(len(pa) * 16000 / sr)), np.arange(len(pa)), pa).astype(np.float32)
                heard = [x for seg in asr.transcribe(a16, language="en", word_timestamps=True, fp16=False)["segments"]
                         for x in seg.get("words", [])]
                bad = [x for x in problems(line, heard) if not x.startswith("rushed:")]
                if bad:
                    print(f"[prepass] {engine} flagged {bad[:3]}: {line[:60]}", flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"[prepass] clarity note skipped: {e!r}", flush=True)
            sf.write(tts.flow_path(line) + ".wav", pa, sr)
            Path(tts.flow_path(line) + ".json").write_text(json.dumps(with_punctuation(line, pw)), encoding="utf-8")
    from . import eleven
    who = f"ElevenLabs {eleven.voice_id()} (fallback Edge {tts.EDGE_VOICE})" if eleven_ok else f"Edge {tts.EDGE_VOICE}"
    if gemini_ok:
        who = f"Gemini {tts.GEMINI_FLOW_VOICE} (fallback {who})"
    print(f"::notice title=voice::{who} ({tts.FLOW_TAG}, {tts.FLOW_SCOPE}): {len(seen)} line(s) voiced, {fails} failed", flush=True)
    return 1 if fails else 0


def main(ids: list[str]) -> int:
    if tts.VOICE_SOURCE in tts.FLOW_SOURCES:
        return edge_pass(ids)
    import soundfile as sf
    import torch
    import whisper
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(os.cpu_count() or 4)
    os.makedirs(tts.VOICE_CACHE, exist_ok=True)
    todo = []
    for sid in ids:
        path = next((ROOT / "content" / "scripts").glob(f"{sid}*.json"), None)
        if not path:
            continue
        for line in lines_for(json.loads(path.read_text(encoding="utf-8"))):
            for sent, _q, b in tts.sentences(tts.speakable(line)):
                if not b and not os.path.exists(tts.cache_path(sent) + ".wav") and sent not in todo:
                    todo.append(sent)
    if os.environ.get("GEMINI_API_KEY") and tts.VOICE_SOURCE == "gemini":
        if gemini_pass(ids):
            return 0
        print("::warning title=voice::Gemini voice failed for this Short; using the Qwen voice", flush=True)
    print(f"[prepass] {len(todo)} sentence(s) to voice for {ids}", flush=True)
    if not todo:
        return 0
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cpu", dtype=torch.float32)
    prompt = model.create_voice_clone_prompt(ref_audio=str(REF / f"{tts.QWEN_VOICE}.wav"),
                                             ref_text=(REF / f"{tts.QWEN_VOICE}.txt").read_text(encoding="utf-8").strip())
    asr = whisper.load_model("base.en")
    best: dict[str, tuple] = {}  # sentence -> (problems, audio, sample rate, word timings)
    pending = list(todo)
    for take in range(1, MAX_TAKES + 1):
        for i in range(0, len(pending), 4):
            batch = pending[i:i + 4]
            wavs, sr = model.generate_voice_clone(text=batch, language=["English"] * len(batch), voice_clone_prompt=prompt)
            for sent, w in zip(batch, wavs):
                w = np.asarray(w, np.float32).ravel()
                a16 = np.interp(np.linspace(0, len(w) - 1, int(len(w) * 16000 / sr)), np.arange(len(w)), w).astype(np.float32)
                res = asr.transcribe(a16, language="en", word_timestamps=True, fp16=False)
                heard = [x for seg in res["segments"] for x in seg.get("words", [])]
                bad = problems(sent, heard) + prosody.problems(w, sr, sent)
                rank = (len(bad), prosody.badness(w, sr, sent))
                if sent not in best or rank < best[sent][4]:
                    words = [(x["word"].strip(), float(x["start"]), float(x["end"])) for x in heard]
                    best[sent] = (bad, w, sr, words, rank)
            print(f"[prepass] take {take}: {min(i + 4, len(pending))}/{len(pending)} ({time.time() - t0:.0f}s)", flush=True)
        pending = [s for s in pending if best[s][0]]
        if not pending or time.time() - t0 > RETAKE_UNTIL_S:
            break
        print(f"[prepass] re-recording {len(pending)} flagged line(s): "
              + "; ".join(f"{best[s][0][:3]}" for s in pending), flush=True)
    passed = sum(not v[0] for v in best.values())
    print(f"::notice title=voice test::{passed}/{len(best)} line(s) pass (clear words + natural pitch movement) "
          f"after up to {take} take(s)", flush=True)
    for sent, (bad, w, sr, words, _rank) in best.items():
        sf.write(tts.cache_path(sent) + ".wav", w, sr)
        Path(tts.cache_path(sent) + ".json").write_text(json.dumps(words), encoding="utf-8")
        if bad:
            print(f"::warning::[prepass] best take still flagged {bad[:3]}: {sent[:70]}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
