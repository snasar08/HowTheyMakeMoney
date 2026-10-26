"""Checks that no code-drawn chart reaches into the caption dead zone (Sam saw captions covering
a Chipotle chart). Draws every chart scene of every script in each of its shot styles, fully
animated, and compares the dead-zone rows with the bare background.

  python -m pipeline.zone_check            # all scripts; exit 1 if any chart overlaps
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from .render import CAPTION_Y, ZONE_TOP, Renderer, Scene

ZONE = (ZONE_TOP, CAPTION_Y + 70)  # caption strip plus margin


def overlaps(img, bg) -> int:
    a = np.asarray(img.convert("RGB"), dtype=np.int16)[ZONE[0]:ZONE[1]]
    b = np.asarray(bg.convert("RGB"), dtype=np.int16)[ZONE[0]:ZONE[1]]
    return int((np.abs(a - b).max(axis=2) > 24).any(axis=1).sum())  # rows with chart pixels


def script_overlaps(s: dict) -> list[str]:
    """Problems for one script, e.g. ['scene 3 bars/zoom: 17 rows in caption zone']."""
    out = []
    r = Renderer(s, load_images=False)  # charts only; skips downloads
    for i, v in enumerate(sc["visual"] for sc in s["scenes"]):
        typ = v.get("type")
        if typ not in ("stat", "bars", "donut"):
            continue
        sc = Scene(narration="", visual=v)
        t = 60.0  # grid offset is 0 at t >= 50, so the background matches exactly
        alt = {"stat": r.shot_ticker, "donut": r.shot_waffle, "bars": r.shot_columns}[typ]
        shots = {"chart": {"stat": r.frame_stat, "bars": r.frame_bars, "donut": r.frame_donut}[typ](sc, t, 0),
                 "zoom": r.shot_chartzoom(sc, 0, 1.0),
                 "alt": alt(sc, None, 1, t, 1.0)}
        bg = r.live_bg(t)
        z = 1.16  # chartzoom at p=1 scales the background too; compare like with like
        zbg = bg.resize(bg.size, box=(bg.width * (1 - 1 / z) / 2, ZONE_TOP - ZONE_TOP / z,
                                      bg.width * (1 + 1 / z) / 2, ZONE_TOP - ZONE_TOP / z + bg.height / z))
        for name, img in shots.items():
            n = overlaps(img, zbg if name == "zoom" else bg)
            if n:
                out.append(f"scene {i + 1} {typ}/{name}: {n} rows in caption zone")
    return out


def main() -> int:
    bad = 0
    for p in sorted(Path("content/scripts").glob("0*.json")):
        for problem in script_overlaps(json.loads(p.read_text(encoding="utf-8"))):
            bad += 1
            print(f"{p.stem} {problem}")
    print("zone check:", "OK" if not bad else f"{bad} overlaps")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
