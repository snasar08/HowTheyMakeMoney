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

import json
import re
from pathlib import Path

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
    ("phone",    r"call(?:s|ing)?(?!\s+(?:it|this|that|them|him|her|itself|himself|me|us)\b)|(?<!every )(?<!a )(?<!the )(?<!your )(?<!his )(?<!her )(?<!their )(?<!its )(?<!new )(?<!cheap )(?<!smart )(?<!every single )(?:phone|phoned|phoning)b|text(?:s|ed|ing)?|dial(?:s|ed|ing)?"),
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


# =====================================================================================================================
# ACTS (Nov 16, Sam about the Wembanyama Short: "he hasn't played basketball, hasn't done actions that correspond").
# pick_act(...) -> one of ACTS or None. The renderer plays a real mini-scene for it (ball through the hoop, a swatted
# shot, eating the burger ...). Most lines get None: an act fires only when the line clearly DOES that thing.
# ---------------------------------------------------------------------------------------------------------------------
SPORT_ACTS = ["dribble", "shoot", "dunk", "block", "pass", "layup", "kick", "punch", "sprint", "trophy_lift"]
DAILY_ACTS = ["eat", "drink", "phone_call", "type_laptop", "count_cash", "sign_contract", "drive_car", "throw_cash",
              "present_chart", "unbox"]
ACTS = SPORT_ACTS + DAILY_ACTS
BASKET_ACTS = {"dribble", "shoot", "dunk", "block", "pass", "layup"}
ACT_POSE = {"dribble": "dribble", "shoot": "shoot", "dunk": "dunk", "block": "jump", "pass": "throw", "layup": "jump",
            "kick": "throw", "punch": "throw", "sprint": "run", "trophy_lift": "cheer",
            "eat": "eat", "drink": "eat", "phone_call": "phone", "type_laptop": "type", "count_cash": "count",
            "sign_contract": "point", "drive_car": "sit", "throw_cash": "cheer", "present_chart": "point", "unbox": "shrug"}
# the held thing an act brings itself (ah_shots drops it from the shot's `things`): raw script names + their drawn names
_BALL = {"basketball", "ball"}
ACT_OWN_PROPS = {"dribble": _BALL, "shoot": _BALL, "dunk": _BALL, "layup": _BALL, "pass": _BALL, "block": _BALL, "kick": _BALL,
                 "eat": {"burger", "pizza", "snack", "coffee"}, "drink": {"coffee"}, "phone_call": {"phone", "ereader"},
                 "type_laptop": {"laptop", "computer", "monitor"}, "count_cash": {"cash", "cashstack", "coins", "goldbar"},
                 "throw_cash": {"cash", "cashstack", "coins"}, "trophy_lift": {"trophy", "medal"},
                 "unbox": {"box", "boxes", "shoe", "springshoe", "gift"}, "drive_car": {"car"}}

# (act, context needed, regex). Table order = priority (first act whose regex matches, un-negated, wins).
# Contexts: "basket" basketball scene | "pitch" soccer | "ring" boxing | "track" race/track | "sport" any sport
#   "food" food thing/word | "drinkable" | "chart" chart thing/word | "vehicle" | "unboxable" shoe/box | None = verb alone
_ACT_TABLE: list[tuple[str, str | None, str]] = [
    ("dunk",  None,     r"dunk\w*|posteriz\w+|alley-?oops?"),
    ("layup", "basket", r"lay-?ups?|finger rolls?|euro-?steps?"),
    ("block", "basket", r"block(?:s|ed|ing)?|swat(?:s|ted|ting)?|"
                        r"(?:nobody|no one|nothing|none of them|they can't|can't|cannot|never) (?:can |could |will |would )?(?:score|shoot|finish|dunk|get a shot|get to the rim|get past) (?:on|over|against|past|near) (?:you|him|her|them)|"
                        r"protect(?:s|ed|ing)? the (?:rim|paint)|rim protect\w*"),
    ("shoot", "basket", r"shoot(?:s|ing)?(?! (?:a |the |your |his |her |their )?(?:video|film|movie|ad|ads|commercial|photos?|scene|documentary|trailer|content|footage|reel|reels|clips?)\b)|"
                        r"(?:3|three)-?pointers?|buzzer[- ]beaters?|jump ?shots?|(?:from|at) (?:half ?court|the (?:three|3)[- ]?point line|downtown)|"
                        r"buckets?|score[sd]?|scoring"),
    ("pass",  "basket", r"pass(?:es|ed|ing)?(?! (?:the |a )?(?:law|bill|test|exam|audit|threshold|record|rule|rules|buck|torch|tax|vote)\b)(?! (?:away|out|on)\b)|"
                        r"assists?|dish(?:es|ed|ing)? (?:it|out|off)|(?:your |his |her |their )?teammates (?:get|are|go|become|find|finish|cut|run|spot)\b|wide open"),
    ("dribble", "basket", r"dribbl\w+|handles? the ball|crossovers?|ball handl\w+"),
    ("kick",  "pitch",  r"kick(?:s|ed|ing)?|penalt(?:y|ies)|goals?|scor(?:e|es|ed|ing)|hat-?tricks?|volleys?|headers?"),
    ("punch", "ring",   r"punch(?:es|ed|ing)?|box(?:es|ed|ing)|knock(?:s|ed|ing)? (?:\w+ )?out|knockouts?|jab(?:s|bed|bing)?|uppercuts?|haymakers?|spar(?:s|red|ring)?"),
    ("sprint", "track", r"sprint\w*|dash(?:es|ed|ing)?|marathon|(?:run|runs|running|ran) (?:the )?(?:\d+ ?m(?:eters?)?|mile|race|track|lap|laps|100|200|400)"),
    ("trophy_lift", "sport", r"trophy|trophies|champions?(?:hips?)?|titles?|ballon d'or|mvp|"
                             r"(?:win|wins|won|winning|lift|lifts|lifted|raise|raises|raised|hoist\w*) (?:the |a |an |your |his |her |their |every |each |it |that |another |\w+ )?(?:cups?|titles?|trophy|trophies|championships?|rings?|mvp|finals|world cup|gold|medals?|league|tournament|everything|it all|game|games|match)"),
    # ---- daily ----
    ("drink", "drinkable", r"drink(?:s|ing)?|drank|sip(?:s|ped|ping)?|gulp\w*|chug\w*|brew(?:s|ed|ing)?|pour(?:s|ed|ing)?|sell(?:s|ing)?|sold|serv(?:e|es|ed|ing)"),
    ("eat",   "food",   r"eat(?:s|ing|en)?|ate|bit(?:e|es|ing)|snacking|tast(?:e|es|ed|ing)|munch\w*|devour\w*|hungry|sell(?:s|ing)?|sold|serv(?:e|es|ed|ing)|flip(?:s|ped|ping)?|cook(?:s|ed|ing)?|grill(?:s|ed|ing)?|order(?:s|ed|ing)?|grab(?:s|bed|bing)?|hands? out|buy(?:s|ing)?|bought"),
    ("phone_call", None, r"phone calls?|(?:calls?|called|calling|dial(?:s|ed|ing)?|texts?|texted|texting|phoned|phoning)\s+(?:you|him|her|them|me|us|up|back|to|and|the\s+(?:owner|boss|team|ceo|coach|agent|bank|office|brand|founder|investors?|manager|league|club|fans))|"
                         r"picks? up the (?:phone|call)|answers? the (?:phone|call)|(?:your |his |her |their )?phone (?:rings|buzzes|lights up|goes off)"),
    ("type_laptop", None, r"typ(?:e|es|ed|ing)|e-?mails?|emailed|(?:writ(?:e|es|ing)|wrote) (?:a |the |an |his |her |their |your )?(?:memo|essay|report|letter|book|post|script)"),
    ("count_cash", None, r"count(?:s|ed|ing)? (?:the |all |your |his |her |their |every |\w+ )?(?:cash|money|bills|dollars|stacks?|coins|profits?|millions?|billions?)|"
                         r"(?:mak(?:e|es|ing)|made|earn(?:s|ed|ing)?|pull(?:s|ed|ing)? in|rak(?:e|es|ed|ing) in|bring(?:s|ing)? in|brought in|cash(?:es|ed|ing)? in|collect(?:s|ed|ing)?|pocket(?:s|ed|ing)?|get(?:s|ting)? paid|got paid|paid)\s+(?:about |nearly |almost |over |more than |around |roughly |up to |another |an extra )?(?:\$\s?\d[\d,.]*|\d[\d,.]*\s*(?:billion|million|thousand|dollars|bucks)|(?:a |one |two |three |ten |fifty |hundred )?(?:billions?|millions?)|cash|money|bills)"),
    ("sign_contract", None, r"sign(?:s|ed|ing)?\s+(?:a |the |an |his |her |their |your |that |this |new |big |huge |massive |record |\w+ )?(?:contracts?|deals?|papers?|paperwork|agreements?|checks?|cheques?|extensions?|lease|forms?|letter)|"
                            r"buy(?:s|ing)?|bought|purchas(?:e|es|ed|ing)|acquir(?:e|es|ed|ing)|signed (?:by|for|with|to)"),
    ("drive_car", "vehicle", r"driv(?:e|es|ing|en)|drove|behind the wheel|road trip|cruis(?:e|es|ed|ing)"),
    ("throw_cash", None, r"(?:throw(?:s|ing)?|threw|toss(?:es|ed|ing)?|shower(?:s|ed|ing)?|spray(?:s|ed|ing)?|hand(?:s|ed|ing)? out|give(?:s|n)? away|gave away|giving away|rain(?:s|ed|ing)?)\s+(?:a |the |your |his |her |their |\w+ )?(?:cash|money|dollars|bills|stacks|coins|millions?|billions?|fortune|bucks)|make(?:s)? it rain"),
    ("present_chart", "chart", r"(?:sales|revenues?|profits?|stock|growth|numbers|users|subscribers|views|prices?|orders|customers|downloads|valuation|income|earnings|traffic|share price)(?: \w+){0,2} (?:go(?:es)?|went|climb(?:s|ed|ing)?|ris(?:e|es|ing)|rose|jump(?:s|ed|ing)?|soar(?:s|ed|ing)?|doubl(?:e|es|ed|ing)|tripl(?:e|es|ed|ing)|grow(?:s|n|ing)?|grew|explod(?:e|es|ed|ing)|skyrocket\w*|shoot(?:s|ing)?|shot|spik(?:e|es|ed|ing)|surg(?:e|es|ed|ing)|take(?:s)? off|took off|fall(?:s|ing)?|fell|drop(?:s|ped|ping)?|crash(?:es|ed|ing)?|tank(?:s|ed|ing)?|plung\w+|plummet\w*)|"
                          r"(?:shows?|showed|showing|presents?|presented|presenting|points? at|points? to|look at|looks at|check(?:s|ed|ing)?) (?:the |a |his |her |their |your |this |that )?(?:chart|graph|slide|slides|numbers|curve|dashboard|results|data)|up and to the right|hockey stick"),
    ("unbox", "unboxable", r"unbox\w*|unveil(?:s|ed|ing)?|reveal(?:s|ed|ing)?|launch(?:es|ed|ing)?|releas(?:e|es|ed|ing)|introduc(?:e|es|ed|ing)|debut(?:s|ed|ing)?|"
                           r"open(?:s|ed|ing)? (?:a |the |your |his |her |their |that |this |\w+ )?(?:box|boxes|gift|package|parcel|present)|"
                           r"(?:a |the |your |his |her |their )?(?:brand[- ]?new|new|first|latest|signature|limited) (?:\w+ )?(?:shoes?|sneakers?|pair|model|edition|drop|collection|release)"),
]
# ---- WAVE 2 acts (Nov 16): more sports, business, creator. Same method: verb regex + context + guards. ------------------
SPORT2_ACTS = ["qb_throw", "touchdown", "bat_swing", "pitch", "tennis_serve", "golf_swing", "goal_celebrate", "race_car",
               "sprint_finish", "lift_weights"]
