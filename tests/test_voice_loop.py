"""The Gemini quality loop in pipeline/voice_prepass.py (Nov 26): takes, retake hints, quota stop, fallback, report.
No network: gemini_stream, voice_check.check/polish/best and edge_stream are replaced."""
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import mock

import numpy as np

from pipeline import gemini_tts, tts, voice_prepass as vp

LINES = ["Hello there friend.", "Second line goes here."]
SR = 24000


def rep(ok=True, score=90.0, hard=(), soft=(), hint=""):
    return NS(ok=ok, score=score, hard=list(hard), soft=list(soft), metrics={"score": score}, hint=hint)


def heard_for(lines, per=0.4, gap=0.3):
    out, t = [], 0.0
    for ln in lines:
        for w in ln.split():
            out.append({"word": " " + w, "start": t, "end": t + per})
            t += per
        t += gap
    return out, t


def fake_stream(styles, results=None):
    """gemini_stream stand-in: records the style of every call; `results` items may be exceptions."""
    results = list(results or [])

    def f(text, style=None):
        styles.append(style)
        r = results.pop(0) if results else None
        if isinstance(r, Exception):
            raise r
        heard, total = heard_for(LINES)
        return np.zeros(int(total * SR), np.float32) + 0.01, SR, heard
    return f


class Base(unittest.TestCase):
    def setUp(self):
        self.vc = sys.modules.get("pipeline.voice_check")
        if self.vc is None:
            try:
                from pipeline import voice_check as vc
                self.vc = vc
            except ImportError:   # the checker module is not there yet: a stand-in so these tests still run
                self.vc = types.ModuleType("pipeline.voice_check")
                sys.modules["pipeline.voice_check"] = self.vc
                import pipeline
                pipeline.voice_check = self.vc
                self.addCleanup(lambda: (sys.modules.pop("pipeline.voice_check", None), delattr(pipeline, "voice_check")))
        self.reports = []
        self.checks = 0

        def check(a, sr, lines, heard=None):
            r = self.reports[min(self.checks, len(self.reports) - 1)]
            self.checks += 1
            return r
        self.patches = [
            mock.patch.object(self.vc, "check", check, create=True),
            mock.patch.object(self.vc, "polish", lambda a, sr: (a, 0.0), create=True),
            mock.patch.object(self.vc, "best", lambda reps: max(range(len(reps)), key=lambda i: (reps[i].ok, reps[i].score)), create=True),
            mock.patch.object(self.vc, "to_markdown", lambda sid, reps, chosen, engine: f"| {sid} | {engine} | {len(reps)} |", create=True),
            mock.patch.dict(os.environ, {"VOICE_MAX_TAKES": "3", "VOICE_GOOD": "85"}),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)


class Loop(Base):
    def run_loop(self, reports, results=None):
        self.reports = reports
        styles = []
        with mock.patch.object(vp, "gemini_stream", fake_stream(styles, results)):
            try:
                return vp.gemini_takes(LINES), styles
            except vp.VoiceCheckFailed as e:
                return e, styles

    def test_stops_early_on_a_good_take(self):
        res, styles = self.run_loop([rep(True, 91)])
        self.assertEqual(len(styles), 1)
        self.assertEqual(res["chosen"], 0)
        self.assertEqual(len(res["pieces"]), len(LINES))

    def test_retakes_up_to_max_with_the_hint(self):
        res, styles = self.run_loop([rep(True, 60, soft=["flat"], hint="more energy"), rep(True, 70, hint="slower numbers"), rep(True, 65, hint="x")])
        self.assertEqual(len(styles), 3)                       # VOICE_MAX_TAKES = 3, never a 4th request
        self.assertIsNone(styles[0])
        self.assertEqual(styles[1], gemini_tts.STYLE + " more energy")
        self.assertEqual(styles[2], gemini_tts.STYLE + " slower numbers")
        self.assertEqual(res["chosen"], 1)                     # best() picks the highest score

    def test_max_takes_env(self):
        with mock.patch.dict(os.environ, {"VOICE_MAX_TAKES": "2"}):
            _res, styles = self.run_loop([rep(True, 50, hint="h")])
        self.assertEqual(len(styles), 2)

    def test_quota_error_stops_retakes(self):
        res, styles = self.run_loop([rep(True, 60, hint="h")], results=[None, RuntimeError("gemini-x: quota exceeded for the day")])
        self.assertEqual(len(styles), 2)                       # the failed retake is the last request
        self.assertEqual(res["chosen"], 0)                     # the first (ok) take is kept

    def test_first_take_error_raises(self):
        self.reports = [rep()]
        with mock.patch.object(vp, "gemini_stream", fake_stream([], [RuntimeError("quota")])):
            with self.assertRaises(RuntimeError):
                vp.gemini_takes(LINES)

    def test_all_bad_raises_with_reports(self):
        res, styles = self.run_loop([rep(False, 30, hard=["clipping"], hint="h")])
        self.assertIsInstance(res, vp.VoiceCheckFailed)
        self.assertEqual(len(res.reports), 3)
        self.assertEqual(len(styles), 3)


