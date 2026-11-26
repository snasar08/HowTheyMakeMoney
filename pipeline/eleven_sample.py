"""Voice the full narration of a few Shorts with ElevenLabs Adam AND Brian, for listening tests (about 2.1k characters
for Shorts 178 + 094 with both voices). Writes <out>/<id>-<voice>.mp3 and .json (word timings). Cached by hash, so a
rerun costs nothing. Needs ELEVENLABS_API_KEY in the environment (never printed).

  python -m pipeline.eleven_sample OUT_DIR [ID ...]
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from . import eleven, tts, voice_prepass

ROOT = Path(__file__).resolve().parent.parent


def main(out: str, ids: list[str]) -> int:
    os.makedirs(out, exist_ok=True)
    cache = os.path.join(os.environ.get("HTMM_CACHE", ".cache"), "voice")
    total, failed = 0, 0
    for sid in ids:
        path = next((ROOT / "content" / "scripts").glob(f"{sid}*.json"), None)
        if not path:
            print(f"::warning::no script {sid}")
            continue
        script = json.loads(path.read_text(encoding="utf-8"))
        text = tts.flow_join([tts.speakable(x) for x in voice_prepass.lines_for(script) if x.strip()])
        want = [v for v in os.environ.get("ELEVEN_SAMPLE_VOICES", "").split(",") if v.strip()]
        tag = "" if not os.environ.get("ELEVEN_MODEL") or "multilingual" in eleven.model_id() else "-" + eleven.model_id().split("_")[1]
        for name, vid in eleven.VOICES.items():
            if want and name not in want:
                continue
            try:
                mp3, words, used, cached = eleven.synth(text, cache, vid)
            except eleven.ElevenError as e:
                failed += 1
                print(f"::warning title=eleven-sample::{sid} {name}: {str(e)[:200]}")
                continue
            (Path(out) / f"{sid}-{name}{tag}.mp3").write_bytes(mp3)
            (Path(out) / f"{sid}-{name}{tag}.json").write_text(json.dumps({"voice_id": vid, "voice": name, "model": eleven.model_id(),
                                                                       "settings": eleven.settings(), "text": text, "words": words}), encoding="utf-8")
            total += used
            print(f"{sid} {name}: {len(text)} chars, {'cached' if cached else 'billed ' + str(used)}, {len(words)} words")
    print(f"::notice title=eleven-sample::{total} characters billed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2:] or ["178", "094"]))