BIZ_ACTS = ["handshake_deal", "ring_bell", "ribbon_cut", "stack_gold", "card_swipe", "cash_register", "stock_up",
            "stock_crash", "vault", "hire"]
CREATOR_ACTS = ["gaming", "streaming", "sing_stage", "guitar", "film_camera", "rocket_launch", "build_tools", "code_screens",
                "robot_build", "post_video"]
# food-specific variants of eat / drink (Nov 16): chosen from the food named in the line or in `things` (see _food_act)
FOOD_ACTS = ["eat_pizza", "eat_fries", "eat_icecream", "eat_donut", "drink_soda"]
ACTS = ACTS + SPORT2_ACTS + BIZ_ACTS + CREATOR_ACTS + FOOD_ACTS
ACT_POSE.update({"eat_pizza": "stand", "eat_fries": "stand", "eat_icecream": "stand", "eat_donut": "stand", "drink_soda": "stand",
                 "qb_throw": "throw", "touchdown": "run", "bat_swing": "throw", "pitch": "throw", "tennis_serve": "throw",
                 "golf_swing": "throw", "goal_celebrate": "cheer", "race_car": "sit", "sprint_finish": "cheer", "lift_weights": "cheer",
                 "handshake_deal": "point", "ring_bell": "cheer", "ribbon_cut": "point", "stack_gold": "count", "card_swipe": "point",
                 "cash_register": "count", "stock_up": "fistpump", "stock_crash": "fall", "vault": "cheer", "hire": "point",
                 "gaming": "type", "streaming": "talk", "sing_stage": "cheer", "guitar": "cheer", "film_camera": "point",
                 "rocket_launch": "cheer", "build_tools": "dig", "code_screens": "type", "robot_build": "point", "post_video": "cheer"})
ACT_OWN_PROPS.update({"eat_pizza": {"pizza", "slice"}, "eat_fries": {"fries", "chips", "snack"}, "eat_icecream": {"icecream", "ice cream", "cone"},
                      "eat_donut": {"donut", "doughnut"}, "drink_soda": {"soda", "cola", "coke", "milkshake", "smoothie"},
                      "qb_throw": _BALL, "touchdown": _BALL, "bat_swing": _BALL, "pitch": _BALL, "tennis_serve": _BALL,
                      "golf_swing": _BALL, "goal_celebrate": _BALL, "race_car": {"car"}, "lift_weights": {"dumbbell"},
                      "stack_gold": {"goldbar"}, "cash_register": {"cash", "cashstack", "coins"},
                      "vault": {"cash", "cashstack", "coins", "goldbar"}, "gaming": {"controller"}, "streaming": {"mic"},
                      "sing_stage": {"mic"}, "guitar": {"guitar"}, "film_camera": {"camera"}, "rocket_launch": {"rocket"},
                      "robot_build": {"robot"}, "code_screens": {"laptop", "computer", "monitor"}, "post_video": {"phone"},
                      "card_swipe": {"phone"}})
