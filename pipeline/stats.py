"""Weekly performance pull, so the script writer learns what works.

Reads PUBLIC stats (views, likes, comments) for every upload on the channel with the free
YouTube Data API v3 and a plain API key (no sign-in, read-only, 10,000 free units/day; this
uses ~5). Matches videos to scripts by title and writes content/performance.json, sorted by
views. The Saturday writer reads it: more topics/hook styles like the top ones, fewer like the
bottom ones.

  YT_API_KEY=... python -m pipeline.stats
Skips quietly when YT_API_KEY isn't set.
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
HANDLE = os.environ.get("YT_HANDLE", "@HowTheyMakeMoneyDaily")
API = "https://www.googleapis.com/youtube/v3/"


def get(path: str, **params) -> dict:
    params["key"] = os.environ["YT_API_KEY"]
    with urllib.request.urlopen(API + path + "?" + urllib.parse.urlencode(params), timeout=30) as r:
        return json.load(r)


def norm(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.lower())


def main() -> int:
    if not os.environ.get("YT_API_KEY"):
        print("[stats] YT_API_KEY not set; skipping")
        return 0
    ch = get("channels", part="contentDetails,statistics", forHandle=HANDLE)["items"][0]
    uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    vids, token = [], None
    while True:
        page = get("playlistItems", part="contentDetails", playlistId=uploads, maxResults=50,
                   **({"pageToken": token} if token else {}))
        vids += [i["contentDetails"]["videoId"] for i in page["items"]]
        token = page.get("nextPageToken")
        if not token:
            break
    scripts = {}
    for p in (ROOT / "content" / "scripts").glob("*.json"):
        s = json.loads(p.read_text(encoding="utf-8"))
        scripts[norm(s["title"])] = s
    rows = []
    for k in range(0, len(vids), 50):
        for v in get("videos", part="snippet,statistics", id=",".join(vids[k:k + 50]))["items"]:
            st, sn = v["statistics"], v["snippet"]
            s = scripts.get(norm(sn["title"]))
            rows.append({"video_id": v["id"], "title": sn["title"], "published": sn["publishedAt"],
                         "script": s["id"] if s else None, "score": s.get("score") if s else None,
                         "views": int(st.get("viewCount", 0)), "likes": int(st.get("likeCount", 0)),
                         "comments": int(st.get("commentCount", 0))})
    rows.sort(key=lambda r: -r["views"])
    out = {"updated": dt.datetime.now(dt.timezone.utc).isoformat(),
           "subscribers": int(ch["statistics"].get("subscriberCount", 0)), "videos": rows}
    (ROOT / "content" / "performance.json").write_text(json.dumps(out, indent=2) + "\n")
    print(f"[stats] {len(rows)} videos, {out['subscribers']} subscribers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
