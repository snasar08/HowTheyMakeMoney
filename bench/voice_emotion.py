"""Emotional-voice test (Sam, Nov 3: "robot mode, no emotion"). Runs in its own venv with
chatterbox-tts (Resemble AI, MIT license). Reference voice = our Kokoro am_puck clip, so it keeps
the voice Sam likes and adds expression.
  python bench/voice_emotion.py <ref.wav> <outdir>
"""
import sys
import time
from pathlib import Path

import torchaudio as ta

ref, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
LINES = Path("bench/voice_lines.txt").read_text(encoding="utf-8").strip().splitlines()
log = open(out / "voice.log", "a")


def run(tag, make, **kw):
    t0 = time.time()
    sr = kw.pop("_sr", None) or 24000
    parts = []
    for line in LINES:
        parts.append(make(line, **kw))
    import torch
    wav = torch.cat([torch.cat([p, torch.zeros(1, int(0.25 * sr))], 1) for p in parts], 1)
    ta.save(str(out / f"{tag}.wav"), wav, sr)
    msg = f"{tag}: {time.time() - t0:.0f}s for {wav.shape[1] / sr:.1f}s of audio"
    print(msg, flush=True)
    log.write(msg + "\n")


try:
    from chatterbox.tts import ChatterboxTTS
    m = ChatterboxTTS.from_pretrained(device="cpu")
    for ex, cfg in ((0.6, 0.4), (0.9, 0.3)):
        run(f"chatterbox-ex{ex}", lambda s, ex=ex, cfg=cfg: m.generate(s, audio_prompt_path=ref, exaggeration=ex,
                                                                     cfg_weight=cfg), _sr=m.sr)
except Exception as exc:
    log.write(f"chatterbox failed: {exc!r}\n")
    print("chatterbox failed", exc)
try:
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    t = ChatterboxTurboTTS.from_pretrained(device="cpu")
    run("chatterbox-turbo", lambda s: t.generate(s, audio_prompt_path=ref), _sr=t.sr)
except Exception as exc:
    log.write(f"turbo failed: {exc!r}\n")
    print("turbo failed", exc)