# the set an act needs: (allowed sets, the set used when the shot's own place is not allowed). No entry = keep the place.
_INDOOR = ("diner", "stall", "office", "boardroom", "lab", "garage", "mansion", "classroom", "bathroom", "showroom", "stage", "throne")
ACT_SET = {**{k: (("court",), "court") for k in BASKET_ACTS},
           "kick": (("pitch",), "pitch"), "punch": (("ring",), "ring"), "sprint": (("track",), "track"),
           "qb_throw": (("gridiron", "pitch"), "gridiron"), "touchdown": (("gridiron", "pitch"), "gridiron"), "tennis_serve": (("tennis",), "tennis"), "goal_celebrate": (("pitch",), "pitch"),
           "bat_swing": (("diamond", "field"), "diamond"), "pitch": (("diamond", "field"), "diamond"), "golf_swing": (("golf", "field"), "golf"),
           "race_car": (("track",), "track"), "sprint_finish": (("track",), "track"),
           "lift_weights": (("gym", "stage", "garage"), "gym"),
           "handshake_deal": (("boardroom", "office"), "boardroom"), "ring_bell": (("stage", "office"), "stage"),
           "ribbon_cut": (("street",), "street"), "stack_gold": (("throne", "office"), "throne"),
           "card_swipe": (("stall",), "stall"), "cash_register": (("stall",), "stall"),
           "stock_up": (("office",), "office"), "stock_crash": (("office",), "office"),
           "vault": (("throne", "office"), "throne"), "hire": (("office", "lab"), "office"),
           "gaming": (("office", "lab"), "office"), "streaming": (("office",), "office"),
           "sing_stage": (("stage",), "stage"), "guitar": (("stage",), "stage"),
           "film_camera": (("street", "stage"), "street"), "rocket_launch": (("space",), "space"),
           "build_tools": (("garage", "factory"), "garage"), "code_screens": (("lab", "office"), "lab"),
           "robot_build": (("lab", "factory"), "lab"), "post_video": (("office", "street"), "office"),
           **{k: (_INDOOR, "diner") for k in FOOD_ACTS}}   # any indoor set; a generic place (street, bridge ...) becomes the diner
# camera view: wide for sports, driving, charts, stock moves, rockets; ms for everything else
ACT_WIDE = set(SPORT_ACTS) | set(SPORT2_ACTS) | {"drive_car", "present_chart", "stock_up", "stock_crash", "rocket_launch"}
ACT_VIEW = {k: ("wide" if k in ACT_WIDE else "ms") for k in ACTS}
# a soft act that would repeat falls back to this one instead of nothing
ACT_FALLBACK = {"goal_celebrate": "kick", "sprint_finish": "sprint", "stock_crash": None}

