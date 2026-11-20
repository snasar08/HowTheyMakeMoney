"""Daily health check: how each recent Short is doing, and whether its thumbnail is up.

Runs after pipeline.stats (stats.yml). For every Short posted in the last DAYS days it reads
views/likes from analytics/stats.json and downloads YouTube's public thumbnail (i.ytimg.com, no
key needed). Thumbnail checks:
  up     - YouTube serves a real thumbnail (not missing or the grey placeholder)
  cover  - it matches our cover frame (analytics/covers/<id>.jpg, saved at render time) by a
           simple picture fingerprint; "auto" means YouTube picked a different frame
Writes analytics/health.md (a table Claude or Sam can read) and analytics/health.json, and prints
a ::warning for any thumbnail that is missing or isn't our cover. Never fails the workflow.

  python -m pipeline.health
"""
from __future__ import annotations

import datetime as dt
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "analytics"
DAYS = 7
MATCH = 0.90  # share of fingerprint bits that must agree (different Shorts on one template hit ~0.8)


def norm(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.lower())


def fetch(url: str) -> Image.Image | None:
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return Image.open(io.BytesIO(r.read())).convert("RGB")
    except Exception:
        return None


def thumbnail(vid: str) -> tuple[Image.Image | None, str]:
    """YouTube's vertical Shorts thumbnail if it has one, else the 4:3 one cropped to the middle."""
    im = fetch(f"https://i.ytimg.com/vi/{vid}/oar2.jpg")
    if im is not None and im.height > im.width:
        return im, "oar2"
    im = fetch(f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg")
    if im is None or im.width <= 120:  # 120x90 is the "no thumbnail" placeholder
        return None, ""
    a = np.asarray(im.convert("L"), np.float32)
    rows = np.where(a.mean(1) > 12)[0]  # trim black letterbox bars
    if len(rows):
        im = im.crop((0, rows[0], im.width, rows[-1] + 1))
    w = im.height * 9 / 16
    return im.crop((int((im.width - w) / 2), 0, int((im.width + w) / 2), im.height)), "hq"


def fingerprint(im: Image.Image) -> np.ndarray:
    """Difference hash of the middle of the frame (where the cover text sits)."""
    w, h = im.size
    g = im.crop((0, int(h * 0.2), w, int(h * 0.8))).convert("L").resize((17, 16), Image.LANCZOS)
    a = np.asarray(g, np.float32)
    return (a[:, 1:] > a[:, :-1]).ravel()


def blank(im: Image.Image) -> bool:
    return float(np.asarray(im.convert("L"), np.float32).std()) < 6


def main() -> int:
    path = OUT / "stats.json"
    if not path.exists():
        print("[health] no analytics/stats.json yet; skipping")
        return 0
    db = json.loads(path.read_text())
    scripts = {}
    for p in (ROOT / "content" / "scripts").glob("*.json"):
        s = json.loads(p.read_text(encoding="utf-8"))
        scripts[norm(s["title"])] = p.stem
    now = dt.datetime.now(dt.timezone.utc)
    rows, warn = [], 0
    for vid, v in db["videos"].items():
        pub = dt.datetime.fromisoformat(v["published"].replace("Z", "+00:00"))
        age = (now - pub).total_seconds() / 3600
        if age > DAYS * 24 or not v.get("snapshots"):
            continue
        snap = v["snapshots"][-1]
        sid = scripts.get(norm(v["title"]))
        im, kind = thumbnail(vid)
        up = im is not None and not blank(im)
        cover = None
        cfile = OUT / "covers" / f"{sid}.jpg" if sid else None
        if up and cfile and cfile.exists():
            cover = float((fingerprint(im) == fingerprint(Image.open(cfile))).mean())
        rows.append({"video": vid, "script": sid, "title": v["title"], "age_h": round(age, 1),
                     "views": snap["views"], "likes": snap["likes"], "comments": snap["comments"],
                     "views_per_h": round(snap["views"] / max(age, 1), 1),
                     "thumb_up": up, "thumb_kind": kind,
                     "cover_match": None if cover is None else round(cover, 2)})
        if not up:
            warn += 1
            print(f"::warning title=thumbnail {sid or vid}::no thumbnail on YouTube for '{v['title']}'")
        elif cover is not None and cover < MATCH:
            warn += 1
            print(f"::warning title=thumbnail {sid or vid}::YouTube shows a different frame, not our cover "
                  f"(match {cover:.0%}) for '{v['title']}'")
    rows.sort(key=lambda r: -r["views_per_h"])

    def mark(r):
        if not r["thumb_up"]:
            return "MISSING"
        if r["cover_match"] is None:
            return "up (no saved cover)"
        return f"up, our cover ({r['cover_match']:.0%})" if r["cover_match"] >= MATCH else f"up, other frame ({r['cover_match']:.0%})"

    lines = [f"# Health check, {now:%Y-%m-%d %H:%M} UTC", "",
             f"Shorts posted in the last {DAYS} days, fastest first. Subscribers: {db.get('subscribers', '?')}.",
             f"Thumbnail problems: {warn}.", "",
             "| Script | Title | Age | Views | Views/h | Likes | Comments | Thumbnail |",
             "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['script'] or '?'} | {r['title']} | {r['age_h']:.0f} h | {r['views']} | "
                     f"{r['views_per_h']} | {r['likes']} | {r['comments']} | {mark(r)} |")
    OUT.mkdir(exist_ok=True)
    (OUT / "health.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (OUT / "health.json").write_text(json.dumps({"at": now.isoformat(), "problems": warn, "shorts": rows}, indent=1) + "\n")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
