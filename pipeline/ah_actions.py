"""ah_actions - choose the 3D character pose for one sentence of a story script.

    pick_pose(line, things, mood, action, place, prev) -> pose name

Poses: existing  stand sit cheer wave point walk dig shrug
       new       jump dunk run dribble shoot throw type eat talk phone count dance fistpump
                 fall facepalm think sleep

Priority (first rule that gives an answer wins):
  1. explicit pose in the script's toon dict (`action`; old names are mapped, "idle" = no decision)
  2. STRONG verbs in the line (VERBS_STRONG, table order = priority; word-boundary, any tense)
  3. things shown on screen (THING_POSE)
  4. WEAK verbs in the line (VERBS_WEAK: sell, talk, walk, sit ... only when nothing stronger fired)
  5. mood fallback (MOOD_POSE), varied so it never repeats `prev` when an alternative exists

Rules 2/4 skip a verb that is negated ("never lose", "can't run"); shoot/score words need a basketball
context (place court, or a hoop/basketball/ball thing, or basketball words in the line) and otherwise
"score" becomes fistpump. A thing-based pose that would repeat `prev` is dropped in favour of the mood pose.
To extend: add a regex to the tables below; plain stdlib, deterministic.
"""
from __future__ import annotations

import re

POSES = {"stand", "sit", "cheer", "wave", "point", "walk", "dig", "shrug",
         "jump", "dunk", "run", "dribble", "shoot", "throw", "type", "eat", "talk", "phone", "count",
         "dance", "fistpump", "fall", "facepalm", "think", "sleep"}

# old toon-dict action names -> pose (None = idle, no decision)
OLD_ACTIONS = {"cheer": "cheer", "walk": "walk", "run": "run", "work": "type", "interact": "point", "wave": "wave", "idle": None}