class Fallback(Base):
    """edge_pass end to end with the cache in a temp dir: bad Gemini -> Edge Andrew, report json written."""

    def run_pass(self, reports, stream_results=None):
        self.reports = reports
        tmp = tempfile.mkdtemp()
        self.addCleanup(__import__("shutil").rmtree, tmp, True)
        sid = sorted(p.name for p in (vp.ROOT / "content" / "scripts").glob("*.json"))[0].split("-")[0]
        script = json.loads(next((vp.ROOT / "content" / "scripts").glob(f"{sid}*.json")).read_text(encoding="utf-8"))
        lines = [tts.speakable(x) for x in vp.lines_for(script) if x.strip()]
        lines = list(dict.fromkeys(lines))
        styles = []

        def stream(text, style=None):
            styles.append(style)
            heard, total = [], 0.0
            for ln in lines:
                for w in ln.split():
                    heard.append({"word": " " + w, "start": total, "end": total + 0.3})
                    total += 0.3
                total += 0.25
            return np.zeros(int(total * SR), np.float32) + 0.01, SR, heard

        def edge(text, rate, voice=None, pitch=None):
            words, t = [], 0.0
            for ln in lines:
                for w in ln.split():
                    words.append((w, t, t + 0.3))
                    t += 0.3
                t += 0.25
            return np.zeros(int(t * SR), np.float32) + 0.01, SR, words
        sf = types.ModuleType("soundfile")
        sf.write = lambda path, a, sr: Path(path).write_bytes(b"RIFF")
        env = {"GEMINI_API_KEY": "test", "ELEVENLABS_API_KEY": ""}
        with mock.patch.object(tts, "VOICE_CACHE", tmp), mock.patch.object(tts, "VOICE_SOURCE", "geminiflow"), \
                mock.patch.dict(os.environ, env), mock.patch.dict(sys.modules, {"soundfile": sf, "whisper": None}), \
                mock.patch.object(vp, "gemini_stream", stream), mock.patch.object(vp, "edge_stream", edge), \
                mock.patch.object(vp, "problems", lambda *a, **k: []):
            vp.edge_pass([sid])
        return Path(tmp), sid, styles

    def test_all_bad_falls_back_to_edge_and_writes_report(self):
        tmp, sid, styles = self.run_pass([rep(False, 20, hard=["clipping"], hint="h")])
        self.assertEqual(len(styles), 3)
        data = json.loads((tmp / f"report-{sid}.json").read_text(encoding="utf-8"))
        self.assertEqual(data["engine"], "edge")
        self.assertEqual(len(data["takes"]), 4)               # 3 Gemini takes + the Edge read
        self.assertEqual(data["chosen"], 3)
        self.assertTrue((tmp / f"report-{sid}.md").exists())

    def test_good_gemini_is_kept_and_reported(self):
        tmp, sid, styles = self.run_pass([rep(True, 95)])
        self.assertEqual(len(styles), 1)
        data = json.loads((tmp / f"report-{sid}.json").read_text(encoding="utf-8"))
        self.assertEqual((data["engine"], data["chosen"], len(data["takes"])), ("gemini", 0, 1))

    def test_step_summary_gets_the_table(self):
        summ = Path(tempfile.mkdtemp()) / "summary.md"
        with mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summ)}):
            self.run_pass([rep(True, 95)])
        self.assertIn("gemini", summ.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
