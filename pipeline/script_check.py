"""Script craft checker: scores how a script READS and SOUNDS (0-100), separate from pipeline.lint (schema/safety).

  python -m pipeline.script_check                      # every ready script, weakest first
  python -m pipeline.script_check content/scripts/119-plan-nike.json ...
  python -m pipeline.script_check --min 75 --all       # exit 1 if any script scores under 75 (any status)

Checks (what analytics/retention.md says costs viewers, see content/WRITER_GUIDE.md section 2):
  hook words (<= 9), banned openers, long lines (> 14 words), runs of tiny fragments, abstract lines with nothing
  to draw, a missing open loop / `loop` line, title <= 50 chars, numbers said but not in description / sources.
The weekly routine runs this and rewrites anything under SCORE_BAR.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK_MAX = 9
LINE_MAX = 14
FRAG_MAX = 4          # a sentence of 1-4 words is a fragment
TITLE_MAX = 50
SCORE_BAR = 75

BANNED_OPENERS = re.compile(
    r"^\s*(guess (how|what|who)|how (did|do|does|is|are|come|can|could|would)\b|why (did|do|does|is|are)\b|"
    r"what if\b.*\b(isn'?t|is not|aren'?t)\b|did you know|have you ever|ever wonder|let'?s talk|today we|in this (video|short))", re.I)
TURN_START = re.compile(r"^\s*(but|now|then|so|yet|still|until|and|except|instead|because|turns out|that)\b", re.I)
SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'$0-9])")
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")

# Concrete, drawable nouns (the 3D library draws these). A line with none of these, no number, no name,
# and no toon thing/card/brand has nothing to show.
DRAW = set("""shoe sneaker chip gpu cash coin gold trophy medal crown ring car bus truck rocket phone laptop tv monitor clock book
letter newspaper briefcase shovel box crate basketball football soccer ball hoop mic headset controller burger pizza coffee
plant robot drone satellite globe house factory stadium plane yacht chart lightbulb lock key heart bomb fire camera chatbot
glasses dumbbell dome console golf horse baseball guitar rollercoaster noodle ramen lego eiffel store shop restaurant court
field pitch rink gym garage office mansion bank studio stage school classroom team game player coach fan crowd kid teenager
teen dad mom mother father brother sister contract deal check cheque card jersey shirt hoodie hat cap watch bag home
apartment room desk door wall street road track race goal shot dunk basket net bench locker video channel stream streamer
screen app website server worker cashier customer fries soda drink cake bread cream donut candy chocolate sandwich dog bike
board skateboard mountain beach pool island city town money dollar million billion trillion euro pound percent salary
paycheck bill price tag sign song album concert piano drum movie film episode pen paper bed pillow boot sock pant dress tie
suit helmet bat glove racket racquet club puck stick skate bottle can cup glass plate train boat ship airport flight seat
ticket arena league season draft pick rookie tournament final wall sun moon star rock river bridge tower ad poster
photo picture mask cap tooth hair""".split())
ABSTRACT_ONLY = re.compile(r"\b(success|legacy|dream|dreams|journey|believe|belief|mindset|future|vision|passion|hustle|"
                           r"growth|innovation|value|strategy|potential|opportunity|everything changes|changes everything|"
                           r"never the same|the rest is history|big things)\b", re.I)


def sentences(text: str) -> list[str]:
    return [x.strip() for x in SENT.split(text.strip()) if x.strip()]


def wc(s: str) -> int:
    return len(re.findall(r"[A-Za-z0-9$%][\w'.,$%-]*", s))


def all_sentences(s: dict) -> list[tuple[int, int, str, dict]]:
    """(scene idx, sentence idx, text, toon dict or {}) using the same split the toon list is counted with."""
    out = []
    for i, sc in enumerate(s.get("scenes", [])):
        ss = sentences(sc.get("narration", ""))
        toon = sc.get("toon") or []
        for j, t in enumerate(ss):
            d = toon[j] if len(toon) == len(ss) and isinstance(toon[j], dict) else {}
            out.append((i, j, t, d))
    return out


def _stem(w: str) -> str:
    w = w.lower().strip("'")
    for suf in ("'s", "es", "s"):
        if w.endswith(suf) and w[: -len(suf)] in DRAW:
            return w[: -len(suf)]
    return w


def drawable(sent: str, toon: dict) -> bool:
    if toon and (toon.get("things") or toon.get("card") or toon.get("brand") or toon.get("who")):
        return True
    if NUM.search(sent):
        return True
    words = re.findall(r"[A-Za-z']+", sent)
    if any(_stem(w) in DRAW for w in words):
        return True
    # a proper name in the middle of the line (Nike, Jordan, Wembanyama) can be drawn as a person or a sign
    return any(w[0].isupper() and k > 0 and w not in ("I", "I'm", "I'll") for k, w in enumerate(words))


def numbers_of(text: str) -> set[str]:
    return {n.replace(",", "").rstrip(".") for n in NUM.findall(text)}


def check(s: dict) -> tuple[int, list[str]]:
    issues: list[str] = []
    pen = 0
    sents = all_sentences(s)
    if not sents:
        return 0, ["no narration"]
    first = sents[0][2]
    fw = wc(first)
    if fw > HOOK_MAX:
        pen += min(25, 5 + 4 * (fw - HOOK_MAX))
        issues.append(f"hook is {fw} words (max {HOOK_MAX}): {first[:70]}")
    if BANNED_OPENERS.search(first):
        pen += 25
        issues.append(f"banned opener: {first[:60]}")
    if "?" in first and not NUM.search(first):
        pen += 6
        issues.append("opening question has no number in it")
    # open loop: line 2 turns or asks (or the hook itself asks)
    if len(sents) > 1 and not TURN_START.search(sents[1][2]) and "?" not in sents[1][2] and "?" not in first:
        pen += 8
        issues.append(f"line 2 opens no gap (start it with But/Now/Then or ask): {sents[1][2][:60]}")
    longs = [t for _, _, t, _ in sents if wc(t) > LINE_MAX]
    if longs:
        pen += min(15, 5 * len(longs))
        issues.append(f"{len(longs)} line(s) over {LINE_MAX} words, e.g. {longs[0][:70]}")
    run, runs = 0, 0
    for _, _, t, _ in sents:
        run = run + 1 if wc(t) <= FRAG_MAX else 0
        if run == 2:
            runs += 1
    if runs:
        pen += min(15, 6 * runs)
        issues.append(f"{runs} run(s) of tiny fragments (2+ lines of {FRAG_MAX} words or fewer in a row)")
    dull = [t for _, _, t, d in sents
            if not (t.endswith("?") and wc(t) <= 6)      # "Still not enough?" is a turn line, not a picture
            and (not drawable(t, d) or (ABSTRACT_ONLY.search(t) and not NUM.search(t) and not d.get("things")))]
    if dull:
        pen += min(18, 6 * len(dull))
        issues.append(f"{len(dull)} abstract line(s) with nothing to draw, e.g. {dull[0][:70]}")
    loop = (s.get("loop") or "").strip()
    if not loop:
        pen += 15
        issues.append("no `loop` line")
    elif not re.search(r"[:,-]\s*$", loop):
        pen += 6
        issues.append("`loop` should end on a lead-in (colon or comma) that runs into line 1")
    title = s.get("title", "")
    if len(title) > TITLE_MAX:
        pen += 8
        issues.append(f"title is {len(title)} chars (max {TITLE_MAX})")
    said = numbers_of(" ".join(t for _, _, t, _ in sents) + " " + loop)
    src = " ".join(f"{x.get('title', '')} {x.get('url', '')}" for x in s.get("sources", []))
    known = numbers_of(" ".join([s.get("description", ""), title, src, json.dumps(s.get("notes", ""))]))
    stray = sorted(n for n in said - known if n not in {"1", "2", "3", "4", "5"})
    if stray:
        pen += min(15, 5 * len(stray))
        issues.append(f"numbers said but not in description/sources: {', '.join(stray)}")
    return max(0, 100 - pen), issues


def main(argv: list[str]) -> int:
    mn = None
    args = []
    it = iter(argv)
    for a in it:
        if a == "--min":
            mn = int(next(it))
        elif not a.startswith("--"):
            args.append(a)
    bar = mn if mn is not None else SCORE_BAR
    paths = [Path(a) for a in args] or sorted((ROOT / "content" / "scripts").glob("*.json"))
    rows = []
    for p in paths:
        s = json.loads(p.read_text(encoding="utf-8"))
        if args or "--all" in argv or s.get("status") in ("ready", "needs_fix"):
            rows.append((*check(s), p.stem))
    low = 0
    for sc, issues, name in sorted(rows, key=lambda r: r[0]):
        low += sc < bar
        print(f"{'LOW ' if sc < bar else 'ok  '}{sc:3d} {name}")
        for i in issues:
            print(f"        - {i}")
    print(f"[script_check] {len(rows)} checked, {low} under {bar}")
    return 1 if (mn is not None and low) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
