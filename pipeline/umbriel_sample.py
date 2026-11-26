"""Sam, Nov 26: hear Gemini Umbriel (+1.5 st, his pick) with the flow fixes: the whole narration as ONE paragraph in ONE
request (no blank line per scene, so no scene-break pause), long silences capped like the Edge voice. Free tier, 1 request
per Short. Needs GEMINI_API_KEY (never printed).   python -m pipeline.umbriel_sample OUT_DIR ID ...
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

from . import gemini_tts, tts, voice_prepass

ROOT = Path(__file__).resolve().parent.parent


def main(out: str, ids: list[str]) -> int:
    Path(out).mkdir(parents=True, exist_ok=True)
    failed = 0
    for sid in ids:
        path = next((ROOT / "content" / "scripts").glob(f"{sid}*.json"))
        lines = [tts.speakable(x) for x in voice_prepass.lines_for(json.loads(path.read_text(encoding="utf-8"))) if x.strip()]
        text = tts.flow_join(lines)
        try:
            w, sr = gemini_tts.say(text, voice="Umbriel")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"::warning title=umbriel-sample::{sid}: {str(e)[:200]}")
            continue
        w = np.asarray(w, np.float32)
        if sr != tts.SAMPLE_RATE:
            w = np.interp(np.linspace(0, len(w) - 1, int(len(w) * tts.SAMPLE_RATE / sr)), np.arange(len(w)), w).astype(np.float32)
        w, _ = tts.cap_pauses(w, [])
        w = tts._pitch(w, tts.GEMINI_PITCH_ST)
        w = w / max(1e-6, float(np.max(np.abs(w)))) * 0.89
        raw = (np.clip(w, -1, 1) * 32767).astype("<i2").tobytes()
        mp3 = Path(out) / f"{sid}-umbriel-flow.mp3"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(tts.SAMPLE_RATE), "-ac", "1", "-i", "-",
                        "-af", "loudnorm=I=-14:TP=-1.5", "-b:a", "160k", str(mp3)], input=raw, check=True)
        print(f"{sid}: {len(text)} chars, {len(w) / tts.SAMPLE_RATE:.1f} s")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2:] or ["094", "178"]))
