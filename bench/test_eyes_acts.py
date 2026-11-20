"""Offline test of the eyes ACT CHECK (no network): python bench/test_eyes_acts.py"""
import json, os, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import eyes

shots = [{"a": 0, "n": 60}, {"a": 60, "n": 50, "act": {"kind": "shoot"}}, {"a": 110, "n": 40, "act": {"kind": "shoot"}},
         {"a": 150, "n": 50}, {"a": 200, "n": 45, "act": {"kind": "sign_contract"}}, {"a": 245, "n": 55, "act": {"kind": "weird_new"}}]
acts = eyes.acts_from_shots(shots)
assert acts == [{"kind": "shoot", "a": 60, "b": 149}, {"kind": "sign_contract", "a": 200, "b": 244}, {"kind": "weird_new", "a": 245, "b": 299}], acts
assert eyes.acts_from_shots(shots, 600)[0] == {"kind": "shoot", "a": 120, "b": 299}   # scaled when the video length differs
txt = eyes.act_text(acts)
assert "frames 60-149 (shoot)" in txt and "SHOOTING a basketball" in txt and "weird new" in txt

# plan file lookup: <video>.acts.json and toonplans/<stem>.json (props shape {"ah": {"shots": [...]}})
with tempfile.TemporaryDirectory() as d:
    v = Path(d) / "001-x.mp4"
    assert eyes.load_acts(v) == []
    Path(d, "001-x.mp4.acts.json").write_text(json.dumps({"ah": {"shots": shots}}))
    assert len(eyes.load_acts(v)) == 3

# fake Gemini reply: one clear, one unclear, one missing (out of order and string bool)
reply = {"score": 7, "problems": [], "acts": [
    {"kind": "sign_contract", "frames": "200-244", "clear": "false", "why": "he just stands next to a paper"},
    {"kind": "shoot", "frames": "60-149", "clear": True, "why": "ball goes through"}]}
vs = eyes.parse_acts(reply, acts)
assert [v["clear"] for v in vs] == [True, False, None], vs
assert eyes.act_blockers(vs) == ["act sign_contract unclear at frames 200-244: he just stands next to a paper"]
r = {"score": 7, "model": "fake", "problems": [], "acts": vs}
os.environ.pop("EYES", None)
assert eyes.report("t", r) == ["act sign_contract unclear at frames 200-244: he just stands next to a paper"]   # held
os.environ["EYES"] = "warn"
assert eyes.report("t", r) == []                                                                              # warn only
os.environ.pop("EYES")
# no act verdicts at all: no crash, warn, no hold
for bad in ({}, {"acts": "nope"}, {"acts": [1, None]}, None):
    vs = eyes.parse_acts(bad, acts)
    assert all(v["clear"] is None for v in vs) and eyes.act_blockers(vs) == []
assert eyes.report("t", {"score": 8, "acts": eyes.parse_acts({}, acts)}) == []
assert eyes.report("t", {"score": 8}) == []   # old replies without acts unchanged
print("eyes acts: all OK")
