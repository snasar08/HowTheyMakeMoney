import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from pipeline import run as R


class ShareRule(unittest.TestCase):
    def test_boost_shares_not_starves(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            for i in range(10):
                for fmt, score in (("famous", 95), ("whatif", 85), ("story", 86)):
                    (d / f"{fmt}{i:02}.json").write_text(json.dumps(
                        {"status": "ready", "format": fmt, "score": score - i, "visual_style": "lowpoly"}))
            with mock.patch.object(R, "SCRIPTS", d), \
                 mock.patch.object(R, "_weights", return_value={"famous": 1.4, "whatif": 0.3}):
                order = [p.stem.rstrip("0123456789") for p in R.ready_scripts([("famous", "lowpoly")] * 6)]
        first = order[:12]
        self.assertIn("whatif", first[:3])                      # starved format comes back fast
        self.assertGreaterEqual(first.count("whatif"), 3)       # weak format still gets love (floor)
        self.assertGreater(first.count("famous"), first.count("whatif"))  # boost still counts
        self.assertTrue(all(a != b for a, b in zip(first, first[1:])))   # never twice in a row

    def test_pov_posts_soon_without_starving_others(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            for i in range(8):
                for fmt, score in (("famous", 95), ("whatif", 85), ("story", 86), ("pov", 80)):
                    (d / f"{fmt}{i:02}.json").write_text(json.dumps(
                        {"status": "ready", "format": fmt, "score": score - i, "visual_style": "lowpoly"}))
            with mock.patch.object(R, "SCRIPTS", d),                  mock.patch.object(R, "_weights", return_value={"famous": 1.4}):
                order = [p.stem.rstrip("0123456789") for p in R.ready_scripts([("famous", "lowpoly")] * 6)]
        first = order[:12]
        self.assertIn("pov", first[:3])                          # new format comes in fast
        self.assertGreaterEqual(first.count("pov"), 2)
        self.assertGreaterEqual(first.count("whatif"), 2)        # and nobody is starved
        self.assertTrue(all(a != b for a, b in zip(first, first[1:])))
        self.assertEqual(R.STARTING_WEIGHT["pov"], 1.0)
        self.assertIn("pov", R.FORMATS)


if __name__ == "__main__":
    unittest.main()
