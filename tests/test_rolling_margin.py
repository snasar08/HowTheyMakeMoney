import datetime as dt
import unittest

from pipeline import publish as P


class RollingMargin(unittest.TestCase):
    def test_noon_after_noon_and_evening_is_nudged(self):
        tz = P.TZ
        y12 = dt.datetime(2030, 3, 4, 12, 0, tzinfo=tz)
        y19 = dt.datetime(2030, 3, 4, 19, 15, tzinfo=tz)
        now = dt.datetime(2030, 3, 5, 2, 0, tzinfo=tz)
        slots = P.publish_slots(1, now=now, taken={y12: "a", y19: "b"})
        self.assertTrue(slots)
        self.assertGreaterEqual(slots[0] - y12, dt.timedelta(hours=24, minutes=15))
        self.assertFalse(P.rolling_ok(y12 + dt.timedelta(hours=24), [y12, y19]))


if __name__ == "__main__":
    unittest.main()
