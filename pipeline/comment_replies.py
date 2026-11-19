"""Saturday comment replies (Sam, Nov 18: "answer every comment of the week, 1-10 words, sounds human; more than 100
comments -> only the top 100"). Buffer's API has no comment calls, so this uses the YouTube Data API directly.

  python -m pipeline.comment_replies            # reply (needs YTC_CLIENT_ID / YTC_CLIENT_SECRET / YTC_REFRESH_TOKEN)
  COMMENT_DRY=1 python -m pipeline.comment_replies   # read + write the replies, post nothing (YT_API_KEY is enough)

Steps: the channel's comments from the last 7 days (newest first, stop at 7 days) -> drop the channel's own comments,
threads the channel already answered, ids in analytics/comment_replies.json, links / spam -> top 100 by likes (then
newest) -> ONE free Gemini text call writes all replies (JSON: id -> reply or "SKIP" for rude / unclear / unsafe)
-> each reply is checked (1-10 words, no digits, no links, no @, kid-safe, no two the same) -> posted with
comments.insert (50 quota units each: 100 replies = 5,000 of the free 10,000 a day) -> log in analytics/comment_replies.json.
Never raises on a missing secret: prints a notice and exits 0.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "analytics" / "comment_replies.json"
YT = "https://www.googleapis.com/youtube/v3/"
GEM = "https://generativelanguage.googleapis.com/v1beta"
MODELS = [m for m in os.environ.get("REPLY_MODELS", "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-2.5-flash-lite").split(",") if m]
HANDLE = "@HowTheyMakeMoneyDaily"
TOP, DAYS, MAXW = 100, 7, 10
SPAM_RX = re.compile(r"https?://|www\.|\.com\b|sub ?4 ?sub|check (out )?my|telegram|whats ?app|crypto|giveaway|onlyfans", re.I)
BAD_RX = re.compile(r"\b(kill\w*|die|dies|dead|hate\w*|stupid|idiot\w*|dumb|sex\w*|porn\w*|drugs?|weed|guns?|f+u+c+k\w*|shit\w*|bitch\w*|damn|hell|ass|asses)\b", re.I)


def _get(url: str, headers: dict | None = None) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=60) as r:
        return json.loads(r.read())


def _post(url: str, body: dict, headers: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def token() -> str | None:
    """An access token from the comment login (scope youtube.force-ssl), or None when it is not set up."""
    cid, sec, ref = (os.environ.get(k, "") for k in ("YTC_CLIENT_ID", "YTC_CLIENT_SECRET", "YTC_REFRESH_TOKEN"))
    if not (cid and sec and ref):
        return None
    data = urllib.parse.urlencode({"client_id": cid, "client_secret": sec, "refresh_token": ref,
                                   "grant_type": "refresh_token"}).encode()
    with urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=data), timeout=60) as r:
        return json.loads(r.read())["access_token"]


def yt(path: str, auth: dict, **q) -> dict:
    if "Authorization" not in auth:
        q["key"] = os.environ["YT_API_KEY"]
    return _get(YT + path + "?" + urllib.parse.urlencode(q), auth)


def week_comments(auth: dict) -> tuple[str, list[dict]]:
    ch = yt("channels", auth, part="id", forHandle=HANDLE)["items"][0]["id"]
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=DAYS)
    out, page, titles = [], None, {}
    for _ in range(40):                                   # <= 4,000 threads, 1 unit per page
        q = dict(part="snippet,replies", allThreadsRelatedToChannelId=ch, maxResults=100, order="time", textFormat="plainText")
        if page:
            q["pageToken"] = page
        res = yt("commentThreads", auth, **q)
        old = False
        for th in res.get("items", []):
            top = th["snippet"]["topLevelComment"]
            sn = top["snippet"]
            when = dt.datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00"))
            if when < since:
                old = True
                continue
            replies = (th.get("replies") or {}).get("comments", [])
            out.append({"id": top["id"], "video": sn.get("videoId", ""), "text": sn.get("textOriginal") or sn.get("textDisplay", ""),
                        "likes": int(sn.get("likeCount", 0)), "when": sn["publishedAt"],
                        "author": (sn.get("authorChannelId") or {}).get("value", ""),
                        "answered": any((r["snippet"].get("authorChannelId") or {}).get("value") == ch for r in replies)})
        page = res.get("nextPageToken")
        if old or not page:
            break
    vids = sorted({c["video"] for c in out if c["video"]})
    for i in range(0, len(vids), 50):
        for v in yt("videos", auth, part="snippet", id=",".join(vids[i:i + 50])).get("items", []):
            titles[v["id"]] = v["snippet"]["title"]
    for c in out:
        c["title"] = titles.get(c["video"], "")
    return ch, out


def pick(ch: str, comments: list[dict], done: set) -> list[dict]:
    keep = [c for c in comments if c["author"] != ch and not c["answered"] and c["id"] not in done
            and c["text"].strip() and not SPAM_RX.search(c["text"]) and len(c["text"]) < 600]
    keep = sorted(keep, key=lambda c: (c["likes"], c["when"]), reverse=True)
    return keep[:TOP]


PROMPT = """You run the YouTube Shorts channel "How They Make Money" (fast cartoon stories about how famous people
and companies make their money; many viewers are kids and teens). Reply to each viewer comment below as the creator.

