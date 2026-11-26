"""Automatic voice scoring shared by voice_pick / voice_tune: UTMOS (neural MOS), Whisper accuracy with numbers
spelled out on both sides, pitch movement, pace, pauses. score(dir, text) -> {name: metrics}"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import clarity_check, prosody, tts  # noqa: E402


def _words(text):
    from num2words import num2words
    def num(m):
        try:
            return " " + num2words(float(m.group(0).replace(",", ""))) + " "
        except Exception:  # noqa: BLE001
            return " "
    t = re.sub(r"\d[\d,]*\.?\d*", num, text.replace("$", ""))
    return re.findall(r"[a-z']+", t.lower())


def score(out, text):
    import difflib

    import librosa
    import torch
    import whisper
    out = Path(out)
    utmos = torch.hub.load("tarepan/SpeechMOS:v1.2.0", "utmos22_strong", trust_repo=True)
    asr = whisper.load_model("small.en")
    exp = _words(text)
    rows = {}
    for f in sorted(out.glob("*.wav")):
        if f.stem.startswith("_"):
            continue
        a, sr = sf.read(f, dtype="float32")
        y = librosa.resample(a, orig_sr=sr, target_sr=16000)
        mos = float(utmos(torch.from_numpy(y).unsqueeze(0), 16000).item())
        res = asr.transcribe(y, language="en", word_timestamps=True, fp16=False)
        heard = [x for s in res["segments"] for x in s.get("words", [])]
        got = _words(" ".join(x["word"] for x in heard))
        sm = difflib.SequenceMatcher(None, exp, got, autojunk=False)
        acc = sum(n for _, _, n in sm.get_matching_blocks()) / max(1, len(exp))
        probs = [x.get("probability", 1) for x in heard]
        m = prosody.measure(a, sr, text)
        gaps = [heard[i + 1]["start"] - heard[i]["end"] for i in range(len(heard) - 1)]
        rows[f.stem] = dict(utmos=round(mos, 2), acc=round(acc, 3), conf=round(float(np.mean(probs)), 3),
                            low_words=int(sum(p < 0.5 for p in probs)), pitch_spread_st=round(float(m["spread_st"]), 2),
                            median_hz=round(float(m["median_hz"])), syl_s=round(float(m["syl_per_s"]), 2),
                            pauses_gt_0_4=int(sum(g > 0.4 for g in gaps)), seconds=round(len(a) / sr, 1))
        print(f.stem, rows[f.stem], flush=True)
    (out / "scores.json").write_text(json.dumps(rows, indent=1))
    (out / "scores.txt").write_text(chr(10).join(f"{k:28s} {v}" for k, v in rows.items()))
    return rows
