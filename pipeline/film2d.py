"""Flat 2D silent films (Nov 19, Sam: "replicate almost exactly ... the sound the music the look the movement").

Same idea as pipeline/film.py (beats -> frames -> mp4, synthesized music + sound effects, no voice) but the picture is the
flat 2D look (toon composition Film2D, toon/src/videos/film2d/). A film is content/films2d/NNN-slug.json:

  {"id": "...", "title": "...", "cast": {"hero": {...look}, "voice": {"monster": true}},
   "beats": [{"s": 4.0, "set": "bedroom", "arg": {...}, "cam": {"from": [x, y, zoom], "to": [...]},
              "chars": [{"look": "hero", "x": 720, "pose": "lie", "bed": true, "expr": "sleep"}],
              "things": [{"name": "alarm", "x": 640, "y": 360, "s": 3, "text": "5:00", "v": 1}],
              "say": "Every day started the same." | [{"t": "...", "red": true, "at": "mid", "delay": 1.0}],
              "card": {"big": "DAY 1."}, "day": "DAY 12", "hud": {...}, "sfx": [["alarm", 0.2]],
              "fade": 15, "fadeOut": 10, "sat": [1, 0.2], "shake": [[0.3, 8]], "flash": [0.1], "scroll": [0, 600], "mood": "sunrise"}]}

  python -m pipeline.film2d plan  content/films2d/001-x.json out/props.json
  python -m pipeline.film2d make  content/films2d/001-x.json frames/ out/film.mp4
  python -m pipeline.film2d thumb content/films2d/001-x.json out/thumb_props.json [k]
  python -m pipeline.film2d table content/films2d/001-x.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from pipeline import film as F

FPS = 30
KEYS = ("set", "arg", "cam", "things", "fade", "fadeOut", "sat", "shake", "flash", "scroll", "dark")


def plan(film: dict) -> dict:
    cast = film.get("cast", {})
    shots, lines, cards, days, huds = [], [], [], [], []
    a = 0
    for b in film["beats"]:
        n = int(round(b["s"] * FPS))
        shot = {"a": a, "n": n, **{k: b[k] for k in KEYS if k in b}}
        chars = []
        for c in b.get("chars", []):
            c = dict(c)
            if isinstance(c.get("look"), str):
                c["look"] = cast.get(c["look"], {})
            chars.append(c)
        shot["chars"] = chars
        shots.append(shot)
        say = b.get("say")
        if isinstance(say, str):
            say = [{"t": say}]
        say = say or []
        for i, s in enumerate(say):
            if "delay" in s:
                k0 = a + int(round(s["delay"] * FPS))
                k1 = a + int(round(s["until"] * FPS)) if "until" in s else a + n - 2
            else:
                k0 = a + 6 + (n * i) // len(say)
                k1 = a + (n * (i + 1)) // len(say) - 2
            ln = {"a": k0, "n": max(20, k1 - k0), "t": s["t"]}
            for k in ("red", "at", "size", "cps"):
                if k in s:
                    ln[k] = s[k]
            lines.append(ln)
        if b.get("card"):
            cards.append({"a": a, "n": n, **b["card"]})
        if b.get("day"):
            if days and days[-1]["t"] == b["day"] and days[-1]["a"] + days[-1]["n"] == a:
                days[-1]["n"] += n
            else:
                days.append({"a": a, "n": n, "t": b["day"]})
        if b.get("hud"):
            huds.append({"a": a, "n": n, **b["hud"]})
        a += n
    return {"d2": {"shots": shots, "film": {"lines": lines, "cards": cards, "day": days, "hud": huds}}, "split": split(film["beats"])}


def split(beats: list, shards: int = 20) -> list:
    """2D frames cost about the same everywhere (black cards a bit less): weight cards 0.6"""
    cost = []
    for b in beats:
        cost += [0.6 if b.get("card") else 1.0] * int(round(b["s"] * FPS))
    tot, acc, out, k = sum(cost), 0.0, [0], 1
    for i, c in enumerate(cost):
        acc += c
        while k < shards and acc >= tot * k / shards:
            out.append(i + 1); k += 1
    while len(out) < shards:
        out.append(len(cost))
    out.append(len(cost))
    return out


def plan_thumb(film: dict, k: int = 0) -> dict:
    th = film["thumbs"][k]
    p = plan({**film, "beats": [{"s": 1.0, **th["beat"]}]})
    p["d2"]["film"] = {"thumb": {"words": th["words"], "red": th.get("red", []), "pos": th.get("pos", "tl")}}
    return p


def table(film: dict) -> str:
    out, t = [], 0.0
    for i, b in enumerate(film["beats"]):
        say = b.get("say")
        say = say if isinstance(say, str) else " / ".join(("[red] " if s.get("red") else "") + s["t"] for s in (say or []))
        if b.get("card"):
            say = "CARD " + " | ".join(str(b["card"].get(k, "")) for k in ("big", "line", "cmd"))
        who = ",".join(f'{c.get("look", "?") if isinstance(c.get("look"), str) else "?"}:{c.get("pose", "stand")}' for c in b.get("chars", []))
        out.append(f"{i:02d} {t:6.1f}s {b['s']:4.1f}s {b['set']:<10} {b.get('day', ''):<8} {who:<26} {say}")
        t += b["s"]
    out.append(f"total {t:.1f} s ({int(t // 60)}:{int(t % 60):02d}), {len(film['beats'])} beats")
    return "\n".join(out)


if __name__ == "__main__":
    cmd, src = sys.argv[1], sys.argv[2]
    f = F.load(src)
    if cmd == "plan":
        Path(sys.argv[3]).parent.mkdir(parents=True, exist_ok=True)
        Path(sys.argv[3]).write_text(json.dumps(plan(f)), encoding="utf-8")
        print(table(f))
    elif cmd == "make":
        F.make(f, sys.argv[3], sys.argv[4])
    elif cmd == "audio":
        F.write_wav(F.audio(f), sys.argv[3])
    elif cmd == "thumb":
        Path(sys.argv[3]).write_text(json.dumps(plan_thumb(f, int(sys.argv[4]) if len(sys.argv) > 4 else 0)), encoding="utf-8")
    elif cmd == "table":
        print(table(f))
