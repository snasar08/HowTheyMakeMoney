"""Checks for the film queue / cadence logic: python -m unittest tests.test_films (or python tests/test_films.py)"""
import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import films as F  # noqa: E402

UTC = dt.timezone.utc
_unpause = None


def setUpModule():  # the real repo may be paused (content/films2d/PAUSED); the logic tests run unpaused
    global _unpause
    from unittest import mock
    _unpause = mock.patch.object(F, "paused", return_value=False)
    _unpause.start()


def tearDownModule():
    _unpause.stop()


def T(s):
    return dt.datetime.fromisoformat(s).replace(tzinfo=UTC)


def item(n, status, posted=None):
    f = {"status": status}
    if posted:
        f["posted_at"] = posted
    return (n, Path(f"content/films2d/{n:03d}-x.json"), f)


class Due(unittest.TestCase):
    def test_none_delivered_is_due(self):
        self.assertTrue(F.is_due([item(1, "ready")], T("2026-11-20T13:00")))

    def test_two_days_not_due(self):
        it = [item(1, "delivered", "2026-11-20T22:00:00Z"), item(2, "ready")]
        self.assertFalse(F.is_due(it, T("2026-11-22T13:00")))

    def test_three_days_due_even_if_cron_is_earlier_in_the_day(self):
        it = [item(1, "delivered", "2026-11-20T22:00:00Z"), item(2, "ready")]   # 17:00 ET Nov 20
        self.assertTrue(F.is_due(it, T("2026-11-23T13:00")))    # 08:00 ET Nov 23 = 3 calendar days, only 63 h
        self.assertFalse(F.is_due(it, T("2026-11-23T04:00")))   # 23:00 ET Nov 22 = still day 2

    def test_uses_latest_delivery(self):
        it = [item(1, "delivered", "2026-11-01T22:00:00Z"), item(2, "delivered", "2026-11-22T22:00:00Z")]
        self.assertFalse(F.is_due(it, T("2026-11-23T13:00")))

    def test_draft_and_posted_at_ignored_unless_delivered(self):
        it = [item(1, "draft", "2026-11-22T22:00:00Z")]
        self.assertTrue(F.is_due(it, T("2026-11-23T13:00")))


class Pick(unittest.TestCase):
    def test_lowest_ready_wins_and_900_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            for name, st in [("003-c.json", "ready"), ("002-b.json", "ready"), ("001-a.json", "delivered"),
                             ("900-internal.json", "ready"), ("950-x.json", "ready"), ("notes.json", "ready")]:
                (d / name).write_text(json.dumps({"status": st}))
            (d / "test").mkdir()
            (d / "test" / "000-sub.json").write_text(json.dumps({"status": "ready"}))
            q = F.queue(d)
            self.assertEqual([n for n, _, _ in q], [1, 2, 3])
            self.assertEqual(F.next_ready(q)[0], 2)

    def test_decide_flow(self):
        now = T("2026-11-23T13:00")
        q = [item(1, "delivered", "2026-11-20T22:00:00Z"), item(2, "ready")]
        self.assertTrue(F.decide(q, now)["go"])
        self.assertEqual(F.decide(q, now)["id"], "002-x")
        self.assertFalse(F.decide(q, T("2026-11-21T13:00"))["go"])           # not due
        self.assertTrue(F.decide(q, T("2026-11-21T13:00"), force=True)["go"])
        self.assertFalse(F.decide([item(1, "delivered", "2026-11-01T22:00:00Z")], now)["go"])   # due, nothing ready
        d = F.decide(q, T("2026-11-21T13:00"), dry=True)                     # dry ignores cadence
        self.assertTrue(d["go"])
        self.assertFalse(F.decide([], now, file="content/films2d/900-x.json")["go"])         # internal never
        self.assertFalse(F.decide([], now, dry=True, file="content/films2d/900-x.json")["go"])

    def test_real_queue_has_no_internal(self):
        for n, p, f in F.queue():
            self.assertLess(n, 900)