# ---- verb tables: (pose, regex) -- order is priority -------------------------------------------------------------
_ING = r"(?:s|ed|d|ing)?"
VERBS_STRONG: list[tuple[str, str]] = [
    ("dunk",     r"dunk\w*|slam(?:s|med|ming)?\b(?!\s+(?:the\s+)?door)"),
    ("dribble",  r"dribbl\w+"),
    ("jump",     r"jump(?:s|ed|ing)?|leap(?:s|ed|t|ing)?|hop(?:s|ped|ping)?|bounc(?:e|es|ed|ing)"),
    ("shoot",    r"shoot(?:s|ing)?|shots?|3-?pointers?|three-?pointers?|bucket|buckets|score[sd]?|scoring"),   # basketball only
    ("throw",    r"throw(?:s|ing|n)?(?!\s+\w+\s+(?:an?\s+)?(?:parade|party|shade|fit))|threw|pitch(?:es|ed|ing)?(?!\s+(?:an?\s+|the\s+|your\s+)?(?:idea|deck|investors?))|toss(?:es|ed|ing)?"),
    ("fall",     r"fall(?:s|ing|en)?|fell|crash(?:es|ed|ing)?|los(?:e|es|ing)|lost|loss(?:es)?|fail(?:s|ed|ing|ure)?|fired|"
                 r"bankrupt\w*|broke|collaps\w+|plung\w+|plummet\w*|tumbl\w+|goes? under|went under"),
    ("facepalm", r"mistakes?|oops|wrong|regret\w*|blunder\w*|screw(?:s|ed)? up|messed up"),
    ("run",      r"sprint\w*|chas(?:e|es|ed|ing)|rush(?:es|ed|ing)?\s+(?:to|into|out|toward|towards|back)|"
                 r"race[sd]?\s+(?:to|for|against|through|down|ahead)|"
                 r"(?<!long )(?<!home )run(?:s|ning)?\s+(?:to|toward|towards|away|down|through|across|around|off|back|after|from)\b|\bran\b(?!\s+(?:the|a|an|his|her|their|its|your)\b)|runs?\s*[.,!?]|running\b(?!\s+(?:the|a|an|his|her|their|its|your|\w+\s+(?:company|business)))"),
    ("count",    r"count(?:s|ed|ing)?|cash(?:es|ed)? in|pay(?:s|ing)?|paid|payroll|earn(?:s|ed|ing)?|salar(?:y|ies)|wages?|"
                 r"(?:billions?|millions?)(?!\s+(?:people|users|customers|workers|employees|fans|views|viewers|downloads|subscribers|miles|kids|players|cars|shoes|units|years|ago|more))|"
                 r"profits?|revenues?"),
    ("fistpump", r"win(?:s|ning)?|won|champions?|championships?|titles?|beat(?:s|ing)?|beaten|victor\w*|triumph\w*"),
    ("dance",    r"danc(?:e|es|ed|ing)|(?<!third )(?<!political )(?<!other )parties|(?<!third )(?<!political )party|celebrat\w+"),
    ("eat",      r"eat(?:s|ing|en)?|ate|bit(?:e|es|ing)|snack(?:s|ing)?|tast(?:e|es|ed|ing)|hungry|hunger|breakfast|lunch|dinner|devour\w*"),
    ("phone",    r"call(?:s|ing)?(?!\s+(?:it|this|that|them|him|her|itself|himself|me|us)\b)|(?<!every )(?<!a )(?<!the )(?<!your )(?<!his )(?<!her )(?<!their )(?<!its )(?<!new )(?<!cheap )(?<!smart )(?<!every single )(?:phone|phoned|phoning)|text(?:s|ed|ing)?|dial(?:s|ed|ing)?"),
    ("type",     r"typ(?:e|es|ed|ing)(?!\s+of\b)|cod(?:e|es|ed|ing)\b|programm?(?:s|ed|ing|er|ers)?|hack(?:s|ed|ing|er|ers)?|"
                 r"build(?:s|ing)? (?:the )?(?:software|apps?|website|code)|e-?mails?|emailed"),
    ("dig",      r"dig(?:s|ging)?|dug|mining|miners?|mined|shovel\w*"),
    ("sleep",    r"sleep\w*|slept|tired|bored|boring|naps?|napping|yawn\w*|exhausted"),
    ("talk",     r"say(?:s|ing)?|said|tell(?:s|ing)?|told|announc\w+|explain\w*|present(?:s|ed|ing)\b|pitch(?:es|ed|ing)?\s+(?:an?\s+|the\s+|your\s+)?(?:idea|deck|investors?)"),
    ("think",    r"think(?:s|ing)?|thought|ideas?|plan(?:s|ned|ning)?|wonder\w*|realiz\w+|realis\w+|figur(?:e|es|ed|ing) out"),
]
VERBS_WEAK: list[tuple[str, str]] = [
    ("count",    r"\$\s?\d[\d,.]*"),
    ("talk",     r"sell(?:s|ing)?|sold|talk(?:s|ed|ing)?|speak(?:s|ing)?|spoke|ask(?:s|ed|ing)?|pitch"),
    ("walk",     r"walk(?:s|ed|ing)?|mov(?:e|es|ed|ing)\b|travel(?:s|led|ing)?|head(?:s|ed|ing)? (?:to|into|out)|step(?:s|ped)? (?:into|out|up)"),
    ("sit",      r"sit(?:s|ting)?|sat|seat(?:s|ed)?"),
]
NEG_RX = re.compile(r"(?:\bnever|\bnot\b|n't|\bno\b|\bnobody|\bnothing|\bwithout)(?:\W+\w+){0,4}\W+$")

# ---- things shown -> pose (first match in the given order wins) -----------------------------------------------------
THING_POSE = {
    "springshoe": "jump", "basketball": "dribble", "hoop": "dribble",
    "burger": "eat", "pizza": "eat", "coffee": "eat", "snack": "eat",
    "laptop": "type", "monitor": "type", "computer": "type", "controller": "type",
    "phone": "phone", "cash": "count", "cashstack": "count", "coins": "count", "goldbar": "count", "chartup": "count", "chart": "count",
    "mic": "talk", "chatbot": "talk",
    "trophy": "fistpump", "medal": "fistpump", "crown": "fistpump",
    "shovel": "dig", "pickaxe": "dig",
    "arrowdown": "fall", "bomb": "fall", "fire": "fall",
    "lightbulb": "think", "idea": "think",
}
BASKET_THINGS = {"basketball", "hoop", "ball", "shot"}      # raw script names that also mean a basketball scene
THING_BASKET_POSE = {"ball": "dribble", "shot": "shoot"}     # only valid in a basketball context