_ACT_TABLE2: list[tuple[str, str | None, str]] = [
    ("film_camera", None, r"films?(?:ed|ing|s)?(?! (?:industry|studio|studios))|movies?|filmmak\w+|documentar(?:y|ies)|vlog\w*|(?:youtube|tiktok) videos?|"
                          r"(?:shoot|shoots|shooting|shot|record|records|recorded|recording) (?:a |the |an |his |her |their |your |new |another |\w+ )?(?:video|videos|film|movie|ad|ads|commercial|scene|documentary|trailer|clip|clips|reel|reels|photos?|photoshoot)"),
    ("qb_throw", "nfl", r"quarterbacks?|qb|touchdown passes?|hail mary|(?:throw|throws|threw|throwing|launch|launches|launched) (?:a |the |an |his |her |your |another )?(?:\w+ )?(?:touchdown|bomb|spiral|deep ball|football|pass|passes)"),
    ("touchdown", "nfl", r"touchdowns?|end zone|rush(?:es|ed|ing)? for"),
    ("bat_swing", "baseball", r"home runs?|homers?|grand slams?|swing(?:s|ing)?|swung|bats?|batting|hits? (?:a |the )?(?:ball|pitch)"),
    ("pitch", "baseball", r"fastballs?|curveballs?|strikeouts?|strik(?:es|ing) out|struck out|"
                          r"pitch(?:es|ed|ing)?(?! (?:the |your |an? )?(?:idea|ideas|deck|investors?|startup|product|story|plan|them|it|to\b))"),
    ("tennis_serve", "tennis", r"serv(?:e|es|ed|ing)(?! (?:the )?(?:customers?|food|burgers?|coffee|drinks?|meals?))|aces?|double faults?|match point|forehands?|backhands?|smash(?:es|ed|ing)?"),
    ("golf_swing", "golf", r"tee(?:s|d)? off|birdies?|putt(?:s|ed|ing)?|holes? in one|golf swings?|swing(?:s|ing)?|swung|hits? (?:a |the )?(?:ball|drive|shot)|drives? the ball"),
    ("goal_celebrate", "pitch", r"celebrat\w+|hat-?tricks?|scor(?:e|es|ed|ing) (?:\w+ ){0,2}(?:goals?|winners?|equali[sz]ers?)|goals? (?:number )?\d[\d,]*|slides? on (?:his|her|their) knees"),
    ("sprint_finish", "track", r"finish(?:es|ed)? lines?|cross(?:es|ed|ing)? the (?:finish|line)|(?:win|wins|won|winning) (?:the |a |an |his |her |your |every |another |\w+ ){0,2}(?:race|races|gold|sprint|marathon|medals?|100|200|400)|gold medals?|olympic golds?|breaks? the (?:world )?records?"),
    ("race_car", None, r"f1|formula (?:1|one)|race[- ]?cars?|grand prix|laps?|pole position|pit stops?|racing drivers?|(?:drive|drives|driving|drove) (?:a |the |an |his |her )?(?:race|f1|formula)\w*"),
    ("lift_weights", None, r"lift(?:s|ed|ing)? (?:the )?(?:weights?|heavy|iron|bars?|barbells?|\d+ ?(?:pounds|lbs|kg))|weights|gym|deadlift\w*|bench[- ]press\w*|squats?|barbells?|dumbbells?|workouts?|work(?:s|ed)? out|bodybuild\w*|strongman"),
    ("rocket_launch", None, r"rockets?|spacex|spaceships?|launch(?:es|ed|ing)? (?:\w+ )?(?:into|to) (?:space|orbit|mars)|(?:to|into) (?:space|orbit|mars|the moon)|orbit|lift-?off|blast(?:s|ed|ing)? off|satellites?"),
    ("robot_build", None, r"(?:build|builds|building|built|assembl\w+|creat\w+|design\w*|invent\w*|unveil\w*|launch\w*) (?:the |an? |your |his |her |their |a new |new |that |this )?(?:\w+ ){0,2}(?:robots?|androids?|humanoids?|cyborgs?)|robots? (?:build|builds|built|assembl\w+|walks?|learn\w*|takes? over)|robot (?:army|factory|arm)|ai robots?"),
    ("code_screens", None, r"cod(?:e|es|ed|ing)|programm?(?:s|ed|ing|er|ers)|hack(?:s|ed|ing|er|ers)|debug\w*|deploy\w*|"
                           r"(?:build(?:s|ing)?|built|writ(?:e|es|ing)|wrote|ship(?:s|ped|ping)?|creat(?:e|es|ed|ing)) (?:the |an? |your |his |her |their |a new |new |that |this )?(?:\w+ )?(?:apps?|software|website|site|bot|chatbot|code|script|algorithm|platform|feature|update|patch)"),
    ("build_tools", None, r"garage|workshop|tinker\w*|hammer\w*|weld\w*|prototyp\w+|hand-?built|from scratch|"
                          r"(?:build|builds|building|built|assembl\w+) (?:the |an? |your |his |her |their |a new |new |that |this )?(?:\w+ )?(?:shoes?|sneakers?|cars?|engines?|machines?|factory|factories|bikes?|boats?|planes?|houses?|tables?|furniture|tools?|drones?|batteries|chips?|computers?|phones?|wings?)"),
    ("gaming", None, r"gaming|gamers?|video games?|plays? (?:video |computer |mobile |online |console |pc )?games?|fortnite|minecraft|roblox|valorant|esports?|playstation|xbox|nintendo|call of duty|speedrun\w*"),
    ("streaming", None, r"stream(?:s|ed|ing|er|ers)?|twitch|goes? live|going live|live-?stream\w*"),
    ("guitar", None, r"guitars?|guitarists?|drummers?|drums|bands?|riffs?|bass player"),
    ("sing_stage", None, r"sing(?:s|ing)?|sang|songs?|concerts?|tours?(?! the)|albums?|singers?|raps?|rappers?|choruses|chorus"),
    ("post_video", None, r"posts? (?:a |the |an |his |her |their |your |it |that |this |\w+ )?(?:videos?|clips?|reels?|shorts?|tiktoks?)|uploads? (?:a |the |an |his |her |their |\w+ )?(?:videos?|clips?)|uploaded|goes? viral|went viral|viral|(?:million|billion)s? (?:of )?views|views (?:pour|explode|climb|soar)"),
    ("handshake_deal", None, r"(?:strik(?:e|es|ing)|struck|seal(?:s|ed|ing)?|clos(?:e|es|ed|ing)|cut(?:s|ting)?|mak(?:e|es|ing)|made|shak(?:e|es|ing)|shook) (?:a |the |an |that |this |your |his |her |their |new |big |\w+ )?(?:\w+ )?deals?|partner(?:s|ed|ing)? (?:with|up)|merg(?:e|es|ed|ing)|mergers?|agreements?|shak(?:e|es|ing) hands?|shook hands?|teams? up with|joins? forces"),
    ("ring_bell", None, r"ipo|goes? public|went public|going public|stock market debut|rings? the (?:opening )?bell|(?:lists?|listed) on the (?:stock market|nasdaq|nyse)|nasdaq debut|wall street debut"),
    ("ribbon_cut", None, r"(?:opens?|opened|opening) (?:a |the |its |his |her |their |your |another |\w+ )?(?:first |new |second |flagship |\w+ )?(?:stores?|shops?|restaurants?|headquarters|hq|branch(?:es)?|location|factory|offices?|doors|bakery|diner)|ribbons?|grand opening|first (?:store|shop|restaurant|location)"),
    ("stack_gold", None, r"gold(?:en)? bars?|goldbars?|bars? of gold|piles? of gold|hoard\w*|gold coins?|stack(?:s|ed|ing)? (?:of )?(?:gold|bars)|net worth (?:hits?|passes|passed|reach(?:es|ed)?|tops?|topped|climbs?|grows?|jumps?|soars?|doubles?)"),
    ("card_swipe", None, r"swip(?:e|es|ed|ing)|tap(?:s|ped|ping)? (?:to pay|their (?:cards?|phones?)|a card|your card)|(?:customers?|fans?|people|everyone|shoppers?) (?:pay|pays|paid|paying)|pay(?:s|ing)? (?:by|with) (?:card|phone)|card readers?|checkouts?|contactless"),
    ("cash_register", None, r"cash registers?|ring(?:s|ing)? (?:it )?up|registers?|(?:behind|at) the (?:counter|register)|(?:sell|sells|selling|sold) (?:\w+ ){0,3}(?:at|over|across|behind) (?:a |the |your )?(?:counter|shop|stall|store)"),
    ("stock_up", None, r"(?:stock|stocks|shares?|share price|stock price|market cap|valuation)(?: \w+){0,2} (?:soar(?:s|ed|ing)?|doubl\w+|tripl\w+|ris(?:e|es|ing)|rose|jump\w*|surg\w+|rall(?:y|ies|ied)|climb\w*|skyrocket\w*|explod\w+|hits? (?:an? )?(?:all-time )?high|go(?:es)? up)|all-time highs?|record highs?"),
    ("stock_crash", None, r"(?:stock|stocks|shares?|share price|stock price|market cap|valuation)(?: \w+){0,2} (?:crash\w*|plung\w+|plummet\w*|tank\w*|tumbl\w+|collaps\w+|slid(?:e|es)|slump\w*|drop(?:s|ped|ping)?|fall(?:s|ing)?|fell|lose[sd]?|sink(?:s|ing)?|sank|go(?:es)? down)"),
    ("vault", None, r"fortunes?|vaults?|(?:in|into) the bank|savings|piggy ?bank|stash\w*|nest egg"),
    ("hire", None, r"hir(?:e|es|ed|ing)|employ(?:s|ed|ing)? (?:\w+ ){0,3}(?:people|workers|employees|staff|engineers|players|drivers)|(?:adds?|added) (?:\w+ ){0,2}(?:jobs?|workers|employees|engineers)"),
]
# priority order of every act (first that fires wins). Specific before general; a verb that two acts share goes to the
# act whose context is narrower (film "shoot a video" before basketball shoot, "sign" before "deal", robots before code).
_ACT_ORDER = ["dunk", "layup", "block", "film_camera", "shoot", "pass", "dribble", "qb_throw", "touchdown", "bat_swing", "pitch",
              "tennis_serve", "golf_swing", "goal_celebrate", "kick", "punch", "sprint_finish", "race_car", "sprint", "lift_weights",
              "trophy_lift", "drink", "eat", "cash_register", "phone_call", "type_laptop", "stack_gold", "count_cash", "sign_contract",
              "handshake_deal", "ring_bell", "ribbon_cut", "hire", "drive_car", "throw_cash", "stock_up", "stock_crash",
              "present_chart", "vault", "card_swipe", "gaming", "streaming", "guitar", "sing_stage", "post_video",
              "rocket_launch", "robot_build", "code_screens", "build_tools", "unbox"]
_ALL_TABLE = {a: (a, n, rx) for a, n, rx in _ACT_TABLE + _ACT_TABLE2}
_BASE_ACTS = [k for k in ACTS if k not in FOOD_ACTS]
assert set(_ALL_TABLE) == set(_BASE_ACTS) and set(_ACT_ORDER) == set(_BASE_ACTS), set(_BASE_ACTS) ^ set(_ACT_ORDER)
_ACT_RX = [(a, n, re.compile(r"(?<![\w-])(?:" + rx + r")(?![\w-])")) for a, n, rx in (_ALL_TABLE[k] for k in _ACT_ORDER)]

_NFL_WORDS = re.compile(r"\b(?:nfl|quarterbacks?|qb|touchdowns?|super bowl|end zone|hail mary|gridiron|american football|mahomes|tom brady|patriots|chiefs|cowboys)\b")
_BASEBALL_WORDS = re.compile(r"\b(?:baseball|mlb|home runs?|homers?|grand slams?|pitchers?|fastballs?|curveballs?|strikeouts?|innings?|mound|batters?|batting|ohtani|yankees|dodgers|world series|outfield|dugout)\b")
_TENNIS_WORDS = re.compile(r"\b(?:tennis|wimbledon|rackets?|racquets?|us open|serena|djokovic|federer|nadal|alcaraz|sinner|forehands?|backhands?|match point)\b")
_GOLF_WORDS = re.compile(r"\b(?:golf|golfers?|the masters|fairway|birdies?|putt\w*|tee off|pga|tiger woods|caddie|holes? in one)\b")
_NOT_RACE_RX = re.compile(r"(?:a\.?i\.?|space|arms|rat|chip|tech|cloud|data|ai|robot|market|talent|power)\s+$")
_STREAM_NOT = re.compile(r"\b(?:netflix|disney|hulu|spotify|prime video|hbo|music|revenue|income|cash|streams? of|apple tv|subscribers?)\b")


