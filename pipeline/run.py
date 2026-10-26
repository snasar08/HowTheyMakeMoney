"""Nightly entry point: render the next ready scripts and deliver them.

    python -m pipeline.run               # next SHORTS_PER_RUN scripts (default 2)
    python -m pipeline.run --id 001      # one specific script
    python -m pipeline.run --dry         # render only, don't deliver or mark
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import traceback
from pathlib import Path

from .publish import deliver, publish_slots
from .render import render_script

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "content" / "scripts"
OUT = ROOT / "out"


def ready_scripts() -> list[Path]:
    items = []
    for p in sorted(SCRIPTS.glob("*.json")):
        try:
            if json.loads(p.read_text()).get("status") == "ready":
                items.append(p)
        except json.JSONDecodeError:
            print(f"[run] skipping invalid JSON: {p.name}")
    return items


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=int(os.environ.get("SHORTS_PER_RUN", "2")))
    ap.add_argument("--id", default=None)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    queue = ready_scripts()
    if args.id:
        queue = [p for p in SCRIPTS.glob(f"{args.id}*.json")]
    queue = queue[: args.count]
    left = len(ready_scripts()) - len(queue)
    print(f"[run] rendering {len(queue)} script(s); {left} ready after this run")
    if not queue:
        print("[run] queue is empty — the weekly script writer needs to add more")
        return 1

    slots = publish_slots(len(queue))
    failures = 0
    for path, when in zip(queue, slots):
        script = json.loads(path.read_text())
        video = OUT / f"{path.stem}.mp4"
        try:
            info = render_script(path, video)
            print(f"[run] rendered {video.name}: {info['seconds']}s")
            if args.dry:
                continue
            result = deliver(video, script, when)
            script["status"] = "delivered"
            script["delivered"] = {**result, "rendered_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                   "seconds": info["seconds"]}
            path.write_text(json.dumps(script, indent=2, ensure_ascii=False) + "\n")
            print(f"[run] delivered {path.stem}: {result}")
        except Exception:  # keep going; the failed script stays 'ready' for next run
            failures += 1
            traceback.print_exc()
    if left < 6:
        print(f"::warning::Only {left} scripts left in the queue")
    return 1 if failures == len(queue) else 0


if __name__ == "__main__":
    sys.exit(main())