# ---- mood fallback -------------------------------------------------------------------------------------------------
MOOD_POSE = {"laugh": "cheer", "excited": "cheer", "shock": "shrug", "scheme": "think", "proud": "fistpump",
             "stern": "point", "calm": "talk", "happy": "talk", "sad": "fall", "dazed": "fall"}
NEGATIVE_RX = re.compile(r"\b(?:lose|lost|no|never|nothing|nobody|fail\w*|broke|dead|gone|sued?|scam\w*|worst|empty|zero|quit|resign\w*|"
                         r"fired|cheat\w*|cheated|hate\w*|cut|less|can't|won't|crash\w*|bankrupt\w*|ruin\w*|alone|sad)\b")
ALTERNATIVES = ["talk", "point", "shrug", "think"]
BASKET_WORDS = re.compile(r"\b(?:basketball|hoops?|nba|court|half court|buzzer|3-?pointers?|three-?pointers?|defen[sc]e|rim|dunk\w*|dribbl\w+|wemby|jersey)\b")

_STRONG = [(p, re.compile(r"(?<![\w-])(?:" + rx + r")(?![\w-])" if not rx.endswith(r"\s*[.,!?]") else rx)) for p, rx in VERBS_STRONG]
_WEAK = [(p, re.compile(r"(?<![\w-])(?:" + rx + r")(?![\w-])" if not rx.startswith(r"\$") else rx)) for p, rx in VERBS_WEAK]


def _norm(line: str) -> str:
    return (line or "").lower().replace("’", "'").replace("‘", "'")


def _first_verb(low: str, table, basket: bool) -> str | None:
    for pose, rx in table:
        for m in rx.finditer(low):
            if NEG_RX.search(low[:m.start()]):
                continue
            word = m.group(0)
            if pose == "shoot":
                if re.fullmatch(r"score[sd]?|scoring", word):
                    if re.match(r"score", word) and re.search(r"(?:credit|test|exam|final|fico|nps) $", low[:m.start()]):
                        continue
                    return "shoot" if basket else "fistpump"
                if not basket:
                    continue
            return pose
    return None


def _explicit(action: str | None) -> str | None:
    if not action or not isinstance(action, str):
        return None
    a = action.strip().lower()
    if a in OLD_ACTIONS:
        return OLD_ACTIONS[a]
    return a if a in POSES else None


def _alt(prev: str | None, first: str | None = None) -> str:
    for p in ([first] if first else []) + ALTERNATIVES:
        if p and p != prev:
            return p
    return "talk"


def pick_pose(line: str, things: list[str], mood: str, action: str | None, place: str | None, prev: str | None) -> str:
    """Return the pose (one of POSES) for this sentence; see the module docstring for the priority order."""
    # a real pose name the writer chose wins; the old generic scene actions (cheer/walk/idle...) rank BELOW the line's
    # own verbs and things (Nov 16: scripts tag most lines "cheer", which hid "dunk", "bankrupt", "spring shoes")
    pose = _explicit(action) if (action or "") not in OLD_ACTIONS else None
    if pose:
        return pose
    low = _norm(line)
    names = [t.lower() for t in (things or []) if isinstance(t, str)]
    basket = (place == "court") or any(t in BASKET_THINGS for t in names) or bool(BASKET_WORDS.search(low))
    if place == "pitch":                                   # a football pitch is a place, not a throw
        low = re.sub(r"\bpitch(?:es)?\b", " ", low)
    pose = _first_verb(low, _STRONG, basket)
    if pose:
        return pose
    thing_pose = None
    for t in names:
        p = THING_BASKET_POSE.get(t) if basket else None
        p = p or THING_POSE.get(t)
        if p:
            thing_pose = p
            break
    if thing_pose and thing_pose != prev:
        return thing_pose
    pose = _first_verb(low, _WEAK, basket)
    if pose:
        return pose
    old = OLD_ACTIONS.get(action or "")
    if old and old != prev:
        return old
    fb = MOOD_POSE.get(mood or "")
    if fb in ("fall",) and not NEGATIVE_RX.search(low):
        fb = "stand"
    if thing_pose and (fb is None or fb == "stand" or fb == prev):
        return thing_pose                                   # nothing better; the thing is what is on screen
    if fb is None:
        return "stand" if prev != "stand" else _alt(prev)
    if fb == prev and fb != "stand":
        return _alt(prev)
    return fb


