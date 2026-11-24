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
from .render import NewLookMissing, render_script

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "content" / "scripts"
OUT = ROOT / "out"


FORMATS = ("how", "whatif", "careers", "famous", "story", "pov")
WEIGHTS = ROOT / "analytics" / "format_weights.json"  # written by pipeline/insights.py


LOWPOLY_GAP = 1  # posts between two animated Shorts (Nov 13: animated person stories get 10-100x the views of chart Shorts; was 2, and 5 while the look was empty)


def _weights() -> dict:
    try:
        return json.loads(WEIGHTS.read_text())
    except Exception:  # no data yet: all formats equal
        return {}


SHARE_WINDOW = 6       # posts of history the share rule looks back over
STARTING_WEIGHT = {"pov": 1.0}  # new formats start at a full share (Nov 23) so they post soon without starving the others
MIN_SHARE_WEIGHT = 0.6  # Sam, Nov 22: "every video gets love" - a weak format still gets at least this weight


def ready_scripts(recent: list | None = None) -> list[Path]:
    """Ready scripts in posting order.

    Sam, Nov 22: keep the boost, but share. The boost (analytics/format_weights.json, 1.0 for a
    format with no data, never below MIN_SHARE_WEIGHT) now sets each format's SHARE of posts
    instead of multiplying scores, so a boosted format posts more often but never crowds the
    others out. Each pick goes to the format furthest behind its share (counting the last
    SHARE_WINDOW posts), never the same format twice in a row when another one is ready; inside
    a format the highest `score` goes first (and a different look than the last post if possible)."""
    w = _weights()
    pools: dict[str, list] = {}
    for p in sorted(SCRIPTS.glob("*.json")):
        try:
            s = json.loads(p.read_text(encoding="utf-8"))
            if s.get("status") == "ready":
                pools.setdefault(s.get("format", "how"), []).append(
                    (-float(s.get("score", 0)), p.name, p, s.get("visual_style", "charts3d")))
        except json.JSONDecodeError:
            print(f"[run] skipping invalid JSON: {p.name}")
    for v in pools.values():
        v.sort(key=lambda x: (x[0], x[1]))
    share = {f: max(float(w.get(f, STARTING_WEIGHT.get(f, 1.0))), MIN_SHARE_WEIGHT) for f in pools}
    hist = list(recent if recent is not None else recent_formats(SHARE_WINDOW))[-SHARE_WINDOW:]
    out = []
    while any(pools.values()):
        live = [f for f, v in pools.items() if v]
        total = sum(share[f] for f in live)
        n = len(hist) + 1
        last_fmt, last_look = hist[-1] if hist else (None, None)

        def behind(f):  # how far this format is behind its fair share of the next n posts
            return share[f] / total * n - sum(1 for x, _ in hist if x == f)

        cands = [f for f in live if f != last_fmt] or live
        fmt = max(cands, key=lambda f: (behind(f), share[f], -pools[f][0][0]))
        pool = pools[fmt]
        it = next((x for x in pool if x[3] != last_look), pool[0])
        pool.remove(it)
        out.append(it[2])
        hist = (hist + [(fmt, it[3])])[-SHARE_WINDOW:]
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
    if len(info.get("blank_frames") or []) > 2:
        out.append(f"blank frames at {info['blank_frames'][:5]} s")
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


def save_cover(video: Path, out: Path) -> None:
    """Frame 0 (the cover) at 270x480, so pipeline.health can compare it with YouTube's thumbnail."""
    import subprocess

    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-frames:v", "1",
                        "-vf", "scale=270:480", "-q:v", "5", str(out)], check=True)
    except Exception as exc:  # never block a post over this
        print(f"::warning title={out.stem}::cover not saved: {exc}")


def remake_jobs() -> list | None:
    """REMAKE_IDS=085,092 (branch `remake`, Nov 18, Sam: "fix all the old ones"): Shorts that are already
    scheduled on Buffer but were rendered in the old look. Each is rendered again with the SAME voice (the
    voice artifacts of the run that made it) and booked into its SAME slot; the old Buffer post is deleted only
    after the new one is booked, so a failed or held remake leaves the old post in place."""
    ids = [x.strip() for x in os.environ.get("REMAKE_IDS", "").split(",") if x.strip()]
    if not ids:
        return None
    now = dt.datetime.now(dt.timezone.utc)
    out = []
    for i in ids:
        i, _, move_to = i.partition("@")   # Nov 21: "137@2026-11-23T12:00-05:00" books the remake at a new time
        for p in SCRIPTS.glob(f"{i}-*.json"):
            s = json.loads(p.read_text(encoding="utf-8"))
            d = s.get("delivered") or {}
            when = dt.datetime.fromisoformat(d["post_at"]) if d.get("post_at") else None
            if when and move_to:
                when = dt.datetime.fromisoformat(move_to)
            if s.get("status") != "delivered" or not d.get("buffer_post") or not when or when <= now + dt.timedelta(minutes=25):
                print(f"[remake] skip {p.stem}: not a future Buffer post")
                continue
            out.append((p, when))
    return sorted(out, key=lambda x: x[1])


