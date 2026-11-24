import copy
import unittest

from pipeline.lint import lint_pov


def good():
    return {"format": "pov", "pov": "POV: you fill up your gas tank",
            "scenes": [{"narration": "A tank costs 60 dollars.", "toon": [
                {"math": [{"op": "", "value": "15 gal", "label": "tank"}, {"op": "×", "value": "$4", "label": "per gallon"},
                          {"op": "=", "value": "$60", "label": "your bill", "result": True}],
                 "units": {"thing": "bathtub", "count": 2, "fill": True}, "journey": "pump to wallet"}]}]}


class PovLint(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(lint_pov(good()), [])

    def test_non_pov_format_needs_nothing(self):
        self.assertEqual(lint_pov({"format": "how", "scenes": []}), [])

    def test_missing_or_bad_pov_line(self):
        s = good(); del s["pov"]
        self.assertTrue(any("needs a top-level" in e for e in lint_pov(s)))
        s["pov"] = "POV: you " + "x" * 40
        self.assertTrue(any("max 40" in e for e in lint_pov(s)))
        s["pov"] = "You fill up"
        self.assertTrue(any("must start with" in e for e in lint_pov(s)))

    def test_bad_math_units_journey(self):
        s = good(); t = s["scenes"][0]["toon"][0]
        t["math"][0]["op"] = "%"
        t["math"][1]["label"] = "x" * 23
        t["math"][2]["result"] = "yes"
        t["units"] = {"thing": "boat", "count": 3}
        t["journey"] = 5
        errs = lint_pov(s)
        self.assertEqual(len(errs), 5, errs)
        t["units"] = {"thing": "coin", "count": 21}
        self.assertTrue(any("1-20" in e for e in lint_pov(s)))


if __name__ == "__main__":
    unittest.main()

    def test_units_label(self):
        s = good(); t = s["scenes"][0]["toon"][0]
        s["scenes"][0]["narration"] = "A tank costs 60 dollars and 114 billion pennies."
        t["units"] = {"thing": "coin", "count": 12, "fill": True, "label": "114 billion pennies"}
        self.assertEqual(lint_pov(s), [])
        t["units"]["label"] = "x" * 25
        self.assertTrue(any("24 chars" in e for e in lint_pov(s)))
        t["units"]["label"] = "999 billion pennies"
        self.assertTrue(any("never invent" in e for e in lint_pov(s)))



class PovCardsMatchVoice(unittest.TestCase):
    def test_card_number_must_be_spoken_in_its_sentence(self):
        from pipeline.lint import pov_unspoken_numbers
        s = {"scenes": [{"narration": "It meant 3.172 billion pennies. The Mint lost 85.3 million dollars.",
                         "toon": [{"card": {"text": "2024"}}, {"card": {"text": "$85.3M"}}]}]}
        self.assertEqual(len(pov_unspoken_numbers(s)), 1)
        s["scenes"][0]["toon"][0]["card"]["text"] = "3.172B"
        self.assertEqual(pov_unspoken_numbers(s), [])

    def test_178_cards_hit_on_their_own_words(self):
        import json
        from pathlib import Path
        from pipeline.lint import pov_unspoken_numbers
        p = Path(__file__).resolve().parent.parent / "content" / "scripts" / "178-pov-penny.json"
        self.assertEqual(pov_unspoken_numbers(json.loads(p.read_text(encoding="utf-8"))), [])