def _context2(need, low, names, place):
    if need == "nfl":
        return bool(_NFL_WORDS.search(low))
    if need == "baseball":
        return bool(_BASEBALL_WORDS.search(low)) or place == "field" and bool(re.search(r"\b(?:bat|ball|pitch\w*)\b", low))
    if need == "tennis":
        return bool(_TENNIS_WORDS.search(low))
    if need == "golf":
        return bool(_GOLF_WORDS.search(low))
    return None


def _hit2(kind, m, low, names, basket):
    """guards for the wave-2 acts; None = not a wave-2 kind (the old guards run)"""
    if kind not in ACT_SET and kind not in _ALL_TABLE:
        return None
    word, before, after = m.group(0), low[:m.start()], low[m.end():]
    if kind not in SPORT2_ACTS + BIZ_ACTS + CREATOR_ACTS:
        return None
    if NEG_RX.search(before) and kind not in ("stock_crash", "hire"):
        return False
    if kind in ("sprint_finish",) and _NOT_RACE_RX.search(before):
        return False
    if kind == "goal_celebrate" and re.fullmatch(r"goals? (?:number )?\d[\d,]*", word) is None and word.startswith("celebrat") and not re.search(r"\b(?:goal|score|scored|win|won|title|champion\w*)\b", low) and "pitch" not in low:
        return False
    if kind == "pitch" and re.match(r"pitch", word) and re.match(r"\s*(?:the |your |an? )?(?:idea|deck|investors?)", after):
        return False
    if kind == "bat_swing" and word in ("bat", "bats") and not _BASEBALL_WORDS.search(low):
        return False
    if kind == "race_car" and word.startswith("lap") and not re.search(r"\b(?:race|racing|f1|formula|track|driver|speed|fastest)\b", low):
        return False
    if kind == "lift_weights" and word in ("weights", "squat", "squats") and not re.search(r"\b(?:gym|lift\w*|train\w*|muscle|strong\w*|bench|bar)\b", low):
        return False
    if kind == "rocket_launch":
        if word.startswith("satellite") and not re.search(r"\b(?:launch\w*|space|orbit|rocket)\b", low):
            return False
        if word == "orbit" and not re.search(r"\b(?:space|earth|moon|mars|rocket|launch\w*)\b", low):
            return False
    if kind == "handshake_deal":
        if re.match(r"(?:mak|made)", word) and not re.search(r"\b(?:deal|deals)\b", word):
            return False
        if re.match(r"(?:cut|cuts|cutting|mak|made)", word) and re.search(r"(?:price|cost|tax|spending|jobs)s? $", before[-12:]):
            return False
        if word == "agreement" or word == "agreements":
            return not re.search(r"\b(?:sign\w*|terms|user|privacy)\s+$", before[-10:])
    if kind == "ring_bell" and word == "ipo" and not re.search(r"\b(?:ipo)\b", low):
        return False
    if kind == "ribbon_cut" and word in ("ribbon", "ribbons") and not re.search(r"\b(?:cut|cuts|cutting|open\w*)\b", low):
        return False
    if kind == "card_swipe" and re.match(r"checkouts?", word) and not re.search(r"\b(?:customers?|pay|card|queue|line|store)\b", low):
        return False
    if kind == "cash_register" and re.fullmatch(r"registers?", word) and re.search(r"\b(?:to|please|users?)\s+$", before[-8:]):
        return False
    if kind == "vault" and word == "savings" and not re.search(r"\b(?:bank|account|cash|money|billions?|millions?|life)\b", low):
        return False
    if kind == "hire" and re.match(r"hir", word) and re.match(r"\s*(?:a |the |an )?(?:lawyer|attorney|firm)", after):
        return False
    if kind == "streaming" and _STREAM_NOT.search(low) and not re.search(r"\b(?:twitch|youtube|gamers?|live|streamers?)\b", low):
        return False
    if kind == "sing_stage" and re.match(r"(?:song|songs)$", word) is None and re.fullmatch(r"raps?", word) and not re.search(r"\b(?:music|song|album|hip|hop|rapper|beat|artist|stage)\b", low):
        return False
    if kind == "guitar" and word in ("band", "bands") and not re.search(r"\b(?:play\w*|music|stage|concert|tour|guitar|drum\w*|singer|lead)\b", low):
        return False
    if kind == "post_video" and word == "viral" and re.match(r"\s*(?:marketing|loop|growth)", after):
        return False
    if kind == "film_camera" and re.match(r"films?$|film$", word) and re.match(r"\s*(?:industry|studio|studios|rights|company)", after):
        return False
    if kind == "code_screens" and re.match(r"(?:build|built|writ|wrote|ship|creat)", word) and not (
            re.search(_SUBJ, low) or names & {"laptop", "computer", "monitor"}):
        return False
    if kind == "build_tools" and word == "garage" and not re.search(r"\b(?:start\w*|found\w*|build\w*|built|work\w*|rented|dad|parents?|company|born)\b", low):
        return False
    if kind == "robot_build" and re.match(r"(?:launch|unveil)", word) and not re.search(_SUBJ, low):
        return False
    return True



_FOOD_THINGS = {"burger", "pizza", "snack", "coffee", "fries", "icecream", "donut", "slice"}
_FOOD_BIG = {"burger", "pizza", "fries", "icecream", "donut"}
_FOOD_WORDS = re.compile(r"\b(?:burgers?|fries|pizzas?|sandwich\w*|tacos?|nuggets?|meals?|food|lunch|dinner|breakfast|snacks?|chicken|hot dogs?|donuts?|doughnuts?|cookies?|fast food|french fries|ice cream|gelato|ice cream cones?|slices?|sundaes?|potato chips)\b")
_DRINK_WORDS = re.compile(r"\b(?:coffee|latte|tea|soda|cola|coke|pepsi|coca-cola|soft drinks?|milkshakes?|shakes?|lemonade|beer|juice|drinks?|milk|smoothies?)\b")
_CHART_THINGS = {"chart", "chartup", "arrowup", "arrowdown", "graph", "stock"}
_CHART_WORDS = re.compile(r"\b(?:charts?|graphs?|slides?|curve|dashboard)\b")
_VEHICLE_THINGS = {"car", "truck", "bus", "sneakerbus", "taxi", "van"}
_VEHICLE_WORDS = re.compile(r"\b(?:cars?|trucks?|taxi|taxis|cabs?|vans?|buses|bus|tesla|lambo|lamborghini|ferrari|porsche|wheel|highway|uber|lyft|limo|jeep|suv)\b")
_UNBOX_THINGS = {"box", "boxes", "shoe", "springshoe", "gift"}
_UNBOX_WORDS = re.compile(r"\b(?:shoes?|sneakers?|box|boxes|gift|package|parcel|pair)\b")
_PITCH_WORDS = re.compile(r"\b(?:soccer|football|pitch|striker|goalkeeper|keeper|penalt(?:y|ies)|free kicks?|world cup|champions league|premier league|la liga|hat-?trick|messi|ronaldo|neymar|vinicius|bellingham)\b")
_RING_WORDS = re.compile(r"\b(?:box(?:ing|er|ers)?|knockouts?|heavyweight|fights?|fighter|ufc|mma|tyson|gloves?|bout|punch\w*|uppercuts?|haymakers?)\b")
_TRACK_WORDS = re.compile(r"\b(?:track|races?|racing|sprint\w*|marathon|olympic\w*|\d+ ?m(?:eters?)?|finish line|starting (?:line|blocks?)|100-?yards?)\b")
_SPORT_WORDS = re.compile(r"\b(?:basketball|nba|court|pitch|soccer|football|league|season|finals|playoffs?|game|games|match|tournament|olympic\w*|cup|mvp|ballon d'or|champion\w*|titles?|trophy|trophies|team|club|race|medal)\b")
_TROPHY_STRONG = re.compile(r"\b(?:trophy|trophies|champion\w*|titles?|ballon d'or|mvp|world cup|championships?)\b")
_CAP_SIGN = re.compile(r"\bsigns?\s+(?:[A-Z][a-z]+|[A-Z]{2,})")
_ACT_HARD = {"dunk", "dribble", "layup", "shoot", "kick", "punch", "sprint", "drive_car", "phone_call", "type_laptop", "throw_cash"}   # the verb IS the act; all others never repeat back to back
_HYPO_RX = re.compile(r"\b(?:imagine|pretend|dream\w*|someday|one day|maybe|what if|wonder\w*)\b")
_SUBJ = r"\b(?:you|he|she|they|we|i)\b"


