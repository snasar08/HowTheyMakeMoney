"""Voice a script's lines with Qwen3-TTS ahead of the render (runs in its own Python 3.12 venv:
torch CPU, qwen-tts, openai-whisper, soundfile). Writes VOICE_CACHE/<key>.wav + .json word timings
for every sentence the renderer will ask for, in the cloned voice assets/voice/<QWEN_VOICE>.wav.

  python -m pipeline.voice_prepass 043 [044 ...]

Sentences already cached are skipped, so reruns are cheap. Only needs numpy from the pipeline.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

import numpy as np

from . import tts

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "assets" / "voice"


def lines_for(script: dict) -> list[str]:
    """Every text render.prepare() sends to tts.synthesize, in the same form."""
    src = (ROOT / "pipeline" / "render.py").read_text(encoding="utf-8")
    m = re.search(r'CTA_LINE = os\.environ\.get\("CTA_LINE", "([^"]+)"\)', src)
    cta = " ".join(p.strip() for p in script.get("cta", os.environ.get("CTA_LINE", m.group(1))).split("|") if p.strip())
    return [sc["narration"] for sc in script["scenes"]] + [cta, (script.get("loop") or "").strip()]


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
    for i in range(0, len(todo), 4):
        batch = todo[i:i + 4]
        wavs, sr = model.generate_voice_clone(text=batch, language=["English"] * len(batch), voice_clone_prompt=prompt)
        for sent, w in zip(batch, wavs):
            w = np.asarray(w, np.float32).ravel()
            sf.write(tts.cache_path(sent) + ".wav", w, sr)
            a16 = np.interp(np.linspace(0, len(w) - 1, int(len(w) * 16000 / sr)), np.arange(len(w)), w).astype(np.float32)
            res = asr.transcribe(a16, language="en", word_timestamps=True, fp16=False)
            words = [(x["word"].strip(), float(x["start"]), float(x["end"])) for seg in res["segments"] for x in seg.get("words", [])]
            Path(tts.cache_path(sent) + ".json").write_text(json.dumps(words), encoding="utf-8")
        print(f"[prepass] {min(i + 4, len(todo))}/{len(todo)} ({time.time() - t0:.0f}s)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
