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
