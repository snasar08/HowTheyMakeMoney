"""AI-video Shorts (Nov 15, Sam: "one expensive Short with Higgsfield"): a script may carry
  "aivideo": [{"url": "https://...mp4", "lines": [0, 1]}, ...]
one clip per group of sentences (flat sentence index, in narration order). The toon plan still decides the frame
range of every sentence (and the outro); this module fills those frames with the clip's frames instead of the toon
render, as the same LP_PLATES files (<slug>/<scene>_<frame>.jpg), so render.py adds voice, captions, numbers and
music exactly as for every other animated Short. Consecutive sentences on one clip continue through it; a clip that
runs out plays backwards (ping-pong) so it never freezes. The outro cycles through the clips.

`pipeline.toon plates` calls `override()` automatically when the script has `aivideo`.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W, H = 720, 1280


def _frames(url: str, cache: Path) -> list[Path]:
    """Download one clip (or take it from the repo: "file": "assets/aivideo/..."), decode to 30 fps JPEGs."""
    key = hashlib.md5(url.encode()).hexdigest()[:16]
    d = cache / key
    if not d.exists() or not any(d.glob("*.jpg")):
        d.mkdir(parents=True, exist_ok=True)
        mp4 = d / "clip.mp4"
        local = ROOT / url if not url.startswith("http") else None
        if local and local.exists():
            mp4.write_bytes(local.read_bytes())
            url = ""
        for attempt in range(6 if url else 0):                # the CDN resets connections now and then (seen Nov 15)
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "htmm-shorts"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    mp4.write_bytes(r.read())
                break
            except Exception as e:  # noqa: BLE001
                print(f"[aivideo] download retry {attempt + 1}: {str(e)[:80]}", flush=True)
                time.sleep(3 + attempt * 4)
        else:
            if url:
                raise RuntimeError(f"could not download {url}")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-vf",
                        f"fps=30,scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}",
                        "-q:v", "3", str(d / "%05d.jpg")], check=True)
    return sorted(d.glob("*.jpg"))


def _pingpong(frames: list[Path], k: int) -> Path:
    n = len(frames)
    if n == 1:
        return frames[0]
    k %= 2 * n - 2
    return frames[k] if k < n else frames[2 * n - 2 - k]


# Nov 15 (Sam: the Nike Short was "very very slow"; his reference cuts every ~1.3 s): one AI clip often covers
# 3-6 s of narration, so every VIEW_N frames the clip is reframed (wide / push-in / left / right-low), which
# reads as a new camera angle. (zoom, x centre 0-1, y centre 0-1)
VIEW_N = 40
VIEWS = [(1.0, 0.5, 0.5), (1.32, 0.5, 0.42), (1.22, 0.34, 0.5), (1.4, 0.64, 0.58), (1.15, 0.5, 0.62)]


def _view(src: Path, v: int) -> bytes:
    z, cx, cy = VIEWS[v % len(VIEWS)]
    if z == 1.0:
        return src.read_bytes()
    import io

    from PIL import Image
    im = Image.open(src)
    w, h = im.width / z, im.height / z
    x0 = min(max(0.0, cx * im.width - w / 2), im.width - w)
    y0 = min(max(0.0, cy * im.height - h / 2), im.height - h)
    b = io.BytesIO()
    im.resize((im.width, im.height), Image.LANCZOS, box=(x0, y0, x0 + w, y0 + h)).save(b, "JPEG", quality=92)
    return b.getvalue()


def override(script: dict, plan: dict, plates_dir: Path) -> int:
    clips = script.get("aivideo") or []
    if not clips:
        return 0
    cache = Path(tempfile.gettempdir()) / "htmm-aivideo"
    frames = [_frames(c["url"], cache) for c in clips]
    by_line = {i: ci for ci, c in enumerate(clips) for i in c.get("lines", [])}
    offset = [0] * len(clips)
    out = plates_dir / plan["slug"]
    out.mkdir(parents=True, exist_ok=True)
    line, outro, n, view = 0, 0, 0, 0
    for sc in plan["scenes"]:
        if str(sc.get("line", "")).startswith("(outro)"):
            ci = outro % len(clips)
            outro += 1
        else:
            ci = by_line.get(line, min(len(clips) - 1, line * len(clips) // max(1, len(by_line) or 1)))
            line += 1
        fr = frames[ci]
        v0 = view
        for j in range(sc["n"]):
            src = _pingpong(fr, offset[ci] + j)
            view = v0 + j // VIEW_N
            (out / f"{sc['si']}_{sc['frLo'] + j}.jpg").write_bytes(_view(src, view))
            n += 1
        view += 1           # the next line opens on a different framing too
        offset[ci] += sc["n"]
    print(f"[aivideo] {plan['slug']}: {n} frames from {len(clips)} clips", flush=True)
    return n


def script_for(slug: str) -> dict | None:
    p = ROOT / "content" / "scripts" / f"{slug}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
