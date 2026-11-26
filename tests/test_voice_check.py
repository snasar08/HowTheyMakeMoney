import unittest

import numpy as np

from pipeline import voice_check as vc

SR = 24000
LINES = [
    "Starbucks sells coffee in over 35 thousand stores around the world.",
    "Every single morning millions of people line up for a cup.",
    "Last year the company made 16.5 billion dollars in revenue.",
    "That is about 2,700 dollars every single second of the day.",
    "So the next time you order a latte remember who gets paid.",
]
ST_CONTOUR = [0.0, 4.5, -3.5, 5.0, -3.0, 3.5, -5.0, 2.0]


def _voiced(f0, dur, amp, rng):
    t = np.arange(int(dur * SR)) / SR
    x = sum(np.sin(2 * np.pi * f0 * h * t) / h for h in range(1, 8))
    env = np.minimum(1, np.minimum(t, dur - t) / 0.02)
    return (amp * x / 2.0 * env).astype(np.float32)


def synth(lines=LINES, word_s=0.26, gap_s=0.08, line_gap_s=0.4, pitch_hz=None, extra_gap=None, amp=0.4,
          lead=0.5, drop_last_line=False, words_text=None):
    """Harmonic 'voice' with a pitch contour per word; returns (audio, heard word dicts)."""
    rng = np.random.default_rng(1)
    pitch_hz = pitch_hz or [120.0] * len(lines)
    out, heard, t = [np.zeros(int(lead * SR), np.float32)], [], lead
    use = lines[:-1] if drop_last_line else lines
    for li, ln in enumerate(use):
        for wi, w in enumerate(ln.split()):
            f0 = pitch_hz[li] * 2 ** (ST_CONTOUR[(wi + li) % len(ST_CONTOUR)] / 12)
            out.append(_voiced(f0, word_s, amp, rng))
            heard.append({"word": " " + (words_text or {}).get(w, w), "start": t, "end": t + word_s})
            t += word_s
            last = wi == len(ln.split()) - 1
            g = line_gap_s if last else gap_s
            if extra_gap and (li, wi) == extra_gap[0]:
                g = extra_gap[1]
            out.append(np.zeros(int(g * SR), np.float32))
            t += g
    out.append(np.zeros(int(0.5 * SR), np.float32))
    return np.concatenate(out), heard


class CheckTests(unittest.TestCase):
    def test_clean_read(self):
        a, h = synth()
        r = vc.check(a, SR, LINES, h)
        self.assertTrue(r.ok, r.hard)
        self.assertGreaterEqual(r.score, 85, (r.soft, r.metrics))
        self.assertEqual(r.hint, "")

    def test_truncated(self):
        a, h = synth(drop_last_line=True)
        r = vc.check(a, SR, LINES, h)
        self.assertFalse(r.ok)
        self.assertTrue(any(x.startswith("truncated") for x in r.hard), r.hard)
        self.assertTrue(r.hint)

    def test_mid_sentence_pause(self):
        a, h = synth(extra_gap=((1, 3), 1.5))
        r = vc.check(a, SR, LINES, h)
        self.assertTrue(r.ok, r.hard)
        self.assertTrue(any(x.startswith("pauses") for x in r.soft), r.soft)
        self.assertIn("one smooth paragraph", r.hint)
        self.assertLess(r.score, 100)

    def test_voice_change(self):
        pitch = [120.0, 120.0, 120.0 * 2 ** (9 / 12), 120.0, 120.0]
        a, h = synth(pitch_hz=pitch)
        r = vc.check(a, SR, LINES, h)
        self.assertFalse(r.ok)
        self.assertTrue(any(x.startswith("voice-change") for x in r.hard), (r.hard, r.metrics["line_pitch_dev_st"]))

    def test_clipping(self):
        a, h = synth()
        a = np.clip(a * 6, -1, 1)
        r = vc.check(a, SR, LINES, h)
        self.assertFalse(r.ok)
        self.assertTrue(any(x.startswith("clipping") for x in r.hard), r.hard)

    def test_silence(self):
        r = vc.check(np.zeros(SR * 3, np.float32), SR, LINES, [])
        self.assertFalse(r.ok)
        self.assertTrue(any(x.startswith("silent") for x in r.hard))

    def test_digits_match_speakable_script(self):
        a, h = synth(words_text={"16.5": "16.5", "2,700": "2,700", "35": "35"})
        r = vc.check(a, SR, LINES, h)
        self.assertEqual(r.metrics["missed"], [])
        self.assertEqual(r.metrics["accuracy"], 1.0)
        # whisper-style spellings of the same numbers: "$16.5 billion", "$2,700"
        lines = ["Revenue was $16.5 billion last year for them all.", "They earn $2,700 every single second of the day."]
        a2, h2 = synth(lines=lines)
        r2 = vc.check(a2, SR, lines, h2)
        self.assertEqual(r2.metrics["accuracy"], 1.0, r2.metrics["missed"])

    def test_metrics_json(self):
        import json
        a, h = synth()
        json.dumps(vc.check(a, SR, LINES, h).metrics)


class PolishTests(unittest.TestCase):
    def test_trims_and_offset(self):
        a, _ = synth(lead=1.0)
        b = np.concatenate([a, np.zeros(SR, np.float32)]) + 0.02       # DC offset + long tail
        out, off = vc.polish(b, SR)
        self.assertAlmostEqual(off, 1.0 - vc.LEAD_KEEP_S, delta=0.03)
        self.assertLess(len(out), len(b) - int(1.5 * SR))
        self.assertLessEqual(float(np.max(np.abs(out))), 1.0)
        self.assertAlmostEqual(float(np.max(np.abs(out))), 10 ** (-1 / 20), delta=0.02)
        self.assertLess(abs(float(np.mean(out))), 0.01)

    def test_removes_click_keeps_speech(self):
        a, _ = synth()
        b = a.copy()
        b[40000] = 0.95
        b[60000:60002] = -0.9
        out, off = vc.polish(b, SR)
        i = 40000 - int(off * SR)
        ref, off2 = vc.polish(a, SR)
        self.assertLess(abs(float(out[i] - ref[i])), 0.15)
        self.assertLess(float(np.max(np.abs(out))), 0.92)
        self.assertAlmostEqual(off, off2, places=3)
        self.assertLess(float(np.max(np.abs(out - ref))), 0.1)

    def test_never_clips_hot_input(self):
        a, _ = synth(amp=1.0)
        out, _ = vc.polish(np.clip(a * 3, -1, 1), SR)
        self.assertLessEqual(float(np.max(np.abs(out))), 1.0)

    def test_empty(self):
        out, off = vc.polish(np.zeros(0, np.float32), SR)
        self.assertEqual((len(out), off), (0, 0.0))


class BestTests(unittest.TestCase):
    def test_ok_beats_higher_score(self):
        r1 = vc.Report(False, 95.0, ["x"], [], {}, "")
        r2 = vc.Report(True, 72.0, [], [], {}, "")
        r3 = vc.Report(True, 80.0, [], [], {}, "")
        self.assertEqual(vc.best([r1, r2]), 1)
        self.assertEqual(vc.best([r1, r2, r3]), 2)
        self.assertEqual(vc.best([r1, vc.Report(False, 50.0)]), 0)

    def test_markdown(self):
        r = [vc.Report(False, 40.0, ["truncated"], [], {}, "Say every word clearly."), vc.Report(True, 90.0)]
        md = vc.to_markdown("043", r, 1, "gemini")
        self.assertIn("043", md)
        self.assertIn("| 2 * | yes | 90 |", md)


if __name__ == "__main__":
    unittest.main()