class Time(unittest.TestCase):
    def test_publish_17_et(self):
        p = F.publish_at(T("2026-11-23T13:00"))          # winter: ET = UTC-5
        self.assertEqual(p.strftime("%H:%M"), "22:00")
        p = F.publish_at(T("2026-07-10T13:00"))          # summer: ET = UTC-4
        self.assertEqual(p.strftime("%H:%M"), "21:00")

    def test_late_run_gets_a_future_time(self):
        now = T("2026-11-23T23:30")                       # 18:30 ET, 17:00 already gone
        self.assertGreater(F.publish_at(now), now)

    def test_mark(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "001-x.json"
            p.write_text(json.dumps({"title": "T", "status": "ready"}))
            F.mark(p, "2026-11-23T22:00:00Z", "https://r")
            j = json.loads(p.read_text())
            self.assertEqual((j["status"], j["posted_at"], j["release"]), ("delivered", "2026-11-23T22:00:00Z", "https://r"))


class Upload(unittest.TestCase):
    def test_film_body_is_long_form(self):
        from pipeline import yt_upload as Y
        b = Y.video_body({"title": "A film", "description": "d", "tags": ["a"]}, T("2026-11-23T22:00"), Y.FILM_CATEGORY)
        self.assertEqual(b["snippet"]["categoryId"], "1")
        self.assertNotIn("shorts", json.dumps(b).lower())
        self.assertEqual(b["status"]["privacyStatus"], "private")
        self.assertEqual(b["status"]["publishAt"], "2026-11-23T22:00:00Z")
        self.assertIs(b["status"]["selfDeclaredMadeForKids"], False)
        self.assertIs(b["status"]["containsSyntheticMedia"], True)
        self.assertEqual(Y.video_body({"title": "s", "description": "d"}, None)["snippet"]["categoryId"], "27")  # Shorts unchanged

    def test_upload_never_raises(self):
        import os
        os.environ.pop("YTC_CLIENT_ID", None)
        os.environ["FILM_UPLOAD"] = "youtube"
        self.assertIsNone(F.upload(Path("nope.json"), Path("nope.mp4"), Path("nope.jpg"), "2026-11-23T22:00:00Z"))


class FilmDayShorts(unittest.TestCase):
    """Sam, Nov 19: 2 Shorts a day, but 1 Short + 1 film on a film day."""
    D = dt.date

    def test_days_from_last_post(self):
        items = [item(101, "delivered", "2026-11-20T22:00:00Z"), item(102, "ready"), item(103, "ready")]
        self.assertEqual(F.film_days(T("2026-11-21T12:00:00"), items),
                         {self.D(2026, 11, 20), self.D(2026, 11, 23), self.D(2026, 11, 26)})

    def test_first_film_is_today(self):
        self.assertEqual(F.film_days(T("2026-11-20T09:00:00"), [item(101, "ready")]), {self.D(2026, 11, 20)})

    def test_after_todays_run_first_film_is_tomorrow(self):
        # Nov 19 21:00 New York = Nov 20 02:00 UTC: the next films.yml run is Nov 20 13:00 UTC
        self.assertEqual(F.film_days(T("2026-11-20T02:00:00"), [item(101, "ready")]), {self.D(2026, 11, 20)})
        self.assertEqual(F.film_days(T("2026-11-20T17:00:00"), [item(101, "ready")]), {self.D(2026, 11, 21)})

    def test_no_ready_film_no_film_day(self):
        self.assertEqual(F.film_days(T("2026-11-20T09:00:00"), [item(101, "draft")]), set())

    def test_one_short_on_film_day(self):
        from unittest import mock
        from zoneinfo import ZoneInfo
        from pipeline import publish as P
        ny = ZoneInfo("America/New_York")
        with mock.patch.object(P, "film_days", return_value={self.D(2026, 11, 21)}):
            got = P.publish_slots(5, now=dt.datetime(2026, 11, 20, 1, 0, tzinfo=ny))
        days = [t.date() for t in got]
        self.assertEqual(days.count(self.D(2026, 11, 20)), 2)
        self.assertEqual(days.count(self.D(2026, 11, 21)), 1)
        self.assertEqual([t.hour for t in got if t.date() == self.D(2026, 11, 21)], [12])


class Paused(unittest.TestCase):
    def test_paused_never_goes_and_no_film_days(self):
        from unittest import mock
        with mock.patch.object(F, "paused", return_value=True):
            self.assertFalse(F.decide([item(101, "ready")], T("2026-11-20T13:00:00"))["go"])
            self.assertFalse(F.decide([item(101, "ready")], T("2026-11-20T13:00:00"), force=True)["go"])
            self.assertEqual(F.film_days(T("2026-11-20T13:00:00")), set())


if __name__ == "__main__":
    unittest.main()
