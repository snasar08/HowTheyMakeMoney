"""Every pov script that is not yet posted keeps sentences == toon beats in each scene, speaks every card number
in its own sentence, and stays inside the length sweet spot (Nov 26 trim of 177/179/180/181)."""
import json
import re
import unittest
from pathlib import Path

from pipeline import lint

SCRIPTS = Path(__file__).resolve().parent.parent / "content" / "scripts"


class PovScripts(unittest.TestCase):
    def test_pending_pov_scripts(self):
        n = 0
        for p in sorted(SCRIPTS.glob("*pov*.json")):
            s = json.loads(p.read_text(encoding="utf-8"))
            if s.get("format") != "pov" or s.get("status") != "ready":
                continue
            n += 1
            for i, sc in enumerate(s["scenes"]):
                sents = [x for x in re.split(r"(?<=[.!?])\s+(?=[A-Z])", sc["narration"].strip()) if x]
                self.assertEqual(len(sents), len(sc["toon"]), f"{p.name} scene {i + 1}")
            self.assertEqual(lint.pov_unspoken_numbers(s), [], p.name)
            self.assertEqual(lint.lint_pov(s), [], p.name)
            words = sum(len(sc["narration"].split()) for sc in s["scenes"])
            self.assertLess(words / lint.WPS, 52, f"{p.name} narration too long ({words} words)")
        self.assertGreater(n, 0)


if __name__ == "__main__":
    unittest.main()
