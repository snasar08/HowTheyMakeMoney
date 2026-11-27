import unittest

from pipeline.script_check import check, wc, sentences


def script(narr, **kw):
    s = {"title": "He Turned Down $20 Million a Year", "loop": "So next time someone says no, remember:",
         "description": "He turned down 20 million dollars. 2024.", "sources": [{"title": "x", "url": "https://x"}],
         "scenes": [{"narration": narr}]}
    s.update(kw)
    return s


GOOD = ("His dad worked 4 jobs at once. But that is not how he got rich. Then he signed a 20 million dollar shoe deal. "
        "Now he drives a red car.")


class ScriptCheck(unittest.TestCase):
    def test_good_script_scores_high(self):
        sc, issues = check(script(GOOD))
        self.assertGreaterEqual(sc, 90, issues)

    def test_long_hook_penalised(self):
        sc, issues = check(script("You are a famous player and you make a very large amount of money every single year. But why?"))
        self.assertTrue(any("hook is" in i for i in issues))

    def test_banned_openers(self):
        for hook in ("Guess how much Nike makes in a day.", "How did Nike get so rich?", "What if Nike isn't a shoe company?"):
            _, issues = check(script(hook + " But there is a twist with 5 shoes."))
            self.assertTrue(any("banned opener" in i for i in issues), hook)

    def test_fragment_run(self):
        _, issues = check(script("He earned 5 dollars. That year? By his guess. Then he bought a car."))
        self.assertTrue(any("tiny fragments" in i for i in issues))

    def test_long_line(self):
        long = "But " + " ".join(["word"] * 16) + " shoe."
        _, issues = check(script("He sells 5 shoes. " + long))
        self.assertTrue(any("over 14 words" in i for i in issues))

    def test_abstract_line(self):
        _, issues = check(script("He sells 5 shoes. But it was all about the journey and success."))
        self.assertTrue(any("abstract" in i for i in issues))

    def test_toon_thing_makes_line_drawable(self):
        s = script("He sells 5 shoes. But it was all about the journey and success.")
        s["scenes"][0]["toon"] = [{}, {"things": ["trophy"]}]
        _, issues = check(s)
        self.assertFalse(any("abstract" in i for i in issues))

    def test_loop_and_title(self):
        _, issues = check(script(GOOD, loop="", title="x" * 51))
        self.assertTrue(any("no `loop`" in i for i in issues))
        self.assertTrue(any("title is 51" in i for i in issues))
        _, issues = check(script(GOOD, loop="Thanks for watching."))
        self.assertTrue(any("`loop` should end" in i for i in issues))

    def test_unsourced_number(self):
        _, issues = check(script("He earned 77 million dollars. But he kept 20 shoes."))
        self.assertTrue(any("77" in i for i in issues))

    def test_helpers(self):
        self.assertEqual(wc("You're Nike, 46.3 billion."), 4)
        self.assertEqual(len(sentences("One. Two three? Four!")), 3)


if __name__ == "__main__":
    unittest.main()