def _act_context(need, low, names, place, basket) -> bool:
    if need is None:
        return True
    c2 = _context2(need, low, names, place)
    if c2 is not None:
        return c2
    if need == "basket":
        return basket
    if need == "pitch":
        return place == "pitch" or bool(_PITCH_WORDS.search(low))
    if need == "ring":
        return place == "ring" or (bool(_RING_WORDS.search(low)) and not basket)
    if need == "track":
        return bool(_TRACK_WORDS.search(low)) and not basket
    if need == "sport":
        return place in ("court", "pitch", "track", "ring") or basket or bool(_SPORT_WORDS.search(low)) or bool(names & {"trophy", "medal", "ball", "basketball", "stadium"})
    if need == "food":
        return bool(names & _FOOD_THINGS) or bool(_FOOD_WORDS.search(low))
    if need == "drinkable":
        return bool(names & {"coffee", "soda", "cola"}) or bool(_DRINK_WORDS.search(low))
    if need == "chart":
        return bool(names & _CHART_THINGS) or bool(_CHART_WORDS.search(low))
    if need == "vehicle":
        return bool(names & _VEHICLE_THINGS) or bool(_VEHICLE_WORDS.search(low)) or place == "road"
    if need == "unboxable":
        return bool(names & _UNBOX_THINGS) or bool(_UNBOX_WORDS.search(low))
    return True


def _act_hit(kind: str, m, low: str, names: set, basket: bool) -> bool:
    """per-act sanity once the verb regex and the context agree"""
    h2 = _hit2(kind, m, low, names, basket)
    if h2 is not None:
        return h2
    word, before, after = m.group(0), low[:m.start()], low[m.end():]
    if kind != "block" and NEG_RX.search(before):
        return False
    if kind == "block" and NEG_RX.search(before) and not re.match(r"(?:nobody|no one|nothing|none|they|can|never)", word):
        return False
    if kind == "shoot" and re.fullmatch(r"score[sd]?|scoring", word):
        if re.search(r"(?:credit|test|exam|final|fico|nps|quality|trust|safety|review|satisfaction) $", before):
            return False
    if kind == "block" and word.startswith("block") and (re.search(r"(?:building|city|office|apartment|housing|\d+) $", before) or re.match(r"\s*(?:party|chain|buster)", after)):
        return False
    if kind == "kick" and re.fullmatch(r"goals?", word) and re.search(r"(?:your|his|her|their|big|main|long-term|financial|only|one|our|new|career|every|a|the) $", before) and not _PITCH_WORDS.search(low.replace("pitch", "")) and "pitch" not in low:
        pass
    if kind == "kick" and re.fullmatch(r"goals?", word) and re.search(r"(?:your|his|her|their|my|our|big|main|long-term|financial|career|every) $", before):
        return False
    if kind == "trophy_lift" and re.fullmatch(r"titles?", word) and not (_TROPHY_STRONG.search(low.replace(word, "", 1)) or basket):
        return False
    if kind == "trophy_lift" and re.search(r"(?:win|wins|won|winning) (?:the |a |an |your |his |her |their |every |each |it |that |another |\w+ )?(?:game|games|match|league|tournament|everything|it all)$", word) and not (basket or place_is_sport(low)):
        return False
    if kind in ("eat", "drink"):
        if re.fullmatch(r"hungry", word) and not (names & _FOOD_THINGS):
            return False
        if re.match(r"(?:buy|bought|order|grab|sell|sold|serv|flip|cook|grill|pour|brew)", word):
            # selling/serving needs the food (or drink) itself; "you sell burgers" = eating it on screen
            if not re.search(_SUBJ, low):
                return False                    # "Coca-Cola sells soda" / "McDonald's serves 70 million": a brand, nobody eats
            if kind == "eat" and not (names & _FOOD_BIG or _FOOD_WORDS.search(low)):
                return False
            if kind == "drink" and not (names & {"coffee", "soda", "cola"} or _DRINK_WORDS.search(low)):
                return False
            if re.match(r"(?:buy|bought)", word) and not (names & _FOOD_BIG):
                return False
        if kind == "eat" and re.search(r"\beats? (?:your |their |its |his |her )?(?:lunch|market|share|profits?|margins?)", low) and not (names & _FOOD_THINGS):
            return False
        if kind == "drink" and re.match(r"(?:sell|sold|serv)", word) and (names & _FOOD_THINGS) and not _DRINK_WORDS.search(low):
            return False
    if kind == "drive_car":
        if re.fullmatch(r"driv(?:e|es|ing|en)", word):
            if re.match(r"\s+(?:growth|sales|traffic|revenue|innovation|change|demand|prices?|costs?|engagement|clicks|profits?|results|people|customers|fans|crowds|everything|\w+ (?:up|down|out|away))\b", after) \
                    and not (names & _VEHICLE_THINGS):
                return False
            if not (re.search(_SUBJ, before[-20:]) or re.match(r"\s*(?:to|through|home|off|around|down|up|away|the|a|an|your|his|her|its|it)\b|\s*[.,!?]", after) or names & _VEHICLE_THINGS):
                return False
    if kind == "sign_contract":
        if re.match(r"(?:buy|bought|purchas|acquir)", word):
            # RULE: buying something BIG (priced in millions/billions, or a team/club/company/brand/stake...) = signing the paper;
            # buying anything small = no act (burgers get `eat`, the rest nothing)
            if not re.search(r"\b\d[\d,.]*\s*(?:million|billion|trillion)\b|\b(?:million|billion)s?\b|\$\s?\d{3,}|\b(?:team|club|company|brand|stake|shares|franchise|studio|network|league|land|stadium|island|rights|firm|business|startup|platform)\b", after[:70]):
                return False
        if re.match(r"signed", word) and not re.search(r"\b(?:contract|deal|for|with|by)\b", word):
            return False
    if kind == "count_cash":
        # a statistic about a company ("Nike made 46 billion") is not the hero counting: need a person word or a cash thing
        if not (names & {"cash", "cashstack", "coins", "goldbar"}) and not re.search(r"\b(?:you|your|he|she|his|her|they|we|i)\b", low):
            return False
    if kind == "unbox":
        if re.match(r"(?:launch|releas|introduc|debut|reveal|unveil)", word):
            if re.match(r"\s*(?:you|him|her|them|us|me)\b", after):
                return False
            if not (names & _UNBOX_THINGS or _UNBOX_WORDS.search(low)):
                return False
            if re.match(r"\s*(?:a |the |an |your |his |her |their |\w+ )?(?:app|apps|software|website|site|bot|chatbot|code|ad|ads|campaign|rocket|satellite|company|startup|business|podcast|channel|album|song|video|movie|show|stock|ipo|fund)\b", after):
                return False
    if kind == "type_laptop":
        if re.match(r"typ", word) and re.match(r"\s+(?:of|in)\b", after):
            return False
        if re.match(r"(?:build|built|writ|wrote|creat)", word) and not (re.search(_SUBJ, low) or names & {"laptop", "computer", "monitor"}):
            return False
    if kind == "phone_call":
        if re.match(r"(?:text|texts|texted|texting|call|calls|called|calling)\s+(?:to|and)$", word) and not re.search(
                r"(?:call|calls|called|calling)\s+(?:to|and)\s+(?:say|tell|ask|beg|offer|apologi[sz]e|congratulate|check|warn|threaten|demand|talk|speak|pitch|sell|buy|invite|propose|plead|cancel|confirm|thank|explain|sign|hire|trade)\b", low):
            return False
        if re.match(r"phones?$|phoned|phoning", word) and not re.match(r"phone\s+(?:you|him|her|them)", word):
            return False
    return True


