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

Sound (pipeline/score2d.py, all synthesized, mastered to -16.5 LUFS / -1 dBTP, 48 kHz stereo; no voice):
  film key "grid": 0.625        snap every cut to the 96 BPM beat grid (2 beats = 1.25 s, bar = 2.5 s)
  beat "music": "drone" quiet pad+sub | "tick" clock 0.5 s -> 0.25 s | "pulse96" sparse piano + sub | "montage" loud kick+hats |
                "slam" pulse + slam on entry | "finale" piano arpeggio on every beat | "title" boom + held chord | "silent"
                (no key = keeps the previous section; "mood" words or a "card" with "big" can pick one, see score2d.MOOD_TAG)
  beat "sfx": [["alarm", 0.2], ["punch", 1.25], ["riser", 2.0, {"len": 2}], ["coin", 0.5, 0.8]]  name, seconds into beat, loudness or options;
                riser/punch/swish land ON the offset. Names: alarm tick ticks boom kick swish thud hit punch ping buzz ring lowbatt
                powerdown riser slam steps whoosh page bounce crowd coin register heart bell duck
  beat "flash": [0.1]           each flash gets 0.3 s silence then a broadband slam + sub hit

New (Nov 19) optional fields, all documented in toon/src/videos/film2d/Film2D.tsx and sets.tsx:
  say entry: "white": true (white bold pop line), "bold": true (bold spotlight line), "shatter": true | seconds (letters break apart)
  card: "tagAt" / "cmdAt" seconds (tagline / end line time), "fs" title size
  beat: "grade": "sunset" | "rain"; arg: punch (cycle seconds), embers, emberSpeed, burst, burstX, burstY, burstN, gradeAmt
  sets: "fridge" (arg open, x), "calendar" (arg start, cross, crossDt, crossT0, today, days); couch arg nolamp; mirror args tint, tintHue

  python -m pipeline.film2d audio content/films2d/NNN.json out.wav     # sound only (prints loudness)
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
from pipeline import score2d as S

FPS = 30
KEYS = ("set", "arg", "cam", "things", "fade", "fadeOut", "sat", "shake", "flash", "scroll", "dark", "grade")


def plan(film: dict) -> dict:
    cast = film.get("cast", {})
    film = S.prepare(film)
    shots, lines, cards, days, huds = [], [], [], [], []
    a = 0
    ns = frame_counts(film["beats"])
    for b, n in zip(film["beats"], ns):
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
            for k in ("red", "white", "bold", "shatter", "at", "size", "cps"):
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


def frame_counts(beats: list) -> list:
    """frames per beat, rounded on the running total so 1.25 s shots do not drift away from the music"""
    out, t, a = [], 0.0, 0
    for b in beats:
        t += b["s"]
        n = int(round(t * FPS)) - a
        out.append(n)
        a += n
    return out


def split(beats: list, shards: int = 20) -> list:
    """2D frames cost about the same everywhere (black cards a bit less): weight cards 0.6"""
    cost = []
    for b, n in zip(beats, frame_counts(beats)):
        cost += [0.6 if b.get("card") else 1.0] * n
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
        F.make(f, sys.argv[3], sys.argv[4], loudnorm=False, audio_fn=S.audio, write_fn=S.write_wav)
    elif cmd == "audio":
        x = S.audio(f)
        S.write_wav(x, sys.argv[3])
        S.report(x, sys.argv[3])
    elif cmd == "thumb":
        Path(sys.argv[3]).write_text(json.dumps(plan_thumb(f, int(sys.argv[4]) if len(sys.argv) > 4 else 0)), encoding="utf-8")
    elif cmd == "table":
        print(table(f))
