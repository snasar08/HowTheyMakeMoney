"""First comment on every new Short (Sam, Nov 22: "auto comment every video we post").

  python -m pipeline.first_comment              # post (needs YTC_CLIENT_ID / YTC_CLIENT_SECRET / YTC_REFRESH_TOKEN)
  COMMENT_DRY=1 python -m pipeline.first_comment  # find the videos and print the comments, post nothing

Buffer publishes the Shorts, so the YouTube video id is only known after it goes live. Every couple of hours:
the channel's uploads from the last 2 days (1 quota unit) -> match each to its script (same title, else the
delivered post time within 90 min) -> skip videos already in analytics/first_comments.json or that already have
a top-level comment from the channel -> post the script's first_comment (else its cta_question) as the channel (commentThreads.insert,
50 units) -> log it. YouTube's API cannot pin comments; pin by hand if wanted.
Never raises on a missing secret: prints a notice and exits 0.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

from .comment_replies import BAD_RX, HANDLE, YT, _post, token, yt

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "analytics" / "first_comments.json"
SCRIPTS = ROOT / "content" / "scripts"
HOURS, MAX_PER_RUN = 48, 4
FALLBACK = "Who should we do next? 👇"


def norm(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def ok(t: str) -> bool:
    return bool(t) and len(t) <= 120 and not BAD_RX.search(t) and not re.search(r"https?://|www\.|@|#", t)


def comment_text(script: dict) -> str:
    """The script's first_comment (written by the Saturday routine), else its cta_question, else a stock line."""
    fc = (script.get("first_comment") or "").strip()
    if ok(fc):
        return fc
    q = (script.get("cta_question") or "").strip()
    return q + " 👇" if ok(q) else FALLBACK


def match(video: dict, scripts: list[dict]) -> dict | None:
    vt = norm(video["title"])
    for s in scripts:
        if s.get("title") and norm(s["title"]) and norm(s["title"]) in vt:
            return s
    when = dt.datetime.fromisoformat(video["published"].replace("Z", "+00:00"))
    best = None
    for s in scripts:
        pa = (s.get("delivered") or {}).get("post_at")
        if pa:
            gap = abs(dt.datetime.fromisoformat(pa) - when)
            if gap <= dt.timedelta(minutes=90) and (best is None or gap < best[0]):
                best = (gap, s)
    return best[1] if best else None


def main() -> int:
    dry = bool(os.environ.get("COMMENT_DRY"))
    tok = None if dry else token()
    if not dry and not tok:
        print("::notice title=first comment::comment login not set up (YTC_* secrets); nothing posted")
        return 0
    if dry and not os.environ.get("YT_API_KEY"):
        print("::notice title=first comment::no YT_API_KEY for the dry run")
        return 0
    auth = {"Authorization": f"Bearer {tok}"} if tok else {}
    log = json.loads(LOG.read_text(encoding="utf-8")) if LOG.exists() else {}
    ch = yt("channels", auth, part="id,contentDetails", forHandle=HANDLE)["items"][0]
    uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=HOURS)
    vids = []
    for it in yt("playlistItems", auth, part="snippet,contentDetails", playlistId=uploads, maxResults=20).get("items", []):
        pub = it["contentDetails"].get("videoPublishedAt") or it["snippet"]["publishedAt"]
        if dt.datetime.fromisoformat(pub.replace("Z", "+00:00")) >= since:
            vids.append({"id": it["contentDetails"]["videoId"], "title": it["snippet"]["title"], "published": pub})
    scripts = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(SCRIPTS.glob("*.json"))]
    scripts = [s for s in scripts if s.get("delivered")]
    posted = 0
    for v in vids:
        if v["id"] in log or posted >= MAX_PER_RUN:
            continue
        mine = yt("commentThreads", auth, part="snippet", videoId=v["id"], maxResults=50, order="time")
        if any((t["snippet"]["topLevelComment"]["snippet"].get("authorChannelId") or {}).get("value") == ch["id"]
               for t in mine.get("items", [])):
            log[v["id"]] = {"skipped": "channel already commented", "at": dt.datetime.now(dt.timezone.utc).isoformat()}
            continue
        s = match(v, scripts)
        text = comment_text(s or {})
        print(f"[first comment] {v['id']} {v['title'][:60]!r} -> {(s or {}).get('id', '?')}: {text}")
        if dry:
            continue
        try:
            res = _post(YT + "commentThreads?part=snippet", {"snippet": {"videoId": v["id"], "topLevelComment": {
                "snippet": {"textOriginal": text}}}}, auth)
            log[v["id"]] = {"script": (s or {}).get("id"), "comment": res.get("id"), "text": text,
                            "at": dt.datetime.now(dt.timezone.utc).isoformat()}
            posted += 1
        except Exception as e:  # noqa: BLE001  try again next run
            body = getattr(e, "read", lambda: b"")()[:300]
            print(f"::warning title=first comment::{v['id']}: {e!r} {body!r}"[:400])
    if not dry:
        LOG.write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"::notice title=first comment::{len(vids)} new videos, commented on {posted}{' (dry run)' if dry else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
