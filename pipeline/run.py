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

from .publish import HORIZON_H, POST_START, deliver, posting_started, publish_slots, taken_slots
from .render import render_script

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "content" / "scripts"
OUT = ROOT / "out"


FORMATS = ("how", "whatif", "careers", "famous")
WEIGHTS = ROOT / "analytics" / "format_weights.json"  # written by pipeline/insights.py


def _weights() -> dict:
    try:
        return json.loads(WEIGHTS.read_text())
    except Exception:  # no data yet: all formats equal
        return {}


def ready_scripts(recent: list[str] | None = None) -> list[Path]:
    """Ready scripts in posting order. Priority = virality `score` × the format's performance
    weight (analytics/format_weights.json, 1.0 until there's enough data); then greedily pick so
    the format differs from the previous post (formats alternate day to day)."""
    items = []
    w = _weights()
    for p in sorted(SCRIPTS.glob("*.json")):
        try:
            s = json.loads(p.read_text(encoding="utf-8"))
            if s.get("status") == "ready":
                fmt = s.get("format", "how")
                items.append([float(s.get("score", 0)) * float(w.get(fmt, 1.0)), p.name, p, fmt,
                              s.get("visual_style", "charts3d")])
        except json.JSONDecodeError:
            print(f"[run] skipping invalid JSON: {p.name}")
    items.sort(key=lambda x: (-x[0], x[1]))
    last = (recent or [(None, None)])[-1]
    out = []
    while items:  # differ from the previous post in format AND look if possible, else format only
        pick = (next((it for it in items if it[3] != last[0] and it[4] != last[1]), None)
                or next((it for it in items if it[3] != last[0]), items[0]))
        items.remove(pick)
        out.append(pick[2])
        last = (pick[3], pick[4])
    return out


def recent_formats(n: int = 2) -> list[tuple[str, str]]:
    """(format, visual_style) of the last n scheduled posts (to alternate against)."""
    rows = []
    for p in SCRIPTS.glob("*.json"):
        s = json.loads(p.read_text(encoding="utf-8"))
        if (s.get("delivered") or {}).get("post_at"):
            rows.append((s["delivered"]["post_at"], (s.get("format", "how"), s.get("visual_style", "charts3d"))))
    return [f for _, f in sorted(rows)[-n:]]


GATE_CLARITY = float(os.environ.get("GATE_CLARITY", "0.90"))


def gate(script: dict, info: dict) -> list[str]:
    """Hard quality bar before anything is posted. A failing Short is marked needs_fix
    (the weekly writer repairs it) instead of going out."""
    from .zone_check import script_overlaps

    out = []
    if info.get("clarity") is not None and info["clarity"] < GATE_CLARITY:
        out.append(f"clarity {info['clarity']:.0%} < {GATE_CLARITY:.0%}: {', '.join(info.get('unclear_words', [])[:6])}")
    if (info.get("longest_breath") or 0) > 8:
        out.append(f"one-breath run of {info['longest_breath']}s")
    if (info.get("clipped_pct") or 0) > 0.05:
        out.append(f"audio clipping {info['clipped_pct']}%")
    if not info.get("timed_words"):
        out.append("captions not timed to the voice")
    want = {k for k, v in script.get("images", {}).items() if (v or {}).get("url")}
    if missing := sorted(want - set(info.get("images_ok", []))):
        out.append(f"images failed to load: {', '.join(missing)}")
    out += [f"chart covers captions ({p})" for p in script_overlaps(script)]
    return out


def contact_sheet(video: Path, times: list[float], out: Path):
    """Real frames from the finished MP4, side by side (for quick review)."""
    import subprocess
    import tempfile

    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        frames = []
        for i, t in enumerate(times):
            f = Path(tmp) / f"{i}.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(video),
                            "-frames:v", "1", "-vf", "scale=360:640", str(f)], check=True)
            frames.append(f)
        inputs = sum((["-i", str(f)] for f in frames), [])
        subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex",
                        f"hstack=inputs={len(frames)}", "-q:v", "4", str(out)], check=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=int(os.environ.get("SHORTS_PER_RUN", "2")))
    ap.add_argument("--id", default=None)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    if not args.dry and not args.id and not posting_started():
        print(f"[run] posting starts {POST_START} (New York); nothing to do yet")
        return 0

    queue = ready_scripts(recent_formats())
    if args.id:
        queue = [p for p in SCRIPTS.glob(f"{args.id}*.json")]
    # only as many Shorts as there are open slots soon (no double posts, max 2/day); a second
    # run the same day (backup cron or a manual run) finds the slots taken and does nothing
    taken = taken_slots([json.loads(p.read_text(encoding="utf-8")) for p in SCRIPTS.glob("*.json")])
    want = min(args.count, len(queue))
    slots = publish_slots(want, taken=taken, horizon_h=None if (args.id or args.dry) else HORIZON_H)
    upcoming = sorted(t for t in taken if t > dt.datetime.now(slots[0].tzinfo if slots else dt.timezone.utc))
    print(f"[run] already scheduled: {[f'{t:%a %d %H:%M} ({taken[t]})' for t in upcoming]}")
    print(f"[run] open slots to fill: {[f'{t:%a %d %H:%M}' for t in slots]}")
    if not args.dry and not slots:
        print("[run] every slot in the next hours already has a post; nothing to do")
        return 0
    queue = queue[: len(slots)] if not args.dry else queue[: args.count]
    left = len(ready_scripts()) - len(queue)
    print(f"[run] rendering {len(queue)} script(s); {left} ready after this run")
    if not queue:
        print("[run] queue is empty — the weekly script writer needs to add more")
        return 1
    if args.dry:
        slots = publish_slots(len(queue), taken=taken)
    # scripts that fail the quality gate are skipped, and the next ready one takes their slot
    spares = [p for p in ready_scripts() if p not in queue] if not (args.id or args.dry) else []
    failures = 0
    jobs = list(zip(queue, slots))
    while jobs:
        path, when = jobs.pop(0)
        script = json.loads(path.read_text())
        video = OUT / f"{path.stem}.mp4"
        try:
            info = render_script(path, video)
            print(f"[run] rendered {video.name}: {info['seconds']}s")
            print(f"::notice title={path.stem}::{json.dumps({k: v for k, v in info.items() if k not in ('path', 'audio_issues', 'heard')})}")
            for issue in info.get("audio_issues", []):
                print(f"::warning title={path.stem} audio::{issue}")
            if not info.get("audio_issues"):
                print(f"[check] {path.stem}: audio OK (longest breath {info.get('longest_breath')}s)")
            elif os.environ.get("AUDIO_CHECK") == "strict" and not args.dry:
                raise RuntimeError(f"audio check failed: {len(info['audio_issues'])} issue(s)")
            blockers = gate(script, info)
            if blockers and not args.dry:
                script["status"] = "needs_fix"
                script["needs_fix"] = blockers
                path.write_text(json.dumps(script, indent=2, ensure_ascii=False) + "\n")
                print(f"::error title={path.stem} blocked::not posted — {'; '.join(blockers)}")
                if spares:
                    jobs.append((spares.pop(0), when))
                continue
            for b in blockers:
                print(f"::warning title={path.stem} gate::{b}")
            if args.dry:
                contact_sheet(video, info["scene_mids"], ROOT / "previews" / f"{path.stem}.jpg")
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
