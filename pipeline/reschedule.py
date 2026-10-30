"""Schedule on Buffer a Short that fell back to a GitHub Release (Buffer failed at delivery).
  python -m pipeline.reschedule 030
Uses the existing release asset and the script's delivered.post_at (or the next free slot if that
time has passed), then records the Buffer post on the script.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

from . import publish as P

ROOT = Path(__file__).resolve().parent.parent


def main(ids: list[str]) -> int:
    for sid in ids:
        path = next((ROOT / "content" / "scripts").glob(f"{sid}*.json"))
        s = json.loads(path.read_text(encoding="utf-8"))
        d = s.get("delivered") or {}
        if d.get("mode") == "buffer":
            print(f"[reschedule] {sid} is already on Buffer ({d.get('buffer_post')})")
            continue
        url = d["asset_url"]
        when = dt.datetime.fromisoformat(d["post_at"]).astimezone(P.TZ)
        if when <= dt.datetime.now(P.TZ) + dt.timedelta(minutes=10):
            raise SystemExit(f"{sid}: its slot {when} has passed; pick a new time")
        if not P.public_ok(url):
            raise SystemExit(f"{sid}: asset still not public: {url}")
        post = P.buffer_schedule(url, s, when)
        check = P.buffer_post(post["id"])
        s["delivered"] = {**d, "mode": "buffer", "buffer_post": post["id"], "buffer_status": check.get("status")}
        path.write_text(json.dumps(s, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"[reschedule] {sid} scheduled for {when:%a %H:%M %Z}: post {post['id']} status={check.get('status')}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