def place_is_sport(low: str) -> bool:
    return bool(_SPORT_WORDS.search(low))


_PIZZA_RX = re.compile(r"\bpizzas?\b|\bslices?\b")
_FRIES_RX = re.compile(r"\bfries\b|\bfrench fries\b|\bpotato chips\b|\bbags? of chips\b|\b(?:eat\w*|munch\w*|crunch\w*|snack\w*|sell\w*|sold|serv\w*) (?:\w+ )?chips\b|\bfish and chips\b")
_ICE_RX = re.compile(r"\bice[- ]?creams?\b|\bgelato\b|\bcones?\b|\bsundaes?\b|\bpopsicles?\b")
_DONUT_RX = re.compile(r"\bdo(?:ugh)?nuts?\b")
_SODA_RX = re.compile(r"\bsoda\b|\bcola\b|\bcoke\b|\bpepsi\b|\bcoca-cola\b|\bsoft drinks?\b|\bmilkshakes?\b|\bshakes?\b|\bsmoothies?\b|\blemonade\b|\bfizzy\b")


def _food_act(kind: str, low: str, names: set) -> str:
    """eat / drink -> the food-specific act when the line (or `things`) names the food"""
    if kind == "drink":
        if names & {"soda", "cola"} or _SODA_RX.search(low):
            return "drink_soda"
        return kind
    if kind != "eat":
        return kind
    if names & {"pizza", "slice"} or _PIZZA_RX.search(low):
        return "eat_pizza"
    if names & {"fries"} or _FRIES_RX.search(low):
        return "eat_fries"
    if names & {"icecream"} or _ICE_RX.search(low):
        return "eat_icecream"
    if names & {"donut"} or _DONUT_RX.search(low):
        return "eat_donut"
    return kind


def _recent(prev_act) -> list:
    if not prev_act:
        return []
    if isinstance(prev_act, str):
        return [prev_act]
    return [p for p in prev_act if p]


def pick_act(line: str, things: list[str], place: str | None, mood: str | None, action: str | None,
             prev_act=None) -> str | None:
    """Return the act kind (one of ACTS) this sentence clearly performs, else None (most lines).

    How: the lower-cased line is matched against _ACT_TABLE in priority order. Each act has a verb regex (word boundaries,
    any tense, negation guard like pick_pose) and a context it needs: basketball acts need a basketball scene (place court,
    a ball/hoop thing, or basketball words), kick a pitch, punch boxing words, sprint a race/track word, eat a food thing or
    word, present_chart a chart thing or word, drive_car a vehicle, unbox a shoe/box. "Nobody can score on you" is a
    block, not a shot. RULE for buying: buying something BIG (a team/company/brand/stake, or any price in millions or
    billions) is sign_contract (the paper is the picture); buying anything small is no act. count_cash is "make/earn/pull in
    <money figure>" with a person (you/he) or a cash thing, or "count the money".
    `things` = the line's thing names (script things/props + toon.things_for). mood/action are accepted for the shared call
    shape; the line's own verbs decide. prev_act: the previous act, or a list of the last few: an act that would be the 3rd
    identical one in a row is dropped, and an inferred (soft) act is never repeated back to back.
    """
    if not line:
        return None
    text = (line or "").replace("’", "'")
    low = text.lower()
    names = {t.lower() for t in (things or []) if isinstance(t, str)}
    basket = (place == "court") or bool(names & BASKET_THINGS) or bool(BASKET_WORDS.search(low))
    if place == "pitch":
        low = re.sub(r"\bpitch(?:es)?\b", " ", low)
    if _HYPO_RX.search(low) and not re.search(r"\byou\b", low):
        return None
    recent = _recent(prev_act)
    found = None
    for kind, need, rx in _ACT_RX:
        if not _act_context(need, low, names, place, basket):
            continue
        if kind in BASKET_ACTS and place == "pitch":
            continue
        for m in rx.finditer(low):
            if _act_hit(kind, m, low, names, basket):
                found = kind
                break
        if found:
            break
    if not found and _CAP_SIGN.search(text) and not re.search(r"\bsigns? (?:up|in|out|off|on|of|that|this)\b", low):
        found = "sign_contract"          # "you sign Michael Jordan": a capitalised name after `sign`
    if not found:
        return None
    found = _food_act(found, low, names)
    if len(recent) >= 2 and recent[-1] == found and recent[-2] == found:
        return None
    if found not in _ACT_HARD and recent and recent[-1] == found:
        return ACT_FALLBACK.get(found)          # an inferred act is not repeated back to back (goal_celebrate -> kick)
    return found


