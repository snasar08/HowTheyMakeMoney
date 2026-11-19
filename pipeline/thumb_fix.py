"""Put our cover on every Short whose YouTube thumbnail is the wrong frame (Nov 19, Sam: "make sure video uploads
with thumbnails").

Why: Buffer has no custom-thumbnail field, and its thumbnailOffset (publish.py, Nov 15) did not stick: health.md on
Nov 19 showed 34 Shorts with "other frame". So after posting, this sets the thumbnail straight through the YouTube
API (thumbnails.set), using frame 0 of the posted MP4 (our title cover) at full size.

Runs in stats.yml right after pipeline.health, reading analytics/health.json. Needs:
  - the comment login secrets YTC_CLIENT_ID / YTC_CLIENT_SECRET / YTC_REFRESH_TOKEN (scope youtube.force-ssl,
    made once by Sam with `python -m pipeline.comment_auth`); without them it prints a notice and does nothing.
  - the channel allowed custom thumbnails (YouTube Studio -> Settings -> Channel -> Feature eligibility ->
    "Intermediate features" Enabled, i.e. phone-verified). If YouTube refuses, it says so once and stops.
Each video is set at most once (analytics/thumbs_set.json). Never fails the workflow.

  python -m pipeline.thumb_fix            # set thumbnails
  python -m pipeline.thumb_fix --dry      # only list what it would do
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from pipeline.comment_replies import token
from pipeline.health import MATCH

ROOT = Path(__file__).resolve().parent.parent
REPO = "snasar08/HowTheyMakeMoney"
DONE = ROOT / "analytics" / "thumbs_set.json"


def todo(rows: list[dict], done: dict) -> list[dict]:
    """Shorts whose thumbnail is missing or is not our cover, that we know the script of and haven't set yet."""
    out = []
    for r in rows:
        if not r.get("script") or r["video"] in done:
            continue
        bad = not r.get("thumb_up") or (r.get("cover_match") is not None and r["cover_match"] < MATCH)
        if bad:
            out.append(r)
    return out


def mp4_url(sid: str) -> str | None:
    s = json.loads((ROOT / "content" / "scripts" / f"{sid}.json").read_text(encoding="utf-8"))
    tag = f"short-{s['id']}-{s['slug']}"
    try:
        with urllib.request.urlopen(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", timeout=30) as r:
            rel = json.loads(r.read())
    except Exception:
        return None
    for a in rel.get("assets", []):
        if a["name"].endswith(".mp4"):
            return a["browser_download_url"]
    return None


def cover(url: str, out: Path) -> None:
    """Frame 0 (the title cover) at full 1080x1920, JPEG well under YouTube's 2 MB limit."""
    mp4 = out.with_suffix(".mp4")
    urllib.request.urlretrieve(url, mp4)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-frames:v", "1",
                    "-vf", "scale=1080:1920", "-q:v", "3", str(out)], check=True)


def set_thumb(vid: str, img: Path, access: str) -> None:
    req = urllib.request.Request(
        f"https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={vid}&uploadType=media",
        data=img.read_bytes(), method="POST",
        headers={"Authorization": f"Bearer {access}", "Content-Type": "image/jpeg"})
    with urllib.request.urlopen(req, timeout=60) as r:
        r.read()


def main() -> int:
    dry = "--dry" in sys.argv
    hp = ROOT / "analytics" / "health.json"
    if not hp.exists():
        print("[thumb_fix] no analytics/health.json yet; skipping")
        return 0
    done = json.loads(DONE.read_text()) if DONE.exists() else {}
    jobs = todo(json.loads(hp.read_text())["shorts"], done)
    print(f"[thumb_fix] {len(jobs)} Shorts need our cover as thumbnail")
    if not jobs or dry:
        for r in jobs:
            print(f"  {r['script']} {r['video']} {r['title']}")
        return 0
    try:
        access = token()
    except Exception as exc:
        print(f"::warning title=thumbnails::login failed ({exc!r}); nothing set")
        return 0
    if not access:
        print("::notice title=thumbnails::not set up yet (YTC_* secrets); nothing set")
        return 0
    n = 0
    with tempfile.TemporaryDirectory() as tmp:
        for r in jobs:
            url = mp4_url(r["script"])
            if not url:
                print(f"::warning title=thumbnail {r['script']}::posted MP4 not found on its release")
                continue
            img = Path(tmp) / f"{r['script']}.jpg"
            try:
                cover(url, img)
                set_thumb(r["video"], img, access)
            except urllib.error.HTTPError as exc:
                body = exc.read().decode(errors="replace")[:300]
                print(f"::warning title=thumbnails::YouTube refused ({exc.code}): {body}")
                if exc.code in (401, 403):  # not allowed (channel not verified / wrong login): stop for today
                    break
                continue
            except Exception as exc:
                print(f"::warning title=thumbnail {r['script']}::{exc!r}")
                continue
            done[r["video"]] = r["script"]
            n += 1
            print(f"[thumb_fix] set cover for {r['script']} ({r['video']})")
    DONE.write_text(json.dumps(done, indent=1) + "\n")
    print(f"[thumb_fix] {n} thumbnails set")
    return 0


if __name__ == "__main__":
    sys.exit(main())
