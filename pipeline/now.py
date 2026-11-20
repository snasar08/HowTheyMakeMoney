"""How are the Shorts doing right now? (Sam, Nov 13: "pull how the shorts are doing at any moment")

  python -m pipeline.now            # ask GitHub for fresh numbers, wait, pull, print the table
  python -m pipeline.now --no-pull  # just print the table from the numbers already here

The YouTube key lives only in GitHub's secrets, so this asks stats.yml to run (a push to branch
stats-run: a merge commit of main, always a fast-forward, never a force push), waits for its
"Stats" commit on main (about 1-3 minutes; longer if a nightly run is busy), pulls, and prints
every Short from the last DAYS days (default 7), fastest first, with the change since the last pull.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ID = {"GIT_AUTHOR_NAME": "Claude", "GIT_AUTHOR_EMAIL": "noreply@anthropic.com",
      "GIT_COMMITTER_NAME": "Claude", "GIT_COMMITTER_EMAIL": "noreply@anthropic.com"}


def git(*a: str) -> str:
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, env={**os.environ, **ID}).stdout.strip()


def refresh(wait_s: int = 600) -> bool:
    git("fetch", "-q", "origin", "main", "stats-run")
    before = git("log", "-1", "--format=%H", "origin/main", "--", "analytics/stats.json")
    parents = ["-p", "origin/main"] + (["-p", "origin/stats-run"] if git("rev-parse", "--verify", "-q", "origin/stats-run") else [])
    c = git("commit-tree", git("rev-parse", "origin/main^{tree}"), *parents, "-m", "Stats now")
    subprocess.run(["git", "push", "-q", "origin", f"{c}:refs/heads/stats-run"], cwd=ROOT, check=True)
    print("[now] asked GitHub for fresh numbers; waiting...", flush=True)
    t0 = time.time()
    while time.time() - t0 < wait_s:
        time.sleep(20)
        git("fetch", "-q", "origin", "main")
        if git("log", "-1", "--format=%H", "origin/main", "--", "analytics/stats.json") != before:
            git("pull", "-q", "--rebase", "origin", "main")
            return True
    print("[now] no fresh numbers yet (GitHub is busy); showing the last pull", flush=True)
    return False


def table(days: float = 7) -> str:
    s = json.loads((ROOT / "analytics" / "stats.json").read_text(encoding="utf-8"))
    rows, now = [], None
    for v in s["videos"].values():
        sn = v["snapshots"]
        t = dt.datetime.fromisoformat(sn[-1]["t"])
        now = max(now or t, t)
        age = (t - dt.datetime.fromisoformat(v["published"].replace("Z", "+00:00"))).total_seconds() / 3600
        if age > days * 24:
            continue
        prev = sn[-2] if len(sn) > 1 else None
        gain = ""
        if prev:
            h = max((t - dt.datetime.fromisoformat(prev["t"])).total_seconds() / 3600, 0.01)
            gain = f"+{sn[-1]['views'] - prev['views']} in {h:.0f} h"
        g = v.get("tags", {})
        rows.append((sn[-1]["views"] / max(age, 1), g.get("script", "?"), v["title"][:44], f"{age:.0f} h", sn[-1]["views"],
                     gain, sn[-1]["likes"], sn[-1]["comments"], g.get("format", ""), g.get("visual_style", ""),
                     g.get("hook_style", ""), g.get("length_s", "")))
    rows.sort(reverse=True)
    out = [f"Numbers from {now:%b %d %H:%M} UTC. Subscribers: {s.get('subscribers', '?')}. Shorts from the last {days:g} days, fastest first.",
           "", "| # | Title | Age | Views | Views/h | Since last pull | Likes | Comments | Format | Look | Hook | Length |",
           "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        out.append(f"| {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[0]:.1f} | {r[5]} | {r[6]} | {r[7]} | {r[8]} | {r[9]} | {r[10]} | {r[11]} s |")
    return "\n".join(out)


if __name__ == "__main__":
    if "--no-pull" not in sys.argv:
        refresh()
    days = next((float(a) for a in sys.argv[1:] if a.replace(".", "").isdigit()), 7)
    print(table(days))
