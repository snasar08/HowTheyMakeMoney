import importlib
import os
import unittest


class EdgeVoiceCache(unittest.TestCase):
    def test_edge_cache_never_reuses_old_voice(self):
        from pipeline import tts
        old = tts.VOICE_SOURCE, tts.EDGE_VOICE
        try:
            tts.VOICE_SOURCE = "edge"
            a = tts.cache_path("Hello there.")
            tts.VOICE_SOURCE = "qwen"
            b = tts.cache_path("Hello there.")
            self.assertNotEqual(a, b)
            tts.VOICE_SOURCE = "edge"
            tts.EDGE_VOICE = "en-US-GuyNeural"
            self.assertNotEqual(a, tts.cache_path("Hello there."))
        finally:
            tts.VOICE_SOURCE, tts.EDGE_VOICE = old

    def test_question_rate_is_the_same(self):
        from pipeline import tts
        tts.EDGE_RATE_NOW = "+18%"
        self.assertEqual(tts.edge_rate_for(False), "+18%")
        self.assertEqual(tts.edge_rate_for(True), "+18%")   # flow fix: one rate, no 7% dip on questions

    def test_edge_does_not_split_long_sentences(self):
        from pipeline import tts
        long = "Then he dribbles past everyone, passes to a friend, and the whole crowd stands up and cheers for him all night long."
        old = tts.VOICE_SOURCE
        try:
            tts.VOICE_SOURCE = "edge"
            self.assertEqual(len(tts.sentences(long)), 1)
            tts.VOICE_SOURCE = "qwen"
            self.assertGreater(len(tts.sentences(long)), 1)      # other voices keep the breath split
        finally:
            tts.VOICE_SOURCE = old

    def test_flow_cache_key_is_new(self):
        from pipeline import tts
        self.assertIn("flow", tts.FLOW_TAG)
        self.assertNotEqual(tts.flow_path("Hello there."), tts.cache_path("Hello there."))

    def test_cap_pauses_keeps_short_gaps_and_shifts_words(self):
        import numpy as np
        from pipeline import tts
        sr = tts.SAMPLE_RATE
        tone = (0.3 * np.sin(2 * np.pi * 150 * np.arange(sr) / sr)).astype(np.float32)   # 1 s of "speech"
        gap = lambda s: np.zeros(int(s * sr), np.float32)  # noqa: E731
        a = np.concatenate([tone, gap(0.15), tone, gap(1.0), tone])
        words = [("one.", 0.0, 1.0), ("two.", 1.15, 2.15), ("three", 3.15, 4.15)]
        out, w = tts.cap_pauses(a, words, cap=0.25, q_cap=0.35)
        self.assertAlmostEqual(len(out) / sr, 4.15 - 0.75, delta=0.03)       # only the 1 s gap lost 0.75 s
        self.assertAlmostEqual(w[1][1], 1.15, delta=0.02)                    # the 0.15 s gap is untouched
        self.assertAlmostEqual(w[2][1], 2.40, delta=0.03)
        q = [("one?", 0.0, 1.0), ("two.", 1.15, 2.15), ("three", 3.15, 4.15)]
        out2, _ = tts.cap_pauses(a, q, cap=0.25, q_cap=0.35)
        self.assertEqual(len(out2), len(out))                                # gap after the 2nd word is not a question gap
        a2 = np.concatenate([tone, gap(1.0), tone])
        o3, _ = tts.cap_pauses(a2, [("a?", 0.0, 1.0), ("b", 2.0, 3.0)], cap=0.25, q_cap=0.35)
        self.assertAlmostEqual(len(o3) / sr, 2.35, delta=0.03)               # a beat is kept after a question

    def test_cut_lines_cuts_inside_the_pause(self):
        import numpy as np
        from pipeline import voice_prepass as vp
        sr = 24000
        a = np.ones(sr * 4, np.float32)
        words = [("Hello", 0.0, 0.5), ("there", 0.6, 1.0), ("Next", 2.0, 2.5), ("line", 2.6, 3.0)]
        parts = vp.cut_lines(["Hello there.", "Next line."], a, sr, words)
        self.assertEqual([len(p[1]) for p in parts], [2, 2])
        self.assertAlmostEqual(len(parts[0][0]) / sr, 1.5, delta=0.01)     # cut midway through the 1.0-2.0 s silence
        self.assertAlmostEqual(parts[1][1][0][1], 0.5, delta=0.01)
        self.assertIsNone(vp.cut_lines(["Only one word."], a, sr, words))


if __name__ == "__main__":
    unittest.main()
