"""Teaser Short (1080x1920) cut from a long-form film (Nov 19, Sam: "whatever you think will be best").

Why: the Shorts get far more views than a new long video will; a 25-30 s cut of the film's strongest stretch, with
"full film on the channel", sends Shorts viewers to the films.

The film JSON picks the stretch with "teaser": {"from": beat, "to": beat, "hook": "short top line"} (beat numbers as
`python -m pipeline.film2d table FILE` prints them, both included). Without it: the 25 s ending where the first red
line ends. Layout: the whole 16:9 film full width in the middle, hook text on top, "FULL FILM ON THE CHANNEL" below.

  python -m pipeline.teaser FILM.json FILM.mp4 OUT.mp4
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "assets" / "fonts" / "InterDisplay-Black.otf"
W, H, SW, SH = 1080, 1920, 1080, 608   # whole film width: any zoom cuts the DAY label and edge characters (tried Nov 19)
FW, FH = W, SH
FY = (H - FH) // 2


def window(film: dict) -> tuple[float, float, str]:
    """(start s, end s, hook) of the teaser inside the film."""
    beats, t, starts = film["beats"], 0.0, []
    for b in beats:
        starts.append(t)
        t += b["s"]
    starts.append(t)
    tz = film.get("teaser") or {}
    hook = tz.get("hook") or film.get("title", "").split(":")[0]
    if "from" in tz and "to" in tz:
        return starts[tz["from"]], starts[tz["to"] + 1], hook
    for i, b in enumerate(beats):
        say = b.get("say")
        if isinstance(say, list) and any(x.get("red") for x in say):
            end = starts[i + 1]
            return max(0.0, end - 25.0), end, hook
    mid = t * 0.5
    return mid - 12.5, mid + 12.5, hook


def _wrap(d: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    lines, cur = [], ""
    for w in text.split():
        nxt = (cur + " " + w).strip()
        if d.textlength(nxt, font=font) <= width or not cur:
            cur = nxt
        else:
            lines.append(cur)
            cur = w
    return lines + ([cur] if cur else [])


def overlay(hook: str, out: Path) -> None:
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    big = ImageFont.truetype(str(FONT), 88)
    lines = _wrap(d, hook, big, W - 140)
    y = FY - 90 - len(lines) * 104
    for ln in lines:
        d.text((W // 2, y), ln, font=big, fill="#FFFFFF", anchor="mt", stroke_width=6, stroke_fill="#000000")
        y += 104
    small = ImageFont.truetype(str(FONT), 66)
    d.text((W // 2, FY + FH + 110), "FULL FILM ON THE CHANNEL", font=small, fill="#EF4E3A", anchor="mt",
           stroke_width=5, stroke_fill="#000000")
    im.save(out)


def make(film_path: str, mp4: str, out: str) -> None:
    film = json.loads(Path(film_path).read_text(encoding="utf-8"))
    a, b, hook = window(film)
    n = b - a
    with tempfile.TemporaryDirectory() as tmp:
        ov = Path(tmp) / "ov.png"
        overlay(hook, ov)
        vf = (f"[0:v]scale={SW}:{SH},crop={W}:{SH},pad={W}:{H}:0:{FY}:color=0x0B0B0B[f];[f][1:v]overlay=0:0,"
              f"fade=t=in:st=0:d=0.3,fade=t=out:st={n - 0.6:.2f}:d=0.6,format=yuv420p[v]")
        af = f"afade=t=in:st=0:d=0.3,afade=t=out:st={n - 0.8:.2f}:d=0.8"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-t", f"{n:.3f}", "-i", mp4, "-i", str(ov),
                        "-filter_complex", vf, "-map", "[v]", "-map", "0:a?", "-af", af, "-r", "30",
                        "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-c:a", "aac", "-b:a", "160k",
                        "-movflags", "+faststart", out], check=True)
    print(f"[teaser] {Path(out).name}: {a:.1f}-{b:.1f} s of the film ({n:.1f} s), hook {hook!r}")


if __name__ == "__main__":
    make(sys.argv[1], sys.argv[2], sys.argv[3])
