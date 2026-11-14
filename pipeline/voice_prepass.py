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
            bad_all += bad
        rank = (sum(bool(p[3]) for p in parts), prosody.badness(w, sr, " ".join(lines)))
        if best is None or rank < best[0]:
            best = (rank, parts, sr)
        if not bad_all:
            break
        print(f"[prepass] gemini take {take} flagged {bad_all[:4]}", flush=True)
    if best is None:
        return False                           # API down or out of quota: the caller falls back
    _rank, parts, sr = best
    for line, piece, ws, _bad in parts:
        sf.write(tts.line_path(line) + ".wav", piece, sr)
        Path(tts.line_path(line) + ".json").write_text(json.dumps(ws), encoding="utf-8")
    passed = sum(not p[3] for p in parts)
    print(f"::notice title=voice test::Gemini {tts.GEMINI_VOICE}: {passed}/{len(parts)} line(s) pass "
          f"(clear words + natural pitch movement), one read of the whole Short", flush=True)
    return True


def main(ids: list[str]) -> int:
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
    if os.environ.get("GEMINI_API_KEY") and os.environ.get("VOICE_SOURCE", "gemini") == "gemini":
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
