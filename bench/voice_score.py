"""Score voice clips objectively (I can't listen; Sam asked me to pick): UTMOS naturalness
(predicted human MOS, 1-5), speaker consistency across lines (Resemblyzer cosine, 1 = same voice
throughout), pitch movement (semitone spread = how much the read moves, flat robot ~1-2) and
pause structure. python bench/voice_score.py <dir with .mp3/.wav> -> scores.json + table"""
import json
import sys
from pathlib import Path

import librosa
import numpy as np
import torch

d = Path(sys.argv[1])
utmos = torch.hub.load("tarepan/SpeechMOS:v1.2.0", "utmos22_strong", trust_repo=True)
from resemblyzer import VoiceEncoder, preprocess_wav  # noqa: E402
enc = VoiceEncoder("cpu")
rows = {}
for f in sorted(list(d.glob("*.mp3")) + list(d.glob("*.wav"))):
    y, sr = librosa.load(f, sr=16000, mono=True)
    if len(y) < sr:
        continue
    chunks = [y[i:i + 10 * sr] for i in range(0, len(y), 10 * sr) if len(y[i:i + 10 * sr]) > 2 * sr]
    mos = float(np.mean([utmos(torch.from_numpy(c).unsqueeze(0), 16000).item() for c in chunks]))
    segs = [y[a:b] for a, b in librosa.effects.split(y, top_db=35) if b - a > sr * 0.8]
    embs = [enc.embed_utterance(preprocess_wav(s, source_sr=16000)) for s in segs]
    if len(embs) > 1:
        c = np.mean(embs, 0)
        c /= np.linalg.norm(c)
        cons = float(min(np.dot(e, c) for e in embs))
    else:
        cons = 1.0
    f0, vo, _ = librosa.pyin(y, fmin=60, fmax=400, sr=sr)
    f0 = f0[~np.isnan(f0)]
    spread = float(np.std(12 * np.log2(f0 / np.median(f0)))) if len(f0) else 0.0
    rows[f.stem] = {"utmos": round(mos, 2), "consistency_min": round(cons, 3), "pitch_spread_st": round(spread, 2),
                    "seconds": round(len(y) / sr, 1)}
    print(f"{f.stem:28s} UTMOS {mos:.2f}  same-voice {cons:.3f}  pitch {spread:.2f} st", flush=True)
(d / "scores.json").write_text(json.dumps(rows, indent=2))
