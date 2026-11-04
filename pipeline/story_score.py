"""Free story score (0-100): does a script hook fast, turn, and pay off?

  python -m pipeline.story_score                 # all ready scripts, weakest first
  python -m pipeline.story_score content/scripts/025-x.json ...

This checks structure against content/REELS.md and the shorts-craft guides. It can't predict views;
analytics/insights.md is the real test. 80+ is the bar for a rewritten script.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WPS = 2.55
TURN = re.compile(r"\b(but|until|except|instead|actually|not even|sounds|turns out|then|yet|still|just|only)\b", re.I)
HOOK = re.compile(r"\b(you|your|why|guess|what if|still|just|only|even)\b", re.I)
NUM = re.compile(r"\d[\d,.]*")


def score(s: dict) -> tuple[int, dict]:
    scenes = s.get("scenes", [])
    lines = [sc.get("narration", "") for sc in scenes]
    text = " ".join(lines)
    sents = [x for x in re.split(r"(?<=[.!?])\s+", text) if x.strip()]
    lens = [len(x.split()) for x in sents] or [99]
    first = lines[0] if lines else ""
    first_q = re.split(r"(?<=[?])\s+", first)[0]

    hook = 0  # 25: short, personal, with a concrete number or a contradiction
    hook += 10 if len(first_q.split()) <= 12 else 5 if len(first_q.split()) <= 15 else 0
    hook += 8 if HOOK.search(first) else 0
    hook += 7 if NUM.search(first) or re.search(r"\b(still|already|free|only|just|even|but)\b", first, re.I) else 0

    turns = sum(bool(TURN.search(x)) for x in lines[1:])  # 20: flips after the hook
    turn = min(20, turns * 7)

    nums = len(set(NUM.findall(text)))  # 15: a few numbers that land
    load = 15 if nums <= 4 else 10 if nums <= 5 else 5 if nums <= 6 else 0

    avg = sum(lens) / len(lens)  # 15: fragments
    pace = (9 if avg <= 7 else 6 if avg <= 9 else 3 if avg <= 11 else 0) + (6 if max(lens) <= 11 else 3 if max(lens) <= 14 else 0)

    spoken = text + " " + s.get("loop", "") + " " + s.get("cta", "Comment which brand we should do next, and subscribe.")
    sec = len(spoken.split()) / WPS + 0.4 * len(scenes)  # 15: about 25 s
    length = 15 if 20 <= sec <= 28 else 10 if sec <= 32 else 5 if sec <= 38 else 0

    end = (5 if s.get("loop") else 0) + (5 if s.get("cta_question") else 0)  # 10: loop + this-or-that
    parts = {"hook": hook, "turn": turn, "numbers": load, "pace": pace, "length": length, "ending": end}
    return sum(parts.values()), {**parts, "sec": round(sec, 1), "nums": nums}


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv] or sorted((ROOT / "content" / "scripts").glob("*.json"))
    rows = []
    for p in paths:
        s = json.loads(p.read_text(encoding="utf-8"))
        if argv or s.get("status") == "ready":
            total, parts = score(s)
            rows.append((total, p.stem, parts))
    for total, name, parts in sorted(rows, key=lambda r: r[0]):
        print(total, name, parts)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
