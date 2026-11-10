"""Daily audience retention: where viewers swipe away on each recent Short.

Runs after pipeline.stats (stats.yml). Needs the owner sign-in from pipeline/analytics_auth.py,
stored as secrets YTA_CLIENT_ID / YTA_CLIENT_SECRET / YTA_REFRESH_TOKEN (read-only YouTube
Analytics API, free). Without them it prints a note and exits 0.

For every Short posted in the last DAYS days: average % watched, average seconds watched, the
share of viewers still watching at the start / 25% / 50% / 75% / end, and the steepest drop
(the moment most people leave, in seconds). Writes analytics/retention.json and
analytics/retention.md. YouTube only returns a curve once a video has enough views.

  python -m pipeline.retention
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "analytics"
DAYS = 14
API = "https://youtubeanalytics.googleapis.com/v2/reports?"


def _creds() -> dict | None:
    v = {k: os.environ.get(k) for k in ("YTA_CLIENT_ID", "YTA_CLIENT_SECRET", "YTA_REFRESH_TOKEN")}
    if all(v.values()):
        return v
    f = ROOT / "client_secret_values.json"  # local runs on Sam's PC (git-ignored)
    return json.loads(f.read_text()) if f.exists() else None


def _token(v: dict) -> str:
    body = urllib.parse.urlencode({"client_id": v["YTA_CLIENT_ID"], "client_secret": v["YTA_CLIENT_SECRET"],
                                   "refresh_token": v["YTA_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()
    with urllib.request.urlopen("https://oauth2.googleapis.com/token", body, timeout=30) as r:
        return json.load(r)["access_token"]


def _report(tok: str, **q) -> list:
    req = urllib.request.Request(API + urllib.parse.urlencode({"ids": "channel==MINE", **q}),
                                 headers={"Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("rows", [])


def main() -> int:
    v = _creds()
    if not v:
        print("[retention] no YTA_* secrets yet; skipping (see pipeline/analytics_auth.py)")
        return 0
    stats = OUT / "stats.json"
    if not stats.exists():
        print("[retention] no analytics/stats.json yet; skipping")
        return 0
    try:
        tok = _token(v)
    except Exception as exc:
        print(f"::warning::[retention] sign-in failed (token revoked or expired?): {exc}")
        return 0
    db = json.loads(stats.read_text())
    now = dt.datetime.now(dt.timezone.utc)
    start, end = (now - dt.timedelta(days=DAYS + 30)).date().isoformat(), now.date().isoformat()
    rows = []
    for vid, x in db["videos"].items():
        pub = dt.datetime.fromisoformat(x["published"].replace("Z", "+00:00"))
        if (now - pub).days > DAYS:
            continue
        try:
            tot = _report(tok, startDate=start, endDate=end, filters=f"video=={vid}",
                          metrics="views,averageViewPercentage,averageViewDuration")
            curve = _report(tok, startDate=start, endDate=end, filters=f"video=={vid}",
                            metrics="audienceWatchRatio", dimensions="elapsedVideoTimeRatio")
        except urllib.error.HTTPError as exc:
            print(f"::warning::[retention] {vid}: HTTP {exc.code}")
            continue
        if not tot:
            continue
        views, pct, secs = tot[0]
        row = {"video": vid, "title": x["title"], "views": int(views), "avg_pct": round(pct, 1),
               "avg_seconds": int(secs), "tags": x.get("tags", {})}
        length = (x.get("tags") or {}).get("seconds") or (secs / pct * 100 if pct else 0)
        if len(curve) >= 50:
            c = {round(r[0], 2): r[1] for r in curve}
            at = lambda q: round(100 * c.get(q, 0))  # noqa: E731
            row.update(start=at(0.01), q25=at(0.25), q50=at(0.50), q75=at(0.75), end=at(1.0))
            pts = sorted(c)
            # steepest 5% window after the opening (the first points are replays, often > 100%)
            drop = max(((c[pts[i]] - c[pts[i + 5]], pts[i]) for i in range(2, len(pts) - 5)), default=(0, 0))
            row.update(drop_at_pct=round(100 * drop[1]), drop_at_s=round(drop[1] * float(length), 1),
                       drop_size=round(100 * drop[0]))
        rows.append(row)
    rows.sort(key=lambda r: -r["views"])
    OUT.mkdir(exist_ok=True)
    (OUT / "retention.json").write_text(json.dumps({"at": now.isoformat(), "shorts": rows}, indent=1) + "\n")
    lines = [f"# Retention, {now:%Y-%m-%d %H:%M} UTC", "",
             f"Shorts from the last {DAYS} days, most viewed first. 'Still watching' is the share of viewers at "
             "that point of the video (over 100% at the start means replays). 'Biggest drop' is where the most "
             "viewers leave in one 5% stretch.", "",
             "| Title | Views | Avg watched | Start | 25% | 50% | 75% | End | Biggest drop |",
             "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        if "q50" in r:
            lines.append(f"| {r['title']} | {r['views']} | {r['avg_pct']}% ({r['avg_seconds']} s) | {r['start']}% | "
                         f"{r['q25']}% | {r['q50']}% | {r['q75']}% | {r['end']}% | "
                         f"-{r['drop_size']} pts at {r['drop_at_s']} s |")
        else:
            lines.append(f"| {r['title']} | {r['views']} | {r['avg_pct']}% ({r['avg_seconds']} s) | "
                         "not enough views for a curve | | | | | |")
    (OUT / "retention.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:14]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
