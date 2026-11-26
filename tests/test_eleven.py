import base64
import json
import os
import tempfile
import unittest
from unittest import mock

import numpy as np

from pipeline import eleven, tts, voice_prepass


def alignment(text, step=0.1):
    return {"characters": list(text), "character_start_times_seconds": [i * step for i in range(len(text))],
            "character_end_times_seconds": [(i + 1) * step for i in range(len(text))]}


class Alignment(unittest.TestCase):
    def test_words_from_alignment(self):
        w = eleven.words_from_alignment(alignment("Hi there. Go!"))
        self.assertEqual([x[0] for x in w], ["Hi", "there.", "Go!"])
        self.assertAlmostEqual(w[0][1], 0.0)
        self.assertAlmostEqual(w[0][2], 0.2)      # "Hi" = chars 0-1
        self.assertAlmostEqual(w[1][1], 0.3)      # after the space
        self.assertAlmostEqual(w[2][2], 1.3)

    def test_words_match_script_split(self):
        text = "Keep the penny or leave it? Pick one."
        self.assertEqual([x[0] for x in eleven.words_from_alignment(alignment(text))], text.split())

    def test_bad_alignment(self):
        with self.assertRaises(eleven.ElevenError):
            eleven.words_from_alignment({"characters": ["a"], "character_start_times_seconds": [], "character_end_times_seconds": []})


class CacheKey(unittest.TestCase):
    def test_stable_and_sensitive(self):
        a = eleven.cache_key("Hello there.")
        self.assertEqual(a, eleven.cache_key("Hello there."))
        self.assertNotEqual(a, eleven.cache_key("Hello there"))
        self.assertNotEqual(a, eleven.cache_key("Hello there.", voice=eleven.VOICES["brian"]))
        self.assertNotEqual(a, eleven.cache_key("Hello there.", model="eleven_turbo_v2_5"))
        self.assertNotEqual(a, eleven.cache_key("Hello there.", vs={**eleven.settings(), "speed": 1.0}))

    def test_key_never_in_cache_key_or_file(self):
        with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "sk_secret_value"}):
            self.assertNotIn("sk_secret_value", eleven.cache_key("x"))
            with tempfile.TemporaryDirectory() as d, mock.patch.object(eleven, "_request", side_effect=fake_api(10_000)):
                eleven.synth("Hi there.", d)
                for f in os.listdir(d):
                    self.assertNotIn("sk_secret_value", open(os.path.join(d, f), encoding="utf-8").read())

    def test_env_defaults(self):
        with mock.patch.dict(os.environ, {"ELEVEN_VOICE_ID": "", "ELEVEN_MODEL": "", "ELEVEN_SPEED": ""}):
            self.assertEqual(eleven.voice_id(), "pNInz6obpgDQGcFmaJgB")
            self.assertEqual(eleven.model_id(), "eleven_multilingual_v2")
            self.assertEqual(eleven.settings()["speed"], 1.1)
        with mock.patch.dict(os.environ, {"ELEVEN_VOICE_ID": "brian"}):
            self.assertEqual(eleven.voice_id(), "nPczCjzI2devNBz1zQrb")

    def test_voice_source_follows_key(self):
        import importlib
        try:
            with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "k", "VOICE_SOURCE": ""}):
                self.assertEqual(importlib.reload(tts).VOICE_SOURCE, "eleven")
            with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "k", "VOICE_SOURCE": "gemini"}):
                self.assertEqual(importlib.reload(tts).VOICE_SOURCE, "gemini")
            with mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "", "VOICE_SOURCE": ""}):
                self.assertEqual(importlib.reload(tts).VOICE_SOURCE, "edge")
        finally:
            importlib.reload(tts)


def fake_api(left, post=None, calls=None):
    def f(method, url, body=None, timeout=0):
        if calls is not None:
            calls.append((method, url))
        if method == "GET":
            return {"character_limit": 30000, "character_count": 30000 - left}
        if post:
            raise post
        return {"audio_base64": base64.b64encode(b"mp3").decode(), "alignment": alignment(body["text"])}
    return f


class Synth(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {"ELEVENLABS_API_KEY": "k"})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_second_call_is_free(self):
        calls = []
        with tempfile.TemporaryDirectory() as d, mock.patch.object(eleven, "_request", side_effect=fake_api(5000, calls=calls)):
            mp3, words, used, cached = eleven.synth("Hi there.", d)
            self.assertEqual((mp3, used, cached, len(words)), (b"mp3", 9, False, 2))
            n = len(calls)
            mp3, words, used, cached = eleven.synth("Hi there.", d)
            self.assertEqual((used, cached, len(calls)), (0, True, n))   # no API call at all

    def test_too_few_characters_left(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(eleven, "_request", side_effect=fake_api(3)):
            with self.assertRaises(eleven.ElevenError):
                eleven.synth("Hi there.", d)

    def test_api_error_raises(self):
        err = eleven.ElevenError("HTTP 429 too many")
        err.status = 429
        with tempfile.TemporaryDirectory() as d, mock.patch.object(eleven, "_request", side_effect=fake_api(5000, post=err)):
            with self.assertRaises(eleven.ElevenError):
                eleven.synth("Hi there.", d)
            self.assertEqual(os.listdir(d), [])      # nothing cached from a failed call


class Fallback(unittest.TestCase):
    def run_pass(self, eleven_fn):
        def edge(text, rate, voice=None, pitch=None):
            ws = []
            for i, w in enumerate(text.split()):
                ws.append((w, i * 0.3, i * 0.3 + 0.25))
            return np.zeros(int(24000 * (len(ws) * 0.3 + 0.5)), np.float32), 24000, ws
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(tts, "VOICE_CACHE", d), mock.patch.object(tts, "VOICE_SOURCE", "eleven"), \
                mock.patch.object(voice_prepass, "eleven_stream", side_effect=eleven_fn), \
                mock.patch.object(voice_prepass, "edge_stream", side_effect=edge) as es, \
                mock.patch.dict("sys.modules", {"whisper": None}):
            rc = voice_prepass.edge_pass(["094"])
            files = [f for f in os.listdir(d) if f.endswith(".wav")]
            return rc, files, es.call_count

    def test_error_falls_back_to_edge(self):
        for status in ("HTTP 401", "HTTP 429", "quota exceeded"):
            def boom(*a, **k):
                raise eleven.ElevenError(status)
            rc, files, edge_calls = self.run_pass(boom)
            self.assertEqual(rc, 0)
            self.assertGreaterEqual(len(files), 1)
            self.assertGreaterEqual(edge_calls, 1)

    def test_eleven_used_when_it_works(self):
        def ok(text, voice=None):
            ws = [(w, i * 0.3, i * 0.3 + 0.25) for i, w in enumerate(text.split())]
            return np.zeros(24000 * 60, np.float32), 24000, ws, len(text)
        rc, files, edge_calls = self.run_pass(ok)
        self.assertEqual((rc, edge_calls), (0, 0))
        self.assertGreaterEqual(len(files), 1)


if __name__ == "__main__":
    unittest.main()
