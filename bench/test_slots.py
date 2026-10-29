"""Offline test of run.main's slot logic: rendering and delivery are faked, scripts are copied
to a temp dir, so nothing real is touched. python bench/test_slots.py"""
import datetime as dt, json, os, shutil, sys, tempfile
from pathlib import Path
sys.path.insert(0, os.getcwd())
from pipeline import publish as P, run as R

tmp = Path(tempfile.mkdtemp())
shutil.copytree("content/scripts", tmp / "scripts")
R.SCRIPTS = tmp / "scripts"
R.OUT = tmp / "out"
R.render_script = lambda path, video: {"seconds": 30, "clarity": 1.0, "longest_breath": 4, "clipped_pct": 0,
                                       "timed_words": True, "images_ok": ["hook", "mid", "broll1", "broll2"],
                                       "audio_issues": [], "scene_mids": []}
R.gate = lambda s, i: []
booked = []
R.deliver = lambda video, s, when: booked.append((s["id"], when)) or {"mode": "buffer", "post_at": when.isoformat(),
                                                                       "buffer_post": "fake", "buffer_status": "scheduled"}
real_now = dt.datetime.now
def at(y, m, d, H, M):
    class FakeDT(dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return dt.datetime(y, m, d, H, M, tzinfo=P.TZ).astimezone(tz) if tz else dt.datetime(y, m, d, H, M)
    P.dt.datetime = FakeDT
    R.dt.datetime = FakeDT
sys.argv = ["run"]
for label, when in (("manual Thu 10:54", (2026, 10, 29, 10, 54)), ("again Thu 11:30 (backup/late)", (2026, 10, 29, 11, 30)),
                    ("evening Thu 21:23", (2026, 10, 29, 21, 23)), ("backup Fri 09:41", (2026, 10, 30, 9, 41))):
    at(*when)
    booked.clear()
    R.main()
    print(f"== {label}: booked {[(i, t.strftime('%a %H:%M')) for i, t in booked]}\n")
per_day = {}
for p in (tmp / "scripts").glob("*.json"):
    d = json.loads(p.read_text(encoding="utf-8")).get("delivered") or {}
    if d.get("post_at"):
        per_day.setdefault(d["post_at"], []).append(p.stem[:3])
dups = {k: v for k, v in per_day.items() if len(v) > 1}
print("double-booked slots:", dups or "none")