def act_pose(kind: str | None) -> str | None:
    return ACT_POSE.get(kind or "")


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
    A = pick_act
    assert A("So you learn to shoot from half court.", [], "court", "", None, None) == "shoot"
    assert A("Step one, block everything.", [], "court", "", None, None) == "block"
    assert A("Nobody can score on you.", [], "court", "", None, None) == "block"
    assert A("You get open dunks, every night.", [], "court", "", None, None) == "dunk"
    assert A("You dunk from the free throw line.", [], "court", "", None, None) == "dunk"
    assert A("So you pass.", [], "court", "", None, None) == "pass"
    assert A("Your teammates get wide open.", [], "court", "", None, None) == "pass"
    assert A("You sell burgers.", ["burger"], "stall", "", None, None) == "eat"
    assert A("Dallas calls to say sorry.", [], "office", "", None, None) == "phone_call"
    assert A("You make 46 billion dollars a year.", [], "office", "", None, None) == "count_cash"
    assert A("Then you sign Michael Jordan.", [], "office", "", None, None) == "sign_contract"
    assert A("Nike signs a contract.", [], "office", "", None, None) == "sign_contract"
    assert A("You drive.", ["car"], "road", "", None, None) == "drive_car"
    assert A("You buy it for 309 million.", [], "office", "", None, None) == "sign_contract"
    assert A("Sales go up.", ["chart"], "office", "", None, None) == "present_chart"
    assert A("Sales go up.", ["arrowup"], "office", "", None, None) == "present_chart"
    assert A("A new shoe.", ["box"], "garage", "", None, None) == "unbox"
    assert A("You win the title.", ["trophy"], "court", "", None, None) == "trophy_lift"
    assert A("He scores a goal.", [], "pitch", "", None, None) in ("kick", "goal_celebrate")
    assert A("You step into the ring and punch.", [], "street", "", None, None) == "punch"
    assert A("You sprint down the track.", [], "road", "", None, None) == "sprint"
    assert A("He takes a bite.", ["burger"], "stall", "", None, None) == "eat"
    assert A("You count the cash.", ["cash"], "office", "", None, None) == "count_cash"
    assert A("The sign says Nike.", [], "street", "", None, None) is None
    assert A("Nobody can block your idea.", [], "office", "", None, None) is None
    assert A("Her credit score drops.", [], "office", "", None, None) is None
    assert A("You never shoot.", [], "court", "", None, None) is None
    assert A("You dunk again.", [], "court", "", None, ("dunk", "dunk")) is None
    assert A("Then you win.", [], "street", "", None, None) is None
    assert A("They call it the Swoosh.", [], "street", "", None, None) is None
    # ---- wave 2 ----
    assert A("You code the app.", [], "garage", "", None, None) == "code_screens"
    assert A("You type the email.", ["laptop"], "office", "", None, None) == "type_laptop"
    assert A("Mahomes throws a touchdown pass.", [], "pitch", "", None, None) == "qb_throw"
    assert A("He runs it into the end zone for a touchdown.", [], "pitch", "", None, None) == "touchdown"
    assert A("You hit a home run.", [], "field", "", None, None) == "bat_swing"
    assert A("The pitcher throws a fastball.", [], "field", "", None, None) == "pitch"
    assert A("You pitch the idea to investors.", [], "office", "", None, None) is None
    assert A("You serve an ace at Wimbledon.", [], "stage", "", None, None) == "tennis_serve"
    assert A("You birdie the last hole.", [], "field", "", None, None) == "golf_swing"
    assert A("He scores a goal and celebrates.", [], "pitch", "", None, None) == "goal_celebrate"
    assert A("You win the Formula 1 race.", [], "road", "", None, None) in ("race_car", "sprint_finish")
    assert A("You drive an F1 car for 70 laps.", [], "road", "", None, None) == "race_car"
    assert A("You cross the finish line.", [], "road", "", None, None) == "sprint_finish"
    assert A("The A.I. race started without you.", [], "office", "", None, None) is None
    assert A("You lift weights every morning.", [], "garage", "", None, None) == "lift_weights"
    assert A("You strike a deal with Nike.", [], "office", "", None, None) == "handshake_deal"
    assert A("Then you partner with Adidas.", [], "office", "", None, None) == "handshake_deal"
    assert A("Then it goes public.", [], "office", "", None, None) == "ring_bell"
    assert A("You open your first store.", [], "street", "", None, None) == "ribbon_cut"
    assert A("You stack gold bars to the ceiling.", [], "throne", "", None, None) == "stack_gold"
    assert A("Customers tap to pay.", [], "stall", "", None, None) == "card_swipe"
    assert A("You ring it up at the counter.", [], "stall", "", None, None) == "cash_register"
    assert A("The stock doubles.", [], "office", "", None, None) == "stock_up"
    assert A("The stock plunges 40 percent.", [], "office", "", None, None) == "stock_crash"
    assert A("You hide a fortune in the vault.", [], "throne", "", None, None) == "vault"
    assert A("You hire 500 engineers.", [], "office", "", None, None) == "hire"
    assert A("You play Fortnite all night.", [], "office", "", None, None) == "gaming"
    assert A("You stream it live on Twitch.", [], "office", "", None, None) == "streaming"
    assert A("Netflix streaming revenue grows.", [], "office", "", None, None) is None
    assert A("You sing on stage and sell out the tour.", [], "stage", "", None, None) == "sing_stage"
    assert A("You pick up a guitar.", [], "stage", "", None, None) == "guitar"
    assert A("You film the video yourself.", [], "street", "", None, None) == "film_camera"
    assert A("You shoot a video in your garage.", [], "garage", "", None, None) == "film_camera"
    assert A("SpaceX launches a rocket to space.", [], "space", "", None, None) == "rocket_launch"
    assert A("You build tools in the garage.", [], "garage", "", None, None) == "build_tools"
    assert A("You build a robot.", [], "lab", "", None, None) == "robot_build"
    assert A("You post a video and it goes viral.", [], "street", "", None, None) == "post_video"
    assert A("Goal 999.", [], "pitch", "", None, ("goal_celebrate",)) == "kick"
    assert A("So it orders before you ask.", ["snack"], "stall", "", None, None) is None
    # ---- food acts ----
    assert A("You eat a slice of pizza.", ["pizza"], "stall", "", None, None) == "eat_pizza"
    assert A("You sell pizza.", ["pizza"], "stall", "", None, None) == "eat_pizza"
    assert A("You eat fries every day.", [], "stall", "", None, None) == "eat_fries"
    assert A("You grab a bag of french fries.", ["fries"], "stall", "", None, None) == "eat_fries"
    assert A("You eat ice cream on the beach.", [], "quay", "", None, None) == "eat_icecream"
    assert A("You take a bite of a donut.", [], "stall", "", None, None) == "eat_donut"
    assert A("You drink a cold Coke.", [], "street", "", None, None) == "drink_soda"
    assert A("You sell soda.", ["soda"], "stall", "", None, None) == "drink_soda"
    assert A("You sip a milkshake.", [], "stall", "", None, None) == "drink_soda"
    assert A("You drink coffee.", ["coffee"], "office", "", None, None) == "drink"
    assert A("You eat a burger.", ["burger"], "stall", "", None, None) == "eat"
    assert A("Coca-Cola makes 45 billion dollars a year.", [], "office", "", None, None) is None
    assert A("Coca-Cola sells soda in 200 countries.", ["soda"], "office", "", None, None) is None
    assert A("McDonald's serves burgers to 70 million people.", ["burger"], "stall", "", None, None) is None
    assert A("Chips are the new oil.", ["chip"], "servers", "", None, None) is None
    assert A("Pizza sales go up.", ["pizza"], "stall", "", None, None) is None
    print("asserts ok\n")

    try:
        from pipeline import tts, toon
    except Exception as e:                                   # keep the self-test usable without the heavy modules
        tts = toon = None
        print("note: tts/toon not importable:", e)
    counts: collections.Counter = collections.Counter()
    rows = []
    act_rows = []
    acts_prev: list = []
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
                ac = pick_act(s, list(th) + list(t.get("props") or []), t.get("place"), t.get("mood", ""), t.get("action"), acts_prev[-2:])
                acts_prev.append(ac)
                if ac and 118 <= int(os.path.basename(f)[:3]) <= 134:
                    act_rows.append((os.path.basename(f)[:3], ac, s, th))
                counts[p] += 1
                rows.append((os.path.basename(f)[:3], p, s, th))
    for fid, p, s, th in rows:
        print(f"{fid} {p:9s} {s[:90]}  {th if th else ''}")
    print("\n=== ACTS in scripts 118-134 ===")
    for fid, ac, s_, th in act_rows:
        print(f"{fid} {ac:13s} {s_[:100]}  {th if th else ''}")
    ac_counts = collections.Counter(a for _f, a, _s, _t in act_rows)
    print("acts:", sum(ac_counts.values()), "of", sum(1 for r in rows if 118 <= int(r[0]) <= 134), "sentences", dict(ac_counts.most_common()))
    print("\nTotal", sum(counts.values()))
    for p, n in counts.most_common():
        print(f"  {p:9s} {n}")


# ---- approved acts only (Sam, Nov 16: a weak act "can't happen" in an automatic Short) ----
# pick_act returns a kind only when it is in toon/src/videos/afterhour/acts/approved.json; everything else falls back to
# the plain pose picker (the character reacts instead of acting). A kind is added there only after a frame-by-frame review.
_APPROVED_FILE = Path(__file__).resolve().parent.parent / "toon" / "src" / "videos" / "afterhour" / "acts" / "approved.json"
_APPROVED: set | None = None


def approved_acts() -> set:
    global _APPROVED
    if _APPROVED is None:
        try:
            _APPROVED = set(json.loads(_APPROVED_FILE.read_text(encoding="utf-8")).get("approved", []))
        except Exception:
            _APPROVED = set()
    return _APPROVED


_pick_act_all = pick_act


def pick_act(*args, **kwargs):   # noqa: F811  (same signature as above, filtered to approved kinds)
    kind = _pick_act_all(*args, **kwargs)
    return kind if kind in approved_acts() else None
