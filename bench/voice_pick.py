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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
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

# ---- scoring ----
import librosa  # noqa: E402
import torch  # noqa: E402
import whisper  # noqa: E402
from pipeline import clarity_check  # noqa: E402

utmos = torch.hub.load("tarepan/SpeechMOS:v1.2.0", "utmos22_strong", trust_repo=True)
asr = whisper.load_model("small.en")
exp = clarity_check.tokens(TEXT)


def wer_acc(heard):
    import difflib
    got = [t for h in heard for t in clarity_check.tokens(tts.speakable(h["word"]))]
    sm = difflib.SequenceMatcher(None, exp, got, autojunk=False)
    return sum(n for _, _, n in sm.get_matching_blocks()) / max(1, len(exp))


rows = {}
for f in sorted(out.glob("*.wav")):
    a, sr = sf.read(f, dtype="float32")
    y = librosa.resample(a, orig_sr=sr, target_sr=16000)
    mos = float(utmos(torch.from_numpy(y).unsqueeze(0), 16000).item())
    res = asr.transcribe(y, language="en", word_timestamps=True, fp16=False)
    heard = [x for s in res["segments"] for x in s.get("words", [])]
    probs = [x.get("probability", 1) for x in heard]
    m = prosody.measure(a, sr, TEXT)
    gaps = [heard[i + 1]["start"] - heard[i]["end"] for i in range(len(heard) - 1)]
    rows[f.stem] = dict(utmos=round(mos, 2), acc=round(wer_acc(heard), 3), conf=round(float(np.mean(probs)), 3),
                        low_words=sum(p < 0.5 for p in probs), pitch_spread_st=round(float(m.get("spread_st", m.get("spread", 0))), 2),
                        median_hz=round(float(m.get("median_hz", 0))), syl_s=round(float(m.get("syl_per_s", m.get("pace", 0))), 2),
                        pauses_gt_0_4=sum(g > 0.4 for g in gaps), seconds=round(len(a) / sr, 1))
    print(f.stem, rows[f.stem], flush=True)
(out / "scores.json").write_text(json.dumps(rows, indent=1))
(out / "scores.txt").write_text("\n".join(f"{k:28s} {v}" for k, v in rows.items()))
