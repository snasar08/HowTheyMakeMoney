"""Check what's actually scheduled in Buffer and remove double posts.

  python -m pipeline.slot_audit            # report only (read-only Buffer queries)
  python -m pipeline.slot_audit --fix      # delete extras in Buffer, put their scripts back to ready

Source of truth: the delivered records the nightly commits (script -> Buffer post id + slot),
each checked live with Buffer's post(id) query. Extras = a second post in the same slot, or more
than MAX_PER_DAY on one day; the earliest-rendered post in a slot is kept. Writes
out/slot-audit.json.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

from . import publish as P

ROOT = Path(__file__).resolve().parent.parent


def main(argv: list[str]) -> int:
    fix = "--fix" in argv
    now = dt.datetime.now(P.TZ)
    rows = []
    for p in sorted((ROOT / "content" / "scripts").glob("*.json")):
        s = json.loads(p.read_text(encoding="utf-8"))
        d = s.get("delivered") or {}
        if not d.get("post_at") or d.get("mode") != "buffer":
            continue
        when = dt.datetime.fromisoformat(d["post_at"]).astimezone(P.TZ)
        if when < now - dt.timedelta(hours=1):
            continue  # already posted
        live = {}
        if d.get("buffer_post"):
            try:
                live = P.buffer_post(d["buffer_post"]) or {}
            except Exception as exc:  # noqa: BLE001
                live = {"status": f"lookup failed: {exc}"[:80]}
        rows.append(dict(path=p, id=s["id"], when=when, post=d.get("buffer_post"), status=live.get("status"),
                         rendered=d.get("rendered_at", "")))
    rows.sort(key=lambda r: (r["when"], r["rendered"]))
    keep, extra, per_day = set(), [], {}
    for r in rows:
        if r["status"] in (None, "deleted") and r["post"]:
            continue
        day = r["when"].date()
        if r["when"] in keep or per_day.get(day, 0) >= P.MAX_PER_DAY:
            extra.append(r)
            continue
        keep.add(r["when"])
        per_day[day] = per_day.get(day, 0) + 1
    report = []
    for r in rows:
        tag = "EXTRA" if r in extra else "ok"
        line = f"{r['when']:%a %b %d %H:%M} ET  {r['id']}  post {r['post']}  status {r['status']}  {tag}"
        print(line)
        report.append(line)
    if fix:
        for r in extra:
            if r["post"]:
                P.buffer_delete(r["post"])
                print(f"[audit] deleted Buffer post {r['post']} ({r['id']} at {r['when']:%a %H:%M})")
            s = json.loads(r["path"].read_text(encoding="utf-8"))
            s.pop("delivered", None)
            s["status"] = "ready"
            r["path"].write_text(json.dumps(s, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"[audit] {r['id']} is ready again")
    out = ROOT / "out"
    out.mkdir(exist_ok=True)
    (out / "slot-audit.json").write_text(json.dumps({"at": now.isoformat(), "fix": fix, "lines": report,
                                                     "extras": [r["id"] for r in extra]}, indent=2))
    print(f"[audit] {len(rows)} upcoming, {len(extra)} extra{' (removed)' if fix else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
