"""Is there time for Blender before the next post? Prints minutes until the first open slot.

GitHub often starts the 3 AM run hours late, and a fixed clock cutoff then skipped Blender even
when the next open post was a day away. The nightly compares this number with the worst case for
the remaining jobs, so posting times still never slip.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from . import publish


def minutes_to_first_open(now: dt.datetime | None = None, scripts: list[dict] | None = None) -> int:
    now = now or dt.datetime.now(publish.TZ)
    if scripts is None:
        root = Path(__file__).resolve().parent.parent / "content" / "scripts"
        scripts = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(root.glob("*.json"))]
    first = publish.publish_slots(1, now=now, taken=publish.taken_slots(scripts))[0]
    return int((first - now).total_seconds() // 60)


if __name__ == "__main__":
    print(minutes_to_first_open())
