"""Sam, Nov 26: hear every Gemini TTS voice on the same Pokemon lines (flow fix on, no pitch change), in ONE mp3.
A free Edge voice says "Voice 3, Charon" before each. 1 Gemini request per voice, spread over the free models
(10/day each). Needs GEMINI_API_KEY (never printed).   python -m pipeline.gemini_voice_sample OUT_DIR
"""
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

from . import gemini_tts, tts, voice_prepass

ROOT = Path(__file__).resolve().parent.parent
SR = tts.SAMPLE_RATE
VOICES = ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus",
          "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
          "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia",
          "Sadaltager", "Sulafat"]


def _resample(w, sr):
    w = np.asarray(w, np.float32)
    return w if sr == SR else np.interp(np.linspace(0, len(w) - 1, int(len(w) * SR / sr)), np.arange(len(w)), w).astype(np.float32)


def _decode(path: str):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, "<i2").astype(np.float32) / 32767


def _announce(text: str, out: Path):
    import edge_tts
    p = out / "_ann.mp3"
    for _ in range(3):
        try:
            asyncio.run(edge_tts.Communicate(text, "en-US-AndrewMultilingualNeural").save(str(p)))
            return _decode(str(p))
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(2)
    print(f"::warning title=gemini-voices::announce failed ({str(err)[:80]}), beep instead", flush=True)
    t = np.arange(int(0.25 * SR)) / SR
    return (np.sin(2 * np.pi * 880 * t) * 0.3).astype(np.float32)


def _norm(w, peak=0.89):
    return w / max(1e-6, float(np.max(np.abs(w)))) * peak


def main(out: str, sid: str = "094", n_lines: int = 3) -> int:
    od = Path(out)
    od.mkdir(parents=True, exist_ok=True)
    path = next((ROOT / "content" / "scripts").glob(f"{sid}*.json"))
    lines = [tts.speakable(x) for x in voice_prepass.lines_for(json.loads(path.read_text(encoding="utf-8"))) if x.strip()]
    text = tts.flow_join(lines[:n_lines])
    gap = np.zeros(int(0.6 * SR), np.float32)
    parts, got, failed = [], [], []
    for i, v in enumerate(VOICES, 1):
        m = gemini_tts.MODELS[i % len(gemini_tts.MODELS)]
        try:
            try:
                w, sr = gemini_tts.say(text, voice=v, model=m)
            except Exception:  # noqa: BLE001  that model's quota: let say() pick any model with quota left
                w, sr = gemini_tts.say(text, voice=v)
        except Exception as e:  # noqa: BLE001
            failed.append(v)
            print(f"::warning title=gemini-voices::{v}: {str(e)[:160]}", flush=True)
            continue
        w, _ = tts.cap_pauses(_resample(w, sr), [])
        parts += [_norm(_announce(f"Voice {i}. {v}.", od)) * 0.7, gap, _norm(w), gap, gap]
        got.append(f"{i}. {v}")
        print(f"{i}. {v}: {len(w) / SR:.1f} s", flush=True)
        time.sleep(6)   # 3 requests/min per model, 4 models
    if not parts:
        return 1
    raw = (np.clip(np.concatenate(parts), -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-af", "loudnorm=I=-14:TP=-1.5", "-b:a", "128k", str(od / "gemini-voices.mp3")], input=raw, check=True)
    (od / "_ann.mp3").unlink(missing_ok=True)
    (od / "gemini-voices.txt").write_text("\n".join(got) + ("\nfailed: " + ", ".join(failed) if failed else "") + "\n")
    print(f"::notice title=gemini-voices::{len(got)} voices, {len(failed)} failed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
