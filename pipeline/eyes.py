"""Eyes (Nov 13, Sam: "figure out a way to give it eyes"): after a Short is rendered, a vision model LOOKS at it
like a viewer would and reports what is wrong. Gemini Flash-Lite on the free tier (same GEMINI_API_KEY; ~500
requests/day free, one request per Short), standard library + Pillow + ffmpeg.

  python -m pipeline.eyes out/074-famous-giannis.mp4 content/scripts/074-famous-giannis.json

Sends one sheet of 12 frames (every ~2.5 s, in order) + the cover, with the script's title and narration, and asks
for JSON: a 1-10 score, problems a viewer would notice (unreadable / cut-off / overlapping text, misspellings vs the
script, blank or broken frames, glitchy or distorted characters, logos, a cover that doesn't say the topic) and the
single most useful fix. Warn-only unless EYES=strict (then a score <= 3 blocks the post).
"""
from __future__ import annotations

import base64
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://generativelanguage.googleapis.com/v1beta"
MODELS = [m for m in os.environ.get("EYES_MODELS", "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-2.5-flash-lite,"
                                    "gemini-2.5-flash").split(",") if m]
PROMPT = """You are the strict quality checker for a YouTube Shorts channel ("How They Make Money", viewers 13-18).
Image 1 is the cover (frame 0). Image 2 is a sheet of frames from the finished vertical video in time order
(left to right, top to bottom, about 2.5 seconds apart).
Title: {title}
Narration: {narration}

Judge it the way a viewer scrolling past would. Report only problems you can actually SEE:
- text that is cut off, overlapping other text, too small to read on a phone, or misspelled compared to the narration
- numbers on screen that contradict the narration
- blank, black, frozen-looking or corrupted frames
- characters or objects that look broken, glitched, stretched or melted
- real company logos or brand marks
- a cover that does not make the topic or the number clear
- anything that looks cheap, confusing or off-putting
Reply with JSON only:
{{"score": <1-10, 10 = would stop a teen scrolling, nothing wrong>, "problems": ["<short, specific>", ...],
"best_fix": "<the single most useful change>"}}"""


def frames(video: Path, n: int = 12):
    from PIL import Image
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                               capture_output=True, text=True, check=True).stdout.strip() or 0)
    out = []
    for i in range(n + 1):
        t = 0.0 if i == 0 else min(dur - 0.1, 0.8 + (i - 1) * max(dur - 1.0, 1) / max(n - 1, 1))
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1",
                            "-f", "image2pipe", "-vcodec", "png", "pipe:1"], capture_output=True, check=True)
        out.append(Image.open(io.BytesIO(r.stdout)).convert("RGB"))
    return out


def sheet(imgs, cols: int = 6, w: int = 270):
    from PIL import Image
    h = int(w * imgs[0].height / imgs[0].width)
    rows = (len(imgs) + cols - 1) // cols
    s = Image.new("RGB", (cols * w, rows * h), (20, 20, 20))
    for k, im in enumerate(imgs):
        s.paste(im.resize((w, h)), (k % cols * w, k // cols * h))
    return s


def _jpeg(im, q=85) -> str:
    b = io.BytesIO()
    im.save(b, "JPEG", quality=q)
    return base64.b64encode(b.getvalue()).decode()


def look(video: Path, script: dict) -> dict | None:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    imgs = frames(video)
    narration = " ".join(sc.get("narration", "") for sc in script.get("scenes", []))
    body = {"contents": [{"parts": [
        {"text": PROMPT.format(title=script.get("title", ""), narration=narration)},
        {"inline_data": {"mime_type": "image/jpeg", "data": _jpeg(imgs[0].resize((540, 960)))}},
        {"inline_data": {"mime_type": "image/jpeg", "data": _jpeg(sheet(imgs[1:]))}}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}
    last = ""
    for m in MODELS:
        req = urllib.request.Request(f"{API}/models/{m}:generateContent", data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "x-goog-api-key": key})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                res = json.loads(r.read())
            text = "".join(p.get("text", "") for c in res.get("candidates", []) for p in c.get("content", {}).get("parts", []))
            out = json.loads(text[text.find("{"):text.rfind("}") + 1])
            out["model"] = m
            return out
        except urllib.error.HTTPError as e:
            last = f"{m}: HTTP {e.code} {e.read()[:200]!r}"
        except Exception as e:  # noqa: BLE001
            last = f"{m}: {e!r}"
    print(f"::warning title=eyes::could not get a review ({last[:300]})", flush=True)
    return None


def report(name: str, r: dict | None) -> list[str]:
    """Print the review; returns blockers (only with EYES=strict and a very low score)."""
    if not r:
        return []
    print(f"::notice title={name} eyes::score {r.get('score')}/10 ({r.get('model')}); fix: {str(r.get('best_fix', ''))[:200]}",
          flush=True)
    for p in (r.get("problems") or [])[:6]:
        print(f"::warning title={name} eyes::{str(p)[:220]}", flush=True)
    try:
        low = float(r.get("score", 10)) <= 3
    except (TypeError, ValueError):
        low = False
    return [f"eyes score {r.get('score')}/10"] if low and os.environ.get("EYES") == "strict" else []


if __name__ == "__main__":
    v, s = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    print(json.dumps(look(v, s), indent=2))
