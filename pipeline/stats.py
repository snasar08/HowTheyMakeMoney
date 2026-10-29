"""Daily performance snapshots, so the script writer learns what works.

Reads PUBLIC stats (views, likes, comments) for every upload on the channel with the free YouTube
Data API v3 and a plain read-only API key (no sign-in, no audit; 10,000 free units/day, this uses
~5). Each video is matched to its script (title, then posting time) and a dated snapshot is
appended to analytics/stats.json, tagged with the script's format, topic, visual style, theme,
hook style, title style, length and post time. analytics/status.json records the last run.

  YT_API_KEY=... python -m pipeline.stats
Without YT_API_KEY it records "no key" in analytics/status.json and exits 0.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "analytics"
HANDLE = os.environ.get("YT_HANDLE", "@HowTheyMakeMoneyDaily")
API = "https://www.googleapis.com/youtube/v3/"


def get(path: str, **params) -> dict:
    params["key"] = os.environ["YT_API_KEY"]
    with urllib.request.urlopen(API + path + "?" + urllib.parse.urlencode(params), timeout=30) as r:
        return json.load(r)


def norm(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.lower())


def hook_style(first: str) -> str:
    f = first.strip().lower()
    if f.startswith("what if"):
        return "whatif"
    if "?" in f[:160]:
        return "question"
    if re.search(r"\d", f[:60]):
        return "number"
    return "statement"


def title_style(title: str) -> str:
    t = title.strip().lower()
    if t.startswith("what if"):
        return "whatif"
    if t.endswith("?"):
        return "question"
    if re.search(r"\d", t):
        return "number"
    return "statement"


def tags_for(s: dict) -> dict:
    d = s.get("delivered") or {}
    first = s["scenes"][0]["narration"] if s.get("scenes") else ""
    post = d.get("post_at")
    secs = d.get("seconds")
    return {
        "script": s["id"], "slug": s.get("slug"), "topic": s.get("company"), "format": s.get("format", "how"),
        "visual_style": s.get("visual_style", "charts3d"), "theme": s.get("theme"),
        "hook_style": s.get("hook_style") or hook_style(first), "title_style": s.get("title_style") or title_style(s["title"]),
        "length_s": secs, "length_bucket": None if not secs else ("<30" if secs < 30 else "30-38" if secs < 38 else "38+"),
        "post_at": post, "post_slot": post[11:16] if post else None, "score": s.get("score"),
    }


def status(**kw):
    OUT.mkdir(exist_ok=True)
    (OUT / "status.json").write_text(json.dumps({"at": dt.datetime.now(dt.timezone.utc).isoformat(), **kw}, indent=2) + "\n")


def main() -> int:
    if not os.environ.get("YT_API_KEY"):
        print("[stats] YT_API_KEY not set; skipping")
        status(ok=False, reason="no YT_API_KEY secret")
        return 0
    try:
        ch = get("channels", part="contentDetails,statistics", forHandle=HANDLE)["items"][0]
    except Exception as exc:  # bad key, API not enabled, quota
        print(f"::warning::[stats] YouTube API call failed: {exc}")
        status(ok=False, reason=f"API call failed: {str(exc)[:200]}")
        return 0
    uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    vids, token = [], None
    while True:
        page = get("playlistItems", part="contentDetails", playlistId=uploads, maxResults=50,
                   **({"pageToken": token} if token else {}))
        vids += [i["contentDetails"]["videoId"] for i in page["items"]]
        token = page.get("nextPageToken")
        if not token:
            break
    scripts = [json.loads(p.read_text(encoding="utf-8")) for p in (ROOT / "content" / "scripts").glob("*.json")]
    by_title = {norm(s["title"]): s for s in scripts}
    path = OUT / "stats.json"
    db = json.loads(path.read_text()) if path.exists() else {"videos": {}}
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    for k in range(0, len(vids), 50):
        for v in get("videos", part="snippet,statistics,contentDetails", id=",".join(vids[k:k + 50]))["items"]:
            st, sn = v["statistics"], v["snippet"]
            s = by_title.get(norm(sn["title"]))
            if s is None:  # title edited on YouTube: fall back to the closest posting time (±3 h)
                pub = dt.datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00"))
                best = min((x for x in scripts if (x.get("delivered") or {}).get("post_at")),
                           key=lambda x: abs((dt.datetime.fromisoformat(x["delivered"]["post_at"]) - pub).total_seconds()),
                           default=None)
                if best and abs((dt.datetime.fromisoformat(best["delivered"]["post_at"]) - pub).total_seconds()) < 3 * 3600:
                    s = best
            row = db["videos"].setdefault(v["id"], {"title": sn["title"], "published": sn["publishedAt"], "snapshots": []})
            row["title"] = sn["title"]
            if s:
                row["tags"] = tags_for(s)
            row["snapshots"].append({"t": now, "views": int(st.get("viewCount", 0)),
                                     "likes": int(st.get("likeCount", 0)), "comments": int(st.get("commentCount", 0))})
    db["updated"] = now
    db["subscribers"] = int(ch["statistics"].get("subscriberCount", 0))
    OUT.mkdir(exist_ok=True)
    path.write_text(json.dumps(db, indent=1) + "\n")
    status(ok=True, videos=len(db["videos"]), subscribers=db["subscribers"])
    print(f"[stats] {len(db['videos'])} videos, {db['subscribers']} subscribers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
