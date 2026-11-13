"""Deeper narrator candidates (Nov 13: viewers Sam showed the Shorts to called the voice irritating,
"out of tune", and asked for a deeper voice that explains better).

  python bench/voice_deep.py <name> out

<name> = a key of DESIGNS: Qwen3-TTS VoiceDesign makes one reference clip (out/<name>.ref.wav + .txt),
then the Base model clones it for real script lines exactly as pipeline/voice_prepass.py does
(out/<name>.wav). <name> = current: the lines in today's channel voice, for comparison.
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

name, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
BASE = "adult American man in his late thirties, deep low-pitched baritone voice, warm and rich"
MID = "adult American man around thirty, natural medium-pitched voice, a typical male speaking pitch that is neither deep nor high, warm and clear"
DESIGNS = {
    # Nov 13, Sam: the deep voice was too deep -> mid-level candidates
    "mid-teacher": f"{MID}, calm and friendly like a favorite teacher explaining something clearly, steady even pitch, natural pace",
    "mid-host": f"{MID}, podcast host explaining business to a friend, conversational and relaxed, steady pitch, smooth",
    "mid-doc": f"{MID}, documentary narrator, confident and measured, small natural pitch movement, very clear articulation",
    # styles other faceless channels use (Nov 13: Sam wants to rank them), made free with VoiceDesign
    "trend-explainer": f"{MID}, the classic YouTube explainer narrator, confident and slightly dramatic, clear, steady medium pitch",
    "trend-punchy": f"{MID}, fast punchy short-video narrator, energetic and confident, crisp, steady medium pitch, not squeaky",
    "trend-story": f"{MID}, cinematic storyteller, intriguing and smooth, medium-low pitch, builds suspense gently",
    "mid-bright": f"{MID}, upbeat but grounded explainer, engaging and confident, steady pitch, never sing-song or squeaky",
    "deep-teacher": f"{BASE}, calm and friendly like a favorite teacher explaining something clearly, steady even pitch, natural unhurried pace",
    "deep-doc": f"{BASE}, documentary narrator, confident and measured, steady pitch with small natural movement, clear articulation",
    "deep-story": f"{BASE}, relaxed storyteller, grounded and sincere, low steady tone, lightly engaging, never sing-song",
    "deep-host": f"{BASE}, podcast host explaining business to a friend, conversational, relaxed, low steady voice, clear and smooth",
    "deep-anchor": f"{BASE}, news anchor, authoritative but kind, very clear, low even tone, no vocal fry",
}
# a statement-style reference: the clone copies the reference's melody, and the old one was two questions
REF_TEXT = ("Here is how it actually works. A company sells something small, millions of times a day. "
            "Each sale keeps only a few cents. But those cents add up to billions of dollars a year.")
LINES = [
    "Closed every Sunday. Still, each Chick-fil-A makes 7.5 million dollars a year.",
    "That's the 2024 average. Per restaurant.",
    "Your DoorDash order: about 34 dollars. DoorDash's profit: just 47 cents.",
    "He once sold sunglasses on the street. Then he signed for 228 million dollars.",
    "Then two MVP awards. And the biggest deal in league history at the time.",
    "Comment which brand we should do next, and subscribe.",
]

from qwen_tts import Qwen3TTSModel  # noqa: E402

if name.startswith("cv-"):   # Qwen's built-in English speakers (Ryan, Aiden), no cloning
    m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", device_map="cpu", dtype=torch.float32)
    parts, sr = [], 24000
    for t in LINES:
        w, sr = m.generate_custom_voice(text=t, language="English", speaker=name[3:],
                                        instruct="calm, clear, confident explainer voice, steady pitch")
        parts += [np.asarray(w[0], np.float32).ravel(), np.zeros(int(sr * 0.25), np.float32)]
    sf.write(out / f"{name}.wav", np.concatenate(parts), sr)
    print("done", name, flush=True)
    sys.exit(0)
if name == "current":
    ref, ref_text = "assets/voice/narrator.wav", Path("assets/voice/narrator.txt").read_text(encoding="utf-8").strip()
else:
    des = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", device_map="cpu", dtype=torch.float32)
    torch.manual_seed(7)
    rw, rsr = des.generate_voice_design(text=REF_TEXT, language="English", instruct=DESIGNS[name])
    sf.write(out / f"{name}.ref.wav", np.asarray(rw[0], np.float32).ravel(), rsr)
    (out / f"{name}.ref.txt").write_text(REF_TEXT, encoding="utf-8")
    del des
    ref, ref_text = str(out / f"{name}.ref.wav"), REF_TEXT
base = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cpu", dtype=torch.float32)
prompt = base.create_voice_clone_prompt(ref_audio=ref, ref_text=ref_text)
parts, sr = [], 24000
for i in range(0, len(LINES), 3):
    wavs, sr = base.generate_voice_clone(text=LINES[i:i + 3], language=["English"] * len(LINES[i:i + 3]), voice_clone_prompt=prompt)
    for w in wavs:
        parts += [np.asarray(w, np.float32).ravel(), np.zeros(int(sr * 0.25), np.float32)]
sf.write(out / f"{name}.wav", np.concatenate(parts), sr)
print("done", name, flush=True)
