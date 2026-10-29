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
  buffer   - make the release (so the MP4 has a stable public URL), then schedule it on the
             YouTube channel through Buffer's GraphQL API (https://api.buffer.com, free plan)
             at its POST_SLOTS time. Needs the BUFFER_API_KEY secret and a PUBLIC repo,
             because Buffer fetches the video from that URL when the post goes out. If Buffer
             fails for any reason it falls back to the release with a ::warning::.
  none     - render only (testing).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo(os.environ.get("CHANNEL_TZ", "America/New_York"))
# Daily posting times (local). One slot per video rendered in a run.
SLOTS = [s.strip() for s in os.environ.get("POST_SLOTS", "12:00,18:00").split(",") if s.strip()]
# Nothing is rendered or delivered by the nightly run before this date (New York).
POST_START = dt.date.fromisoformat(os.environ.get("POST_START") or "2026-10-27")
BUFFER_API = "https://api.buffer.com"
REPO = os.environ.get("GITHUB_REPOSITORY", "snasar08/HowTheyMakeMoney")


def posting_started(now: dt.datetime | None = None) -> bool:
    return (now or dt.datetime.now(TZ)).date() >= POST_START


MAX_PER_DAY = int(os.environ.get("MAX_PER_DAY", "2"))
# render only for open slots this far ahead; the evening run fills tomorrow, the backup run tops up
HORIZON_H = float(os.environ.get("SLOT_HORIZON_H", "36"))


def taken_slots(scripts: list[dict]) -> dict[dt.datetime, str]:
    """Slots already holding a post: {local time: script id}, from the delivered records the
    nightly commits (each carries its Buffer post id and post_at)."""
    out = {}
    for s in scripts:
        d = s.get("delivered") or {}
        if d.get("post_at") and d.get("buffer_status") != "deleted":
            out[dt.datetime.fromisoformat(d["post_at"]).astimezone(TZ)] = s.get("id", "?")
    return out


def publish_slots(n: int, now: dt.datetime | None = None, taken=None, horizon_h: float | None = None
                  ) -> list[dt.datetime]:
    """Up to n free posting times: never sooner than MIN_LEAD_MIN (default 20) minutes from now,
    never a slot that already has a post, never more than MAX_PER_DAY posts on one day. A slot
    that has passed (late run) simply isn't offered; the next free slot is used instead."""
    now = now or dt.datetime.now(TZ)
    taken = taken or {}
    lead = dt.timedelta(minutes=int(os.environ.get("MIN_LEAD_MIN", "20")))
    end = now + dt.timedelta(hours=horizon_h) if horizon_h else None
    per_day: dict[dt.date, int] = {}
    for t in taken:
        per_day[t.date()] = per_day.get(t.date(), 0) + 1
    out, day = [], max(now.date(), POST_START)
    while len(out) < n:
        if end and dt.datetime.combine(day, dt.time(0, 0), TZ) > end:
            break
        for s in SLOTS:
            hh, mm = map(int, s.split(":"))
            t = dt.datetime.combine(day, dt.time(hh, mm), TZ)
            if len(out) >= n or t <= now + lead or t in taken or (end and t > end):
                continue
            if per_day.get(day, 0) >= MAX_PER_DAY:
                break
            out.append(t)
            per_day[day] = per_day.get(day, 0) + 1
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
    asset = f"https://github.com/{REPO}/releases/download/{tag}/{video.name}"
    return {"mode": "release", "release": url, "asset_url": asset, "post_at": when.isoformat()}


# ---- Buffer (docs: developers.buffer.com — GraphQL, Bearer key, createPost/deletePost)
class BufferError(RuntimeError):
    pass


