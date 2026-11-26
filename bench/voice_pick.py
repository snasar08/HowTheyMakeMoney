"""Voice pick (Nov 26, Sam: "i dont like voice, use what everyone else uses that is free and liked").
Renders the same real-Short line in many free voices, then scores each one automatically.
  python bench/voice_pick.py out   -> out/<name>.wav (24 kHz mono), out/scores.json, out/scores.txt
Candidates: Microsoft Edge neural voices (edge-tts), Google Gemini prebuilt voices (3 requests, a spare model so
posted Shorts keep their quota), Kokoro top male voices. Nothing is played."""
import asyncio
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent)); sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline import prosody, tts  # noqa: E402

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
sc = json.load(open(Path(__file__).resolve().parent.parent / "content/scripts/094-whatif-pokemon-cards.json", encoding="utf-8"))
LINE = " ".join(s["narration"] for s in sc["scenes"][:4]) + " Each one cost 3.69 cents to print, and the company made $1.14 billion."
TEXT = tts.speakable(LINE)
EDGE = ["en-US-AndrewMultilingualNeural", "en-US-BrianMultilingualNeural", "en-US-ChristopherNeural",
        "en-US-GuyNeural", "en-US-RogerNeural", "en-US-EricNeural"]
GEMINI = ["Puck", "Fenrir", "Charon", "Umbriel"]   # Umbriel (+1.5 st, the current voice) is the baseline
KOKORO = ["am_michael", "am_puck"]
RATE = os.environ.get("EDGE_RATE", "+10%")


def to_wav(src, name, tempo=1.0, pitch=0.0):
    dst = out / f"{name}.wav"
    f = ["-ar", "24000", "-ac", "1"]
    flt = []
    if pitch:
        r = 2 ** (pitch / 12)
        flt.append(f"asetrate={24000 * r:.0f},aresample=24000,atempo={1 / r:.5f}")
    if tempo != 1.0:
        flt.append(f"atempo={tempo}")
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src)] + (["-af", ",".join(flt)] if flt else []) + f + [str(dst)]
    subprocess.run(cmd, check=True)


async def edge(v):
    import edge_tts
    p = out / f"_{v}.mp3"
    await edge_tts.Communicate(TEXT, v, rate=RATE).save(str(p))
    return p


log = []
for v in EDGE:
    try:
        p = asyncio.run(edge(v))
        to_wav(p, "edge_" + v.split("-")[2].replace("Neural", "").replace("Multilingual", "ML"))
        p.unlink()
    except Exception as e:  # noqa: BLE001
        log.append(f"{v}: {e!r}")
if os.environ.get("GEMINI_API_KEY"):
    from pipeline import gemini_tts
    for i, v in enumerate(GEMINI):
        try:
            if i:
                time.sleep(25)   # free tier: 3 requests a minute
            w, sr = gemini_tts.say(TEXT, voice=v, model=os.environ.get("PICK_GEMINI_MODEL", "gemini-3.1-flash-tts-preview"))
            sf.write(out / f"_g.wav", w, sr)
            to_wav(out / "_g.wav", "gemini_" + v, tempo=1.1, pitch=1.5 if v == "Umbriel" else 0.0)
        except Exception as e:  # noqa: BLE001
            log.append(f"gemini {v}: {str(e)[:200]}")
    (out / "_g.wav").unlink(missing_ok=True)
for v in KOKORO:
    try:
        a, _ = tts.kokoro(TEXT, voice=v, speed=1.2)
        sf.write(out / f"kokoro_{v}.wav", a, tts.SAMPLE_RATE)
    except Exception as e:  # noqa: BLE001
        log.append(f"kokoro {v}: {e!r}")
(out / "errors.log").write_text("\n".join(log))

from pick_score import score  # noqa: E402

score(out, TEXT)
