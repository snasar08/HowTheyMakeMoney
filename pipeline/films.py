"""Long-form film queue: which film is next, is one due, thumbnail, release text, upload, mark delivered.

Queue = content/films2d/NNN-slug.json (top level only; subfolders such as content/films2d/test/ are never queued).
Film json keys used here: "status" (draft | ready | delivered), "title", "description", "tags", "posted_at" (set on delivery).
Ids >= 900 are internal test / reference films and are skipped FOREVER (INTERNAL_MIN, hard-coded on purpose).
Cadence: one film every 3 days (CADENCE_DAYS), counted in New York calendar days from the last delivered film's posted_at
(date based, so a daily 13:00 UTC cron never misses by a few minutes). Publish time = 17:00 America/New_York on the due day.

  python -m pipeline.films due [--dry] [--file F] [--force]   print + write GITHUB_OUTPUT: go, file, id, publish_at
  python -m pipeline.films thumb film.mp4 thumb.jpg           1280x720 JPEG from a frame of the film
  python -m pipeline.films notes film.json notes.md           release body (title + description)
  python -m pipeline.films upload film.json film.mp4 thumb.jpg PUBLISH_AT_ISO   FILM_UPLOAD=youtube only; never raises
  python -m pipeline.films mark film.json PUBLISH_AT_ISO [release_url] [youtube_url]
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
FILMS = ROOT / "content" / "films2d"
TZ = ZoneInfo(os.environ.get("CHANNEL_TZ", "America/New_York"))
CADENCE_DAYS = 3
PUBLISH_HOUR = 17          # 17:00 New York time
RUN_LATE_UTC = 16          # films.yml runs 13:00 UTC; after 16:00 UTC the next run is tomorrow
INTERNAL_MIN = 900         # ids 900+ never post (internal / reference films)
TEST_FILM = "content/films2d/test/tiny.json"
# Sam, Nov 20: films paused until the YouTube API audit is approved (no hand uploads / hand thumbnails).
# While this file exists: no film is due, no film day (Shorts stay 2 a day), the Saturday routine writes no films.
PAUSE_FILE = FILMS / "PAUSED"


def paused() -> bool:
    return PAUSE_FILE.exists()


def film_id(path: str | Path) -> int | None:
    m = re.match(r"(\d+)", Path(path).name)
    return int(m.group(1)) if m else None


def queue(folder: Path = FILMS) -> list[tuple[int, Path, dict]]:
    """[(id, path, film)] for real films only: top-level NNN-*.json, id < 900, sorted by id."""
    out = []
    for p in sorted(folder.glob("*.json")):
        n = film_id(p)
        if n is None or n >= INTERNAL_MIN:
            continue
        try:
            out.append((n, p, json.loads(p.read_text(encoding="utf-8"))))
        except Exception as exc:
            print(f"::warning title=film queue::{p.name} unreadable ({exc!r})")
    return sorted(out, key=lambda t: t[0])


def _parse(ts: str) -> dt.datetime:
    d = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def last_posted(items) -> dt.datetime | None:
    stamps = []
    for n, p, f in items:
        if f.get("status") == "delivered" and f.get("posted_at"):
            try:
                stamps.append(_parse(f["posted_at"]))
            except ValueError:
                print(f"::warning title=film queue::{p.name} has a bad posted_at")
    return max(stamps) if stamps else None


def is_due(items, now: dt.datetime) -> bool:
    """True when no film was ever delivered, or the last delivery is >= 3 New York calendar days before today."""
    last = last_posted(items)
    if last is None:
        return True
    return (now.astimezone(TZ).date() - last.astimezone(TZ).date()).days >= CADENCE_DAYS


def next_ready(items):
    for n, p, f in items:
        if f.get("status") == "ready":
            return n, p, f
    return None


def film_days(now: dt.datetime, items=None, ahead: int = 3) -> set[dt.date]:
    """New York dates that have (or will have) a long-form film: days a film was delivered, plus the next
    due dates for the ready films (first one today or 3 days after the last, then every 3 days).
    Shorts use this (Sam, Nov 19): 2 Shorts a day, but only 1 Short on a film day."""
    if items is None:
        if paused():
            return set()
        items = queue()
    out = set()
    for n, p, f in items:
        if f.get("status") == "delivered" and f.get("posted_at"):
            try:
                out.add(_parse(f["posted_at"]).astimezone(TZ).date())
            except ValueError:
                pass
    ready = [x for x in items if x[2].get("status") == "ready"][:ahead]
    if ready:
        # date of the next films.yml run (13:00 UTC; counted as missed 3 h later): that's when a due film goes out
        u = now.astimezone(dt.timezone.utc)
        today = u.date() + dt.timedelta(days=1 if u.hour >= RUN_LATE_UTC else 0)
        last = last_posted(items)
        d = today if last is None else max(today, last.astimezone(TZ).date() + dt.timedelta(days=CADENCE_DAYS))
        for _ in ready:
            out.add(d)
            d += dt.timedelta(days=CADENCE_DAYS)
    return out


def publish_at(now: dt.datetime) -> dt.datetime:
    """17:00 New York on today's date; if that is already (nearly) past, now + 15 min (YouTube needs a future time)."""
    local = now.astimezone(TZ)
    t = local.replace(hour=PUBLISH_HOUR, minute=0, second=0, microsecond=0)
    if t <= local + dt.timedelta(minutes=10):
        t = local + dt.timedelta(minutes=15)
    return t.astimezone(dt.timezone.utc)