def buffer_gql(query: str, variables: dict | None = None, retries: int = 3) -> dict:
    key = os.environ.get("BUFFER_API_KEY")
    if not key:
        raise BufferError("BUFFER_API_KEY is not set")
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    for attempt in range(retries):
        req = urllib.request.Request(BUFFER_API, data=body, method="POST", headers={
            "Content-Type": "application/json", "Authorization": f"Bearer {key}",
            "User-Agent": "HowTheyMakeMoney-shorts-bot"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read())
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt + 1 < retries:  # rate limited; Retry-After is seconds
                time.sleep(min(int(exc.headers.get("Retry-After", "30")), 120))
                continue
            raise BufferError(f"HTTP {exc.code}: {exc.read()[:300]!r}") from None
        if data.get("errors"):
            raise BufferError(f"GraphQL errors: {json.dumps(data['errors'])[:500]}")
        return data["data"]
    raise BufferError("rate limited")


_channel_cache: dict = {}


def buffer_channel() -> tuple[str, str]:
    """(organizationId, channelId) of the connected YouTube channel, looked up through the API."""
    if not _channel_cache:
        orgs = buffer_gql("query { account { organizations { id } } }")["account"]["organizations"]
        for org in orgs:
            chans = buffer_gql("query($o: OrganizationId!) { channels(input: {organizationId: $o}) "
                               "{ id name service } }", {"o": org["id"]})["channels"]
            for ch in chans:
                if str(ch["service"]).lower() == "youtube":
                    _channel_cache.update(org=org["id"], channel=ch["id"], name=ch["name"])
                    break
            if _channel_cache:
                break
        if not _channel_cache:
            raise BufferError("no YouTube channel connected in Buffer")
    return _channel_cache["org"], _channel_cache["channel"]


def public_ok(url: str) -> bool:
    """Buffer needs an unauthenticated URL (it fetches at publish time)."""
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "curl/8"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:
        return False


def youtube_text(script: dict) -> str:
    """Buffer's YouTube input has no tags field, so tags ride along as hashtags."""
    tags = " ".join("#" + "".join(ch for ch in t.title() if ch.isalnum()) for t in script.get("tags", [])[:5])
    desc = script["description"].strip()
    return (desc + ("\n\n" + tags if tags and tags not in desc else ""))[:4900]


CREATE_POST = """
mutation($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess { post { id dueAt status } }
    ... on MutationError { message }
  }
}"""


def post_input(video_url: str, script: dict, when: dt.datetime, privacy: str | None = None) -> dict:
    _, channel = buffer_channel()
    youtube = {"title": script["title"][:100], "categoryId": "27",  # Education
               "madeForKids": False, "isAiGenerated": True, "notifySubscribers": True}
    if privacy:
        youtube["privacy"] = privacy
    inp = {
        "channelId": channel,
        "text": youtube_text(script),
        "schedulingType": "automatic",
        "mode": "customScheduled",
        "dueAt": when.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "assets": [{"video": {"url": video_url, "metadata": {"title": script["title"][:100]}}}],
        "metadata": {"youtube": youtube},
    }
    return inp


def buffer_schedule(video_url: str, script: dict, when: dt.datetime, privacy: str | None = None) -> dict:
    inp = post_input(video_url, script, when, privacy)
    res = buffer_gql(CREATE_POST, {"input": inp})["createPost"]
    if "post" not in res:
        raise BufferError(f"createPost: {res.get('message')}")
    return res["post"]


def buffer_post(post_id: str) -> dict:
    return buffer_gql("query($i: PostId!) { post(input: {id: $i}) { id status dueAt } }", {"i": post_id})["post"]


def buffer_delete(post_id: str) -> None:
    res = buffer_gql("mutation($i: PostId!) { deletePost(input: {id: $i}) "
                     "{ ... on DeletePostSuccess { id } ... on MutationError { message } } }",
                     {"i": post_id})["deletePost"]
    if "id" not in res:
        raise BufferError(f"deletePost: {res.get('message')}")


def _buffer(video: Path, script: dict, when: dt.datetime) -> dict:
    rel = _release(video, script, when)  # the release is both the media host and the fallback
    try:
        if not public_ok(rel["asset_url"]):
            raise BufferError(f"video URL isn't public ({rel['asset_url']}) — is the repo public?")
        post = buffer_schedule(rel["asset_url"], script, when)
        check = buffer_post(post["id"])  # confirm it is really queued
        print(f"[publish] Buffer scheduled {script['id']} for {when:%a %H:%M %Z}: post {post['id']} "
              f"status={check.get('status')}")
        return {**rel, "mode": "buffer", "buffer_post": post["id"], "buffer_status": check.get("status")}
    except Exception as exc:
        print(f"::warning title=Buffer failed for {script['id']}::{exc} — left as a GitHub Release "
              f"to post by hand")
        return rel


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
    if mode == "buffer":
        return _buffer(video, script, when)
    if mode == "buffer_dry":  # full check, nothing posted: read-only channel lookup + the exact payload
        url = f"https://github.com/{REPO}/releases/download/short-{script['id']}-{script['slug']}/{video.name}"
        inp = post_input(url, script, when)
        size = video.stat().st_size
        problems = [p for p, bad in (("title over 100 chars", len(script["title"]) > 100),
                                     ("video over 256 MB", size > 256e6),
                                     ("no channel", not inp["channelId"])) if bad]
        out = {"mode": "buffer_dry", "channel": _channel_cache.get("name"), "post_at": when.isoformat(),
               "title": script["title"], "bytes": size, "problems": problems}
        if problems:
            raise BufferError(f"buffer dry run: {problems}")
        return out
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
    print(json.dumps([t.isoformat() for t in publish_slots(4)], indent=2))  # noqa
