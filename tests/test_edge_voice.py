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

    def test_question_rate_is_slower(self):
        from pipeline import tts
        tts.EDGE_RATE_NOW = "+10%"
        self.assertEqual(tts.edge_rate_for(False), "+10%")
        self.assertEqual(tts.edge_rate_for(True), "+3%")


if __name__ == "__main__":
    unittest.main()