Rules for every reply:
- 1 to 10 words. Casual and warm, like a real person typing fast on a phone. Lowercase is fine.
- Answer what they said (agree, joke back, thank them, or answer a "who next?" with "good pick, noted").
- No numbers or digits, no facts or claims, no money advice, no links, no @mentions, no hashtags.
- At most one emoji, and not on every reply. Every reply different; never start two the same way.
- Kid-safe. Never argue, never insult, never mention politics or religion.
- Reply "SKIP" for a comment that is rude, hateful, sexual, spam, a scam, sad/personal trouble, or makes no sense.

Return JSON only: {"replies": {"<id>": "<reply or SKIP>", ...}} with every id.

Comments (id, the Short's title, the comment):
"""


def write_replies(batch: list[dict]) -> dict:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key or not batch:
        return {}
    lines = "\n".join(json.dumps({"id": c["id"], "short": c["title"][:80], "comment": c["text"][:300]}, ensure_ascii=False) for c in batch)
    body = {"contents": [{"parts": [{"text": PROMPT + lines}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.9}}
    for m in MODELS:
        try:
            res = _post(f"{GEM}/models/{m}:generateContent", body, {"x-goog-api-key": key})
            text = "".join(p.get("text", "") for c in res.get("candidates", []) for p in c.get("content", {}).get("parts", []))
            out = json.loads(text[text.find("{"):text.rfind("}") + 1]).get("replies", {})
            print(f"[comments] {len(out)} replies written by {m}")
            return out
        except Exception as e:  # noqa: BLE001  try the next free model
            print(f"::warning title=comment replies::{m}: {e!r}"[:300])
    return {}


def clean(reply: str, used: set) -> str | None:
    r = re.sub(r"\s+", " ", str(reply or "")).strip().strip('"')
    if not r or r.upper().startswith("SKIP"):
        return None
    if re.search(r"\d|https?:|www\.|@|#", r) or BAD_RX.search(r):
        return None
    if not 1 <= len(r.split()) <= MAXW or len(r) > 90:
        return None
    k = re.sub(r"\W", "", r.lower())
    if k in used:
        return None
    used.add(k)
    return r


def main() -> int:
    dry = os.environ.get("COMMENT_DRY", "") not in ("", "0")
    try:
        tok = token()
    except Exception as e:  # noqa: BLE001
        print(f"::warning title=comment replies::comment login failed: {e!r}"[:300])
        tok = None
    if not tok and not dry:
        print("::notice title=comment replies::not set up yet (YTC_CLIENT_ID / YTC_CLIENT_SECRET / YTC_REFRESH_TOKEN secrets) - nothing posted")
        return 0
    if not tok and not os.environ.get("YT_API_KEY"):
        print("::notice title=comment replies::no YouTube access - nothing to do")
        return 0
    auth = {"Authorization": f"Bearer {tok}"} if tok else {}
    log = json.loads(LOG.read_text()) if LOG.exists() else {"replied": {}}
    done = set(log.get("replied", {}))
    ch, comments = week_comments(auth)
    batch = pick(ch, comments, done)
    print(f"[comments] {len(comments)} comments in the last {DAYS} days, {len(batch)} to answer (top {TOP} by likes)")
    drafts = {}
    for i in range(0, len(batch), 50):                     # 2 Gemini calls at most
        drafts.update(write_replies(batch[i:i + 50]))
    used: set = set()
    posted = skipped = failed = 0
    for c in batch:
        r = clean(drafts.get(c["id"], ""), used)
        if not r:
            skipped += 1
            continue
        print(f"  [{c['likes']} likes] {c['text'][:70]!r} -> {r!r}")
        if dry:
            continue
        try:
            _post(YT + "comments?part=snippet", {"snippet": {"parentId": c["id"], "textOriginal": r}}, auth)
            log["replied"][c["id"]] = {"reply": r, "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "video": c["video"]}
            posted += 1
        except urllib.error.HTTPError as e:
            failed += 1
            msg = e.read()[:200]
            print(f"::warning title=comment replies::{c['id']}: HTTP {e.code} {msg!r}")
            if e.code in (401, 403) and failed >= 3:
                break                                      # quota / permission: stop, the rest waits a week
    if not dry:
        cut = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=60)).isoformat()
        log["replied"] = {k: v for k, v in log["replied"].items() if v.get("at", "") >= cut}   # keep 60 days
        log["last_run"] = {"at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "comments": len(comments),
                           "answered": posted, "skipped": skipped, "failed": failed}
        LOG.parent.mkdir(exist_ok=True)
        LOG.write_text(json.dumps(log, indent=1, ensure_ascii=False) + "\n")
    print(f"::notice title=comment replies::{'DRY RUN: ' if dry else ''}{len(comments)} comments this week, "
          f"{'would answer' if dry else 'answered'} {len(batch) - skipped if dry else posted}, skipped {skipped}, failed {failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