def pick_poses(items: list[dict]) -> list[str]:
    """items: [{line, things, mood, action, place}] in story order -> poses, threading `prev` through."""
    out: list[str] = []
    for it in items:
        out.append(pick_pose(it.get("line", ""), it.get("things") or [], it.get("mood", ""), it.get("action"),
                             it.get("place"), out[-1] if out else None))
    return out


if __name__ == "__main__":
    import collections
    import glob
    import json
    import os
    import sys

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, root)

    assert pick_pose("So you strap springs to every shoe.", ["springshoe"], "excited", None, "street", None) == "jump"
    assert pick_pose("You dunk on everyone.", [], "proud", None, "court", None) == "dunk"
    assert pick_pose("Then the company goes bankrupt.", [], "sad", None, "office", None) == "fall"
    assert pick_pose("You sell burgers for a dollar.", ["burger"], "happy", None, "stall", None) == "eat"
    assert pick_pose("You earn 46 billion dollars a year.", [], "proud", None, "office", None) == "count"
    assert pick_pose("Anything.", [], "calm", "cheer", None, None) == "cheer" and pick_pose("x", [], "calm", "work", None, None) == "type"
    assert pick_pose("He took a screenshot.", [], "", None, None, None) == "stand"
    assert pick_pose("The payload ships at brunch.", [], "", None, None, None) == "stand"
    assert pick_pose("They play on the pitch.", [], "", None, "pitch", None) == "stand"
    assert pick_pose("Her credit score drops.", [], "", None, "office", None) != "shoot"
    assert pick_pose("You score twice.", [], "", None, "court", None) == "shoot"
    assert pick_pose("You score twice.", [], "", None, "office", None) == "fistpump"
    assert pick_pose("Nobody can ever make you lose.", [], "", None, None, None) != "fall"
    assert pick_pose("He looks around.", [], "calm", None, None, "talk") != "talk"
    print("asserts ok\n")

    try:
        from pipeline import tts, toon
    except Exception as e:                                   # keep the self-test usable without the heavy modules
        tts = toon = None
        print("note: tts/toon not importable:", e)
    counts: collections.Counter = collections.Counter()
    rows = []
    prev_story = None
    for f in sorted(glob.glob(os.path.join(root, "content", "scripts", "*.json"))):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        if d.get("format") != "story":
            continue
        prev, prev_things = None, []
        for si, sc in enumerate(d.get("scenes", [])):
            narr = sc.get("narration", "")
            if tts:
                sents = [s[0] for s in tts.sentences(tts.speakable(narr))]
            else:
                sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", narr) if s.strip()]
            tl = sc.get("toon") or []
            for k, s in enumerate(sents):
                t = tl[k] if len(tl) == len(sents) else {}
                given = [x for x in (t.get("things") or []) if isinstance(x, str)]
                th = given
                if toon and hasattr(toon, "things_for"):
                    try:
                        th = toon.things_for(s, given, prev_things)
                    except Exception:
                        th = given
                prev_things = th
                p = pick_pose(s, th, t.get("mood", ""), t.get("action"), t.get("place"), prev)
                prev = p
                counts[p] += 1
                rows.append((os.path.basename(f)[:3], p, s, th))
    for fid, p, s, th in rows:
        print(f"{fid} {p:9s} {s[:90]}  {th if th else ''}")
    print("\nTotal", sum(counts.values()))
    for p, n in counts.most_common():
        print(f"  {p:9s} {n}")
