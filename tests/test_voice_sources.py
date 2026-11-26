import unittest


class FlowSources(unittest.TestCase):
    def test_default_source_stays_edge(self):
        from pipeline import tts
        self.assertIn("edge", tts.FLOW_SOURCES)
        self.assertIn("chatterbox", tts.FLOW_SOURCES)
        import os
        if not os.environ.get("VOICE_SOURCE"):
            self.assertEqual(tts.VOICE_SOURCE, "edge")

    def test_flow_cache_is_per_source(self):
        from pipeline import tts
        old = tts.VOICE_SOURCE
        try:
            tts.VOICE_SOURCE = "edge"
            a = tts.flow_path("Hello there.")
            tts.VOICE_SOURCE = "chatterbox"
            b = tts.flow_path("Hello there.")
            self.assertNotEqual(a, b)                      # an Edge clip is never served for the Chatterbox voice
            tts.CHATTERBOX_EXAG, old_e = "0.5", tts.CHATTERBOX_EXAG
            try:
                self.assertNotEqual(b, tts.flow_path("Hello there."))   # new settings -> new clip
            finally:
                tts.CHATTERBOX_EXAG = old_e
        finally:
            tts.VOICE_SOURCE = old

    def test_chatterbox_reads_whole_sentences_like_edge(self):
        from pipeline import tts
        long = "Then he dribbles past everyone, passes to a friend, and the whole crowd stands up and cheers for him all night long."
        old = tts.VOICE_SOURCE
        try:
            tts.VOICE_SOURCE = "chatterbox"
            self.assertEqual(len(tts.sentences(long)), 1)
        finally:
            tts.VOICE_SOURCE = old

    def test_groups_end_at_sentences_and_keep_every_word(self):
        from pipeline import voice_chatterbox as vc
        text = " ".join(f"Sentence number {i} has exactly seven words." for i in range(30))
        gs = vc.groups(text, limit=75)
        self.assertGreater(len(gs), 1)
        self.assertEqual(" ".join(gs).split(), text.split())
        self.assertTrue(all(g.endswith(".") for g in gs))
        self.assertTrue(all(len(g.split()) <= 75 for g in gs))

    def test_align_words_gives_every_script_word_a_timing(self):
        from pipeline import voice_chatterbox as vc, voice_prepass as vp
        text = "A penny costs 3.69 cents. Keep it? Pick one."
        # Whisper heard the number as two tokens
        heard = [("A", 0.0, 0.2), ("penny", 0.2, 0.6), ("costs", 0.6, 1.0), ("3", 1.0, 1.3), ("69", 1.3, 1.7),
                 ("cents", 1.7, 2.1), ("Keep", 2.6, 2.9), ("it", 2.9, 3.1), ("Pick", 3.6, 3.9), ("one", 3.9, 4.2)]
        w = vc.align_words(text, heard)
        self.assertEqual([x[0] for x in w], text.split())
        self.assertAlmostEqual(w[1][1], 0.2)
        self.assertTrue(all(w[i][1] <= w[i][2] for i in range(len(w))))
        self.assertTrue(all(w[i][2] <= w[i + 1][1] + 1e-6 for i in range(len(w) - 1)))
        # and the one-call read can be cut back into its lines
        import numpy as np
        a = np.zeros(int(4.5 * 24000), np.float32)
        parts = vp.cut_lines(["A penny costs 3.69 cents.", "Keep it?", "Pick one."], a, 24000, w)
        self.assertIsNotNone(parts)
        self.assertEqual(len(parts), 3)


if __name__ == "__main__":
    unittest.main()