def _rel(p: Path) -> str:
    try:
        return p.relative_to(ROOT).as_posix()
    except ValueError:
        return p.as_posix()


def _go(p: Path, now: dt.datetime, why: str) -> dict:
    return {"go": True, "file": _rel(p), "id": p.stem, "publish_at": publish_at(now).strftime("%Y-%m-%dT%H:%M:%SZ"), "why": why}


def decide(items, now: dt.datetime, dry: bool = False, file: str = "", force: bool = False) -> dict:
    """The 'due?' step. Returns {go, file, id, publish_at, why}."""
    if file:
        p = Path(file) if Path(file).is_absolute() else ROOT / file
        n = film_id(p)
        if n is not None and n >= INTERNAL_MIN:
            return {"go": False, "why": f"{p.name}: ids {INTERNAL_MIN}+ are internal and never render here"}
        return _go(p, now, "explicit file")
    if paused() and not dry:
        return {"go": False, "why": f"films paused ({_rel(PAUSE_FILE)})"}
    if dry and not force:
        pick = next_ready(items)
        if pick:
            return _go(pick[1], now, "dry run of the next ready film")
        return _go(ROOT / TEST_FILM, now, "dry run, no ready film: test film")
    if not force and not is_due(items, now):
        return {"go": False, "why": f"last film posted {last_posted(items):%Y-%m-%d}, next one {CADENCE_DAYS} days after"}
    pick = next_ready(items)
    if not pick:
        return {"go": False, "why": "due, but no film with status ready"}
    return _go(pick[1], now, "due")


def thumb(mp4: str, out: str, at: float | None = None) -> None:
    """1280x720 JPEG (< 2 MB) from a frame of the film, at ~35 % of its length (past the opening, before the end card)."""
    if at is None:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4],
                           capture_output=True, text=True)
        try:
            at = max(0.0, float(r.stdout.strip()) * 0.35)
        except ValueError:
            at = 3.0
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{at:.2f}", "-i", mp4, "-frames:v", "1",
                    "-vf", "scale=1280:720", "-q:v", "3", out], check=True)


# Same easy shape for every film (Sam, Nov 19: "a description which is easy to all of them"): the film's own
# "description" is just its story in 1-2 plain sentences; these lines are added the same way every time.
DESC_END = ("A new silent story every 3 days. Subscribe so you don't miss the next one.\n"
            "Short money stories every day: @HowTheyMakeMoneyDaily\n\n"
            "#animation #shortfilm #money")


def description(film: dict) -> str:
    story = film.get("description", "").strip()
    return f"{story}\n\n{DESC_END}" if story else DESC_END


def notes(film: dict) -> str:
    return f"# {film.get('title', '')}\n\n{description(film)}\n\nTags: {', '.join(film.get('tags', []))}\n"


def mark(path: Path, posted: str, release_url: str = "", youtube_url: str = "") -> None:
    f = json.loads(path.read_text(encoding="utf-8"))
    f["status"] = "delivered"
    f["posted_at"] = posted
    if release_url:
        f["release"] = release_url
    if youtube_url:
        f["youtube"] = youtube_url
    path.write_text(json.dumps(f, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def upload(film_path: Path, mp4: Path, thumb_img: Path, posted: str) -> dict | None:
    """FILM_UPLOAD=youtube: private + publishAt via pipeline.yt_upload. Anything else / any failure: None + a warning
    (the release already exists; Sam uploads from there). Never raises."""
    try:
        if os.environ.get("FILM_UPLOAD", "release") != "youtube":
            print("[films] FILM_UPLOAD is not 'youtube': the release is the result")
            return None
        from . import yt_upload
        film = json.loads(film_path.read_text(encoding="utf-8"))
        film.setdefault("id", film_path.stem)
        film["description"] = description(film)
        res =yt_upload.upload_film(mp4, film, _parse(posted), thumb_img)
        if res is None:
            print(f"::warning title=film upload::YouTube upload failed: Sam must upload {mp4.name} from the release by hand")
        return res
    except Exception as exc:
        print(f"::warning title=film upload::{exc!r}: Sam must upload the film from the release by hand")
        return None


def _gh_out(d: dict) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    lines = "".join(f"{k}={v}\n" for k, v in d.items() if "\n" not in str(v))
    if path:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(lines)


def main(a: list[str]) -> int:
    if not a:
        print(__doc__)
        return 0
    cmd = a[0]
    if cmd == "due":
        env = os.environ
        dry = "--dry" in a or env.get("FILM_DRY") == "true"
        force = "--force" in a or env.get("FILM_FORCE") == "true"
        file = a[a.index("--file") + 1] if "--file" in a else env.get("FILM_FILE", "")
        now = _parse(env["FILM_NOW"]) if env.get("FILM_NOW") else dt.datetime.now(dt.timezone.utc)
        d = decide(queue(), now, dry, file, force)
        print(json.dumps(d))
        _gh_out({**d, "go": "true" if d["go"] else "false"})
        return 0
    if cmd == "thumb":
        thumb(a[1], a[2])
        return 0
    if cmd == "notes":
        Path(a[2]).write_text(notes(json.loads(Path(a[1]).read_text(encoding="utf-8"))), encoding="utf-8")
        return 0
    if cmd == "upload":
        res = upload(Path(a[1]), Path(a[2]), Path(a[3]), a[4])
        print("RESULT", json.dumps(res))
        _gh_out({"yt_url": (res or {}).get("url", "")})
        return 0
    if cmd == "mark":
        mark(Path(a[1]), a[2], a[3] if len(a) > 3 else "", a[4] if len(a) > 4 else "")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
