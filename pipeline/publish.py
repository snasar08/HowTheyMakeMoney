"""Deliver a finished video.

UPLOAD_MODE:
  release  - (default) attach the MP4 to a GitHub Release in this repo, with the
             title/description ready to copy. GitHub notifies your phone; you
             upload it in the YouTube app (~1 min). Use this until YouTube
             approves your API audit, because unaudited API uploads are locked
             to private by YouTube.
  youtube  - upload straight to YouTube via the Data API, scheduled with
             publishAt. Needs YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN
             secrets and an audited Google Cloud project to go public.
  none     - render only (testing).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo(os.environ.get("CHANNEL_TZ", "America/New_York"))
# Daily posting times (local). One slot per video rendered in a run.
SLOTS = [s.strip() for s in os.environ.get("POST_SLOTS", "12:00,18:00").split(",") if s.strip()]


def publish_slots(n: int, now: dt.datetime | None = None) -> list[dt.datetime]:
    """Next n posting times, never sooner than 1 hour from now."""
    now = now or dt.datetime.now(TZ)
    out, day = [], now.date()
    while len(out) < n:
        for s in SLOTS:
            hh, mm = map(int, s.split(":"))
            t = dt.datetime.combine(day, dt.time(hh, mm), TZ)
            if t > now + dt.timedelta(hours=1) and len(out) < n:
                out.append(t)
        day += dt.timedelta(days=1)
    return out


def _release(video: Path, script: dict, when: dt.datetime) -> dict:
    tag = f"short-{script['id']}-{script['slug']}"
    notes = (
        f"**Post on YouTube around {when.strftime('%a %b %d, %I:%M %p %Z')}**\n\n"
        f"**Title** (copy):\n```\n{script['title']}\n```\n"
        f"**Description** (copy):\n```\n{script['description']}\n```\n"
        "In the YouTube app: + → Upload a video → pick this MP4 → paste title and description. "
        "Under 'Altered or synthetic content' choose Yes (AI images and AI voice)."
    )
    subprocess.run(["gh", "release", "delete", tag, "--yes", "--cleanup-tag"],
                   capture_output=True)
    subprocess.run(["gh", "release", "create", tag, str(video),
                    "--title", f"Ready to post: {script['company']} — {script['title']}",
                    "--notes", notes], check=True)
    url = subprocess.run(["gh", "release", "view", tag, "--json", "url", "-q", ".url"],
                         capture_output=True, text=True).stdout.strip()
    return {"mode": "release", "release": url, "post_at": when.isoformat()}


def _youtube(video: Path, script: dict, when: dt.datetime) -> dict:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload

    creds = Credentials(
        None,
        refresh_token=os.environ["YT_REFRESH_TOKEN"],
        client_id=os.environ["YT_CLIENT_ID"],
        client_secret=os.environ["YT_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )
    yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
    status = {
        "privacyStatus": "private",
        "publishAt": when.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "selfDeclaredMadeForKids": False,
        "containsSyntheticMedia": True,  # AI images + AI voice disclosure
    }
    body = {
        "snippet": {
            "title": script["title"][:100],
            "description": script["description"][:4900],
            "tags": script.get("tags", [])[:15],
            "categoryId": "27",  # Education
        },
        "status": status,
    }
    try:
        req = yt.videos().insert(part="snippet,status", body=body,
                                 media_body=MediaFileUpload(str(video), resumable=True,
                                                            mimetype="video/mp4"))
        resp = None
        while resp is None:
            _, resp = req.next_chunk()
    except HttpError as exc:
        if "containsSyntheticMedia" in str(exc):
            status.pop("containsSyntheticMedia")
            return _youtube(video, script, when)
        raise
    return {"mode": "youtube", "video_id": resp["id"], "post_at": when.isoformat(),
            "url": f"https://youtube.com/shorts/{resp['id']}"}


def deliver(video: Path, script: dict, when: dt.datetime) -> dict:
    mode = os.environ.get("UPLOAD_MODE", "release")
    if mode == "youtube":
        try:
            return _youtube(video, script, when)
        except Exception as exc:  # never lose a finished video
            print(f"[publish] YouTube upload failed ({exc!r}); saving as a release instead")
            return _release(video, script, when)
    if mode == "release":
        return _release(video, script, when)
    return {"mode": "none", "path": str(video)}


if __name__ == "__main__":
    print(json.dumps([t.isoformat() for t in publish_slots(4)], indent=2))
