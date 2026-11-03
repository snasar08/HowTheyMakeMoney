"""Best-free-voice test (Sam, Nov 3: Kokoro/Chatterbox "all suck"). CPU, GitHub runner.
  python bench/voice_best.py qwen|voxcpm <outdir>
Each line gets a delivery note so the read has structure (hook, flip, payoff, twist)."""
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

which, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
LINES = [  # (text, delivery)
    ("How did two YouTubers sell over a billion dollars of drinks in one year?", "curious and hooked, building intrigue, rising at the end like a real question"),
    ("Logan Paul and KSI.", "confident reveal, short and punchy"),
    ("Here's the flip. They didn't build a factory.", "lean in, like sharing a secret, small pause after 'flip'"),
    ("Their real job? The audience.", "knowing, slightly amused, beat before 'The audience'"),
    ("Sales hit 250 million dollars in 2022. Then 1.2 billion in 2023.", "excited, faster, the big number lands hard"),
    ("But hype fades. By June 2025, UK sales were down 71 percent.", "slower, serious, dramatic drop in energy"),
]
NARRATOR = "A young American male YouTube narrator, energetic and clear, confident, warm, natural conversational pace"
log = open(out / f"{which}.log", "w")


def save(tag, parts, sr, t0):
    a = np.concatenate([np.concatenate([np.asarray(p, np.float32).ravel(), np.zeros(int(0.22 * sr), np.float32)]) for p in parts])
    sf.write(out / f"{tag}.wav", a, sr)
    msg = f"{tag}: {time.time() - t0:.0f}s for {len(a) / sr:.1f}s of audio"
    print(msg, flush=True)
    log.write(msg + "\n")
    log.flush()


if which == "qwen":
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    for name, spk in (("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "Ryan"), ("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", "Ryan")):
        try:
            t0 = time.time()
            m = Qwen3TTSModel.from_pretrained(name, device_map="cpu", dtype=torch.float32)
            parts, sr = [], 24000
            for text, how in LINES:
                w, sr = m.generate_custom_voice(text=text, language="English", speaker=spk, instruct=how)
                parts.append(w[0])
            save(f"qwen-{name.split('-')[2]}-{spk}", parts, sr, t0)
            del m
        except Exception as exc:
            log.write(f"{name} failed: {exc!r}\n")
    try:
        t0 = time.time()
        m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", device_map="cpu", dtype=torch.float32)
        parts, sr = [], 24000
        for text, how in LINES:
            w, sr = m.generate_voice_design(text=text, language="English", instruct=f"{NARRATOR}. Delivery: {how}.")
            parts.append(w[0])
        save("qwen-design", parts, sr, t0)
    except Exception as exc:
        log.write(f"voice design failed: {exc!r}\n")
else:
    from voxcpm import VoxCPM
    try:
        t0 = time.time()
        m = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
        parts = [m.generate(text=f"({NARRATOR}; {how}){text}", cfg_value=2.0, inference_timesteps=10, seed=42)
                 for text, how in LINES]
        save("voxcpm2-design", parts, m.tts_model.sample_rate, t0)
    except Exception as exc:
        log.write(f"voxcpm failed: {exc!r}\n")
