"""Gemini TTS candidates for Sam to rank (Nov 13). Each voice reads a whole real Short in one pass (so the
delivery flows like a person reading, instead of sentence-by-sentence), with the channel's style direction.

  GEMINI_API_KEY=... python bench/voice_gemini.py out
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import gemini_tts, prosody  # noqa: E402

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
# the Giannis Short (074), as the viewer would hear it
TEXT = ("He once sold sunglasses on the street. Then he signed for 228 million dollars. "
        "Just to help his family. Watches, handbags, sunglasses. "
        "He only started basketball in 2007. Still, an NBA team picked him 15th. "
        "Then two MVP awards. And the biggest deal in league history at the time. "
        "Then a championship. The Bucks' first since 1971. "
        "Comment which brand we should do next, and subscribe.")
# male voices from Google's list, deeper and calmer ones first (descriptor in the comment)
VOICES = ["Charon",      # informative
          "Algenib",     # gravelly
          "Orus",        # firm
          "Alnilam",     # firm
          "Gacrux",      # mature
          "Iapetus",     # clear
          "Sadaltager",  # knowledgeable
          "Rasalgethi",  # informative
          "Achird",      # friendly
          "Umbriel"]     # easy-going
log = []
for i, v in enumerate(VOICES, 1):
    try:
        a, sr = gemini_tts.say(TEXT, voice=v)
    except Exception as e:  # noqa: BLE001
        log.append(f"{v}: FAILED {e}")
        print(log[-1], flush=True)
        continue
    m = prosody.measure(a, sr)
    sf.write(out / f"g{i:02d}-{v}.wav", a, sr)
    log.append(f"g{i:02d}-{v}: {len(a) / sr:.1f}s, median {m['median_hz']} Hz, movement {m['spread_st']} st")
    print(log[-1], flush=True)
(out / "gemini.log").write_text("\n".join(log) + "\n")
