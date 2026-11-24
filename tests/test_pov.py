"""POV format (Nov 24): math-card timeline, unit rows, journey shots, overlap rules. Run: python -m unittest tests.test_pov"""
import json
import unittest
from pathlib import Path

from pipeline import toon, toon_director

FIX = Path(__file__).resolve().parent.parent / "toon" / "test_fixtures" / "pov_test.json"


def _plan():
    return toon.make_plan(json.loads(FIX.read_text(encoding="utf-8")))


class PovTest(unittest.TestCase):
    def test_clean_keeps_strings_exactly(self):
        out = toon_director.clean_pov({"math": [{"op": "x", "value": "12.5¢", "label": "fee"}, {"op": "=", "value": "1,200", "label": "all"}],
                                       "units": {"thing": "Bathtub", "count": 99}, "journey": " bubble to bank "})
        self.assertEqual([c["value"] for c in out["math"]], ["12.5¢", "1,200"])
        self.assertEqual(out["math"][0]["op"], "×")
        self.assertTrue(out["math"][1]["result"])
        self.assertEqual(out["units"], {"thing": "bathtub", "count": 24, "fill": True})
        self.assertEqual(out["journey"], "bubble to bank")
        self.assertEqual(toon_director.clean_pov({"units": {"thing": "dragon"}}), {})

    def test_hud_stacks(self):
        plan = _plan()
        hud = toon.pov_hud(plan)
        self.assertEqual(hud["pill"]["text"], "POV: you tap your card for coffee")
        self.assertEqual(len(hud["stacks"]), 2)
        s0 = hud["stacks"][0]
        self.assertEqual([c["value"] for c in s0["cards"]], ["$5.00", "2.5%", "12.5¢"])
        self.assertEqual([c["at"] for c in s0["cards"]], sorted(c["at"] for c in s0["cards"]))
        self.assertTrue(s0["cards"][2]["result"])
        self.assertEqual(len(hud["stacks"][1]["cards"]), 4)           # a new stack after the clear
        self.assertLessEqual(s0["b"], hud["stacks"][1]["a"])

    def test_shots_cover_timeline_without_repeats(self):
        plan = _plan()
        shots = toon.ah_shots(plan)
        self.assertEqual(shots[0]["a"], 0)
        for p, s in zip(shots, shots[1:]):
            self.assertEqual(p["a"] + p["n"], s["a"])                  # contiguous, nothing lost
        self.assertEqual(shots[-1]["a"] + shots[-1]["n"], plan["total"])
        self.assertTrue(any(s.get("units") for s in shots) and any(s.get("journey") for s in shots))
        self.assertTrue(all(s["n"] <= 90 for s in shots))              # views switch every ~1.7 s (journey pieces up to ~2.7 s)
        sigs = [(s["set"], s.get("view"), json.dumps(s.get("units") or s.get("journey") or "", sort_keys=True), tuple(t["name"] for t in s["things"]), s["a"] if s["chars"] == [] else 0) for s in shots]
        self.assertEqual(len(sigs), len(set(sigs)))                    # no picture twice
        for s in shots:
            if s.get("hud"):
                self.assertGreater(s["hud"]["shift"], 0)

    def test_non_pov_untouched(self):
        script = json.loads(FIX.read_text(encoding="utf-8"))
        script["format"] = "story"
        plan = toon.make_plan(script)
        self.assertNotIn("pov", plan)
        self.assertFalse(any(s.get("units") or s.get("journey") or s.get("hud") for s in toon.ah_shots(plan)))


if __name__ == "__main__":
    unittest.main()