def run_remake(jobs: list, args) -> int:
    from . import publish as P
    if args.plan_ids:
        Path(args.plan_ids).write_text("\n".join(p.stem.split("-")[0] for p, _ in jobs) + "\n")
        print(f"[remake] plan: {[p.stem for p, _ in jobs]}")
        return 0
    bad = 0
    for path, when in jobs:
        before = path.read_text(encoding="utf-8")
        script = json.loads(before)
        old = dict(script.get("delivered") or {})
        video = OUT / f"{path.stem}.mp4"
        try:
            info = render_script(path, video)
            print(f"[remake] rendered {video.name}: {info['seconds']}s")
            blockers = gate(script, info)
            try:
                from . import eyes
                seen = eyes.look(video, script)
                blockers += eyes.report(path.stem, seen)
                if seen:
                    info["eyes"] = {k: seen.get(k) for k in ("score", "problems", "best_fix", "model", "acts")}
            except Exception as e:  # noqa: BLE001
                print(f"::warning title=eyes::{e!r}")
            try:   # Nov 18: automatic scene scan (blank / flash / frozen / too-short or too-long shot / jump); warn-only
                from . import scenesheet
                info["scene_scan"] = scenesheet.scan_report(path.stem, video)
            except Exception as e:  # noqa: BLE001
                print(f"::warning title=scene scan::{e!r}")
            if blockers:
                print(f"::warning title={path.stem} remake held::old post kept: {'; '.join(blockers)}")
                path.write_text(before, encoding="utf-8")
                bad += 1
                continue
            if args.dry:
                continue
            save_cover(video, ROOT / "analytics" / "covers" / f"{path.stem}.jpg")
            result = deliver(video, script, when)
            old_gone = False
            if not result.get("buffer_post") and result.get("asset_url") and old.get("buffer_post"):
                # Nov 21: Buffer allows 2 YouTube posts a day, so a full day refuses the new post while the old one
                # is still booked. The old one is the old look (never post it, Sam), so free its slot and book again.
                P.buffer_delete(old["buffer_post"])
                old_gone = True
                print(f"[remake] deleted old Buffer post {old['buffer_post']} to free the day")
                try:
                    post = P.buffer_schedule(result["asset_url"], script, when)
                    check = P.buffer_post(post["id"])
                    result = {**result, "mode": "buffer", "buffer_post": post["id"], "buffer_status": check.get("status")}
                except Exception as e:  # noqa: BLE001
                    script["status"] = "needs_fix"
                    script["needs_fix"] = [f"remake: new-look video is ready at {result.get('release')} but Buffer "
                                           f"would not book it for {when:%a %b %d %H:%M} ({e}); old post was deleted. "
                                           f"Book it in Buffer or set it back to ready."]
                    path.write_text(json.dumps(script, indent=2, ensure_ascii=False) + "\n")
                    print(f"::error title={path.stem} remake::{script['needs_fix'][0]}")
                    bad += 1
                    continue
            if not result.get("buffer_post"):
                raise RuntimeError(f"new post not booked: {result}")
            if not old_gone:
                try:
                    P.buffer_delete(old["buffer_post"])
                    print(f"[remake] deleted old Buffer post {old['buffer_post']}")
                except Exception as e:  # noqa: BLE001  two posts in one slot is better than none; say so loudly
                    print(f"::error title={path.stem} remake::new post booked but old post {old['buffer_post']} NOT deleted: {e!r}")
            script["status"] = "delivered"
            script["delivered"] = {**result, "rendered_at": dt.datetime.now(dt.timezone.utc).isoformat(), "seconds": info["seconds"],
                                   "remade_from": old.get("buffer_post"), **({"eyes": info["eyes"]} if info.get("eyes") else {}),
                                   **({"scene_scan": info["scene_scan"]} if info.get("scene_scan") else {})}
            path.write_text(json.dumps(script, indent=2, ensure_ascii=False) + "\n")
            print(f"[remake] {path.stem} rebooked at {when:%a %H:%M}: {result.get('buffer_post')}")
        except Exception as e:  # noqa: BLE001
            path.write_text(before, encoding="utf-8")
            print(f"::error title={path.stem} remake failed::old post kept: {e!r}")
            bad += 1
    return 1 if bad == len(jobs) and jobs else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=int(os.environ.get("SHORTS_PER_RUN", "2")))
    ap.add_argument("--id", default=None)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--plan-ids", default=None, help="write the ids this run would render (+2 spares) and exit")
    args = ap.parse_args()
    if not args.dry and not args.id and not posting_started():
        print(f"[run] posting starts {POST_START} (New York); nothing to do yet")
        return 0

    queue = ready_scripts(recent_formats(SHARE_WINDOW))
    remake = remake_jobs()
    if remake is not None:              # Nov 18: re-render already scheduled Shorts in the new look, same slots
        return run_remake(remake, args)
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
    if args.plan_ids:  # for the voice pre-pass: what tonight renders, plus spares for gate failures
        extra = [p for p in ready_scripts() if p not in queue][:2]
        Path(args.plan_ids).write_text("\n".join(p.stem.split("-")[0] for p in queue + extra) + "\n")
        print(f"[run] plan: {[p.stem for p in queue + extra]}")
        return 0
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
            if os.environ.get("LP_RECORD"):  # Blender plan for the 20-machine render (nightly)
                from . import lowpoly
                if lowpoly.PLAN:
                    lowpoly.dump_plan(Path(os.environ["LP_RECORD"]) / f"{path.stem}.json")
            print(f"[run] rendered {video.name}: {info['seconds']}s")
            print(f"::notice title={path.stem}::{json.dumps({k: v for k, v in info.items() if k not in ('path', 'audio_issues', 'heard')})}")
            for issue in info.get("audio_issues", []):
                print(f"::warning title={path.stem} audio::{issue}")
            if not info.get("audio_issues"):
                print(f"[check] {path.stem}: audio OK (longest breath {info.get('longest_breath')}s)")
            elif os.environ.get("AUDIO_CHECK") == "strict" and not args.dry:
                raise RuntimeError(f"audio check failed: {len(info['audio_issues'])} issue(s)")
            blockers = gate(script, info)
            try:   # Nov 13: a vision model looks at the finished Short (warn-only unless EYES=strict)
                from . import eyes
                seen = eyes.look(video, script)
                blockers += eyes.report(path.stem, seen)
                if seen:
                    info["eyes"] = {k: seen.get(k) for k in ("score", "problems", "best_fix", "model", "acts")}
            except Exception as e:  # noqa: BLE001  never lose a Short over the reviewer
                print(f"::warning title=eyes::{e!r}")
            try:   # Nov 18: automatic scene scan (blank / flash / frozen / too-short or too-long shot / jump); warn-only
                from . import scenesheet
                info["scene_scan"] = scenesheet.scan_report(path.stem, video)
            except Exception as e:  # noqa: BLE001
                print(f"::warning title=scene scan::{e!r}")
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
                save_cover(video, ROOT / "previews" / f"{path.stem}-cover.jpg")
                continue
            save_cover(video, ROOT / "analytics" / "covers" / f"{path.stem}.jpg")
            result = deliver(video, script, when)
            script["status"] = "delivered"
            script["delivered"] = {**result, "rendered_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                   "seconds": info["seconds"], **({"eyes": info["eyes"]} if info.get("eyes") else {}),
                                   **({"scene_scan": info["scene_scan"]} if info.get("scene_scan") else {})}
            path.write_text(json.dumps(script, indent=2, ensure_ascii=False) + "\n")
            print(f"[run] delivered {path.stem}: {result}")
        except NewLookMissing as e:  # Nov 21 (Sam): never the old look. Failed render -> needs_fix (the Saturday routine fixes it)
            if e.kind == "fail" and not args.dry:
                script = json.loads(path.read_text())
                script["status"] = "needs_fix"
                script["needs_fix"] = [f"{e} (not posted; render it again in the new look)"]
                path.write_text(json.dumps(script, indent=2, ensure_ascii=False) + "\n")
                failures += 1
                print(f"::error title={path.stem} not posted::{e}; moved to needs_fix")
            else:
                print(f"::warning title={path.stem} not posted::{e}; stays ready")
            if spares:
                jobs.append((spares.pop(0), when))
        except Exception:  # keep going; the failed script stays 'ready' for next run
            failures += 1
            traceback.print_exc()
    if left < 6:
        print(f"::warning::Only {left} scripts left in the queue")
    return 1 if failures == len(queue) else 0


if __name__ == "__main__":
    sys.exit(main())
