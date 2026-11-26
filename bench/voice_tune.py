"""Tune the chosen Edge voice: renders variants (rate / pitch / number wording) of the same line and scores them.
  python bench/voice_tune.py out bench/tune_set1.json"""
import asyncio
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pick_score import score  # noqa: E402
from pipeline import tts  # noqa: E402

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
sc = json.load(open(Path(__file__).resolve().parent.parent / "content/scripts/094-whatif-pokemon-cards.json", encoding="utf-8"))
LINE = " ".join(s["narration"] for s in sc["scenes"][:4]) + " Each one cost 3.69 cents to print, and the company made $1.14 billion."
TEXT = tts.speakable(LINE)
MODES = {
    "raw": lambda t: t,
    "spelled": lambda t: t.replace("3.69 cents", "three point six nine cents").replace("1.14 billion dollars", "one point one four billion dollars"),
    "commas": lambda t: t.replace("Each one cost 3.69 cents to print", "Each one cost, 3.69 cents, to print").replace("made 1.14", "made, 1.14"),
}
import edge_tts  # noqa: E402


async def one(name, v):
    text = MODES[v.get("mode", "raw")](TEXT)
    p = out / f"_{name}.mp3"
    await edge_tts.Communicate(text, v["voice"], rate=v.get("rate", "+10%"), pitch=v.get("pitch", "+0Hz")).save(str(p))
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(p), "-ar", "24000", "-ac", "1", str(out / f"{name}.wav")], check=True)
    p.unlink()


for name, v in json.load(open(sys.argv[2])).items():
    asyncio.run(one(name, v))
score(out, TEXT)
