import datetime as dt
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from pipeline import publish as P

NOW = dt.datetime(2026, 11, 24, 10, 0, tzinfo=dt.timezone.utc)


def rec(d, sid, delivered):
    p = d / f"{sid}-x.json"
    p.write_text(json.dumps({"id": sid, "title": "T", "description": "D", "tags": [], "delivered": delivered}))
    return p


def rel(when, **kw):
    return {"mode": "release", "asset_url": "https://example.test/v.mp4", "post_at": when.isoformat(), **kw}


class Heal(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        self.env = mock.patch.dict(os.environ, {"UPLOAD_MODE": "buffer"})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_heals_future_release_keeps_time(self):
        when = NOW + dt.timedelta(hours=3)
        p = rec(self.d, "1", rel(when, buffer_error="old"))
        with mock.patch.object(P, "buffer_schedule", return_value={"id": "B1"}) as sch, \
             mock.patch.object(P, "buffer_post", return_value={"status": "scheduled"}):
            self.assertEqual(P.heal_release_posts([p], NOW), 1)
        self.assertEqual(sch.call_args.args[2], when)
        d = json.loads(p.read_text())["delivered"]
        self.assertEqual((d["mode"], d["buffer_post"], d["post_at"]), ("buffer", "B1", when.isoformat()))
        self.assertNotIn("buffer_error", d)

    def test_skips_soon_past_existing_and_wrong_mode(self):
        ps = [rec(self.d, "1", rel(NOW + dt.timedelta(minutes=10))),
              rec(self.d, "2", rel(NOW - dt.timedelta(hours=1))),
              rec(self.d, "3", rel(NOW + dt.timedelta(hours=2), buffer_post="X")),
              rec(self.d, "4", {**rel(NOW + dt.timedelta(hours=2)), "mode": "buffer"})]
        with mock.patch.object(P, "buffer_schedule") as sch:
            self.assertEqual(P.heal_release_posts(ps, NOW), 0)
        sch.assert_not_called()

    def test_not_in_release_mode_run(self):
        p = rec(self.d, "1", rel(NOW + dt.timedelta(hours=3)))
        with mock.patch.dict(os.environ, {"UPLOAD_MODE": "release"}), \
             mock.patch.object(P, "buffer_schedule") as sch:
            self.assertEqual(P.heal_release_posts([p], NOW), 0)
        sch.assert_not_called()

    def test_failure_records_scrubbed_error(self):
        p = rec(self.d, "1", rel(NOW + dt.timedelta(hours=3)))
        with mock.patch.object(P, "buffer_schedule", side_effect=P.BufferError("HTTP 400: Authorization: Bearer abcdefghijklmnop1234")):
            self.assertEqual(P.heal_release_posts([p], NOW), 0)
        d = json.loads(p.read_text())["delivered"]
        self.assertEqual(d["mode"], "release")
        self.assertNotIn("abcdefghijklmnop1234", d["buffer_error"])
        self.assertIn("HTTP 400", d["buffer_error"])


class ErrorAndQueue(unittest.TestCase):
    def test_buffer_failure_stores_error(self):
        when = NOW + dt.timedelta(hours=3)
        relrec = rel(when)
        with mock.patch.object(P, "_release", return_value=relrec), \
             mock.patch.object(P, "public_ok", return_value=True), \
             mock.patch.object(P, "buffer_schedule", side_effect=P.BufferError("createPost: limit reached")):
            out = P._buffer(Path("v.mp4"), {"id": "9"}, when)
        self.assertEqual(out["mode"], "release")
        self.assertIn("limit reached", out["buffer_error"])
        self.assertNotIn("buffer_post", out)

    def test_scrub(self):
        with mock.patch.dict(os.environ, {"BUFFER_API_KEY": "my-key-value"}):
            t = P.scrub_error("bad my-key-value and ghp_abcdefghijklmnop and " + "a" * 40)
        self.assertNotIn("my-key-value", t)
        self.assertNotIn("ghp_abcdefghijklmnop", t)
        self.assertNotIn("a" * 40, t)

    def test_count_queued(self):
        s = [{"delivered": {"mode": "buffer", "buffer_post": "a", "post_at": (NOW + dt.timedelta(hours=1)).isoformat()}},
             {"delivered": {"mode": "buffer", "buffer_post": "b", "post_at": (NOW - dt.timedelta(hours=1)).isoformat()}},
             {"delivered": rel(NOW + dt.timedelta(hours=1))}, {}]
        self.assertEqual(P.count_queued(s, NOW), 1)


if __name__ == "__main__":
    unittest.main()
