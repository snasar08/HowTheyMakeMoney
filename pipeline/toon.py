"""Toon look (Nov 15, Sam: "these videos look infinitely better than ours ... it should look close to the repo"):
flat cartoon people in an ink-outlined, painted 3D world, rendered with three.js inside Remotion (toon/, built on
the MIT-licensed source of mromidev/claude-animated-shorts). This module turns one of OUR scripts into the plan that
renderer reads, and names the rendered frames like the Blender plates so render.py picks them up (LP_PLATES).

  python -m pipeline.toon plan <script.json> <out_plan.json> [recorded_lp_plan.json]
  python -m pipeline.toon plates <plan.json> <frames_dir> <plates_dir>     # element-00042.jpeg -> <slug>/<scene>_<frame>.jpg

Without a recorded plan the scene lengths are estimated from the words (for look stills only).
"""
from __future__ import annotations

from . import ah_actions
import json
import os
import re
import shutil
import sys
from pathlib import Path

from . import lp_hero

FPS = 30
SKIN = {"light": "#f5c9a0", "tan": "#d9a577", "brown": "#a8744a", "dark": "#6b4630"}


def _hex(c, default):
    c = str(c or default)
    c = SKIN.get(c, c)
    return c if c.startswith("#") else "#" + c


# shirt numbers people know (used when the script's hero has no "number")
NUMBERS = {"stephen curry": "30", "lebron james": "23", "michael jordan": "23", "lionel messi": "10", "cristiano ronaldo": "7",
           "kylian mbappé": "10", "kylian mbappe": "10", "giannis antetokounmpo": "34", "patrick mahomes": "15", "shohei ohtani": "17",
           "kevin durant": "35", "tom brady": "12", "neymar": "10", "neymar jr": "10", "caitlin clark": "22", "juan soto": "22",
           "erling haaland": "9", "lamine yamal": "19", "mohamed salah": "11", "magic johnson": "32", "victor wembanyama": "1",
           "luka doncic": "77", "anthony edwards": "5", "shai gilgeous-alexander": "2", "kobe bryant": "24", "jayson tatum": "0"}


def _lum(h: str) -> float:
    h = h.lstrip("#")
    return (0.299 * int(h[0:2], 16) + 0.587 * int(h[2:4], 16) + 0.114 * int(h[4:6], 16)) / 255


def outfit(hero: dict | None, slug: str = "", sport: str = "", name: str = "") -> dict:
    """Our hero fields -> the reference character model (jacket / pants / boots / skin / hat / hair / moustache)."""
    s = lp_hero.spec(hero) if hero else lp_hero.spec(lp_hero.auto(slug))
    o = {"jacket": _hex(s.get("shirt"), "e63946"), "pants": _hex(s.get("pants"), "263247"),
         "boots": _hex(s.get("shoes"), "f4f4f4"), "skin": _hex(s.get("skin"), "light")}
    extras = s.get("extras") or []
    hair = s.get("hair") or "short"
    if "cap" in extras:
        o.update(hat="cap", cap=_hex(s.get("cap_color") or s.get("shirt"), "e63946"))
    elif hair == "bald":
        o["hat"] = None
    else:
        style = {"short": "short", "buzz": "buzz", "quiff": "quiff", "long": "long", "bangs": "short", "ponytail": "ponytail",
                 "bun": "bun", "afro": "afro", "curly": "curly", "mohawk": "mohawk", "spiky": "spiky"}.get(hair, "short")
        if (s.get("family") == "w" or s.get("outfit") == "dress") and hair in ("bangs", "short", "long", "ponytail"):
            style = "long"          # women's bangs / long hair: hair down past the shoulders
        o.update(hat="hair", hair=_hex(s.get("hair_color"), "3a2a1c"), style=style)
    bc = _hex(s.get("beard_color") or s.get("hair_color"), "3a2a1c")
    if s.get("beard") in ("full", "goatee", "stubble"):
        o.update(beard=s["beard"], beardCol=bc)
    if s.get("beard") in ("full", "mustache"):
        o["moustache"] = bc
    if "glasses" in extras:
        o["glasses"] = True
    if "headband" in extras:
        o["band"] = _hex(s.get("band_color") or s.get("extra_color"), "f4f4f4")
    kind = s.get("outfit")
    if kind == "kit":
        o["kit"] = "bball" if sport == "court" else "soccer" if sport == "pitch" else "soccer"
        num = str(s.get("number") or NUMBERS.get(name.lower(), ""))
        if num:
            o["num"] = num
        cands = [_hex(c, "ffffff") for c in (s.get("trim"), s.get("pants"), s.get("shoes"), s.get("socks"), "ffffff") if c]
        o["trim"] = next((c for c in cands if abs(_lum(c) - _lum(o["jacket"])) > 0.3), "#ffffff")
    elif kind in ("suit", "hoodie", "tee"):
        o["kit"] = kind
        o["trim"] = _hex(s.get("tie") or s.get("trim"), "c0353a" if kind == "suit" else "ffffff")
    if s.get("chest"):
        o["chest"] = str(s["chest"])[:6]
    if s.get("outfit") == "dress":
        o["dress"] = o["jacket"]
    if float((hero or {}).get("height") or 1) >= 1.15:
        o["build"] = "tall"                               # e.g. Wembanyama (height 1.3)
    o["height"] = float((hero or {}).get("height") or 1)
    if (hero or {}).get("jacket") == "leather":           # e.g. Jensen Huang's signature black leather jacket
        o["leather"] = True
    return o


def lights(n: int) -> list[str]:
    """Bright while the story sets up, golden for the payoff. Night only comes from a place (stage, space): the
    Nov 15 Uber test went navy for its whole second half and the scenery got hard to read."""
    if n <= 2:
        return ["day"] * n
    out = []
    for i in range(n):
        p = i / (n - 1)
        out.append("day" if p < 0.6 else "golden")
    return out


# Scene library (Nov 15, Sam: "make scenes based on what we are posting ... the script goes with the background").
# A scene's `visual.beat` wins; otherwise the line's words pick one, never the same beat twice in a row.
BEATS = {
    "drive": r"\b(drive|drives|driver|drivers|driving|ride|rides|trip|trips|car|cars|taxi|uber|lyft|deliver\w*|road|commute)\b",
    "clock": r"\b(years?|minutes?|hours?|seconds?|days?|weeks?|months?|forever|time|nonstop|decades?|centur\w+)\b",
    "money": r"(\$|\b(dollars?|paid|pays?|earn\w*|money|cash|revenue|profit\w*|salary|rich|fortune|net worth|cents?)\b)",
    "phone": r"\b(app|apps|phone|tap|taps|order\w*|download\w*|online|scroll\w*|swipe\w*|stream\w*)\b",
    "queue": r"\b(people|customers?|riders?|users?|fans|everyone|everybody|line|crowd|members|players)\b",
}
PRIORITY = ["drive", "money", "clock", "phone", "queue", "sign"]
# brand colours for names on screen (lettering only, Sam Nov 15); scripts may set brand_color / brand_text_color
BRAND_COLORS = {"uber": ("#000000", "#ffffff"), "nike": ("#111111", "#ffffff"), "mcdonald's": ("#da291c", "#ffc72c"),
                "netflix": ("#141414", "#e50914"), "amazon": ("#232f3e", "#ff9900"), "doordash": ("#ff3008", "#ffffff"),
                "starbucks": ("#00704a", "#ffffff"), "chick-fil-a": ("#e51636", "#ffffff"), "roblox": ("#232527", "#ffffff"),
                "youtube": ("#ff0000", "#ffffff"), "visa": ("#1a1f71", "#ffffff"), "airbnb": ("#ff5a5f", "#ffffff")}


# Things a line mentions -> the drawing that shows it (toon/src/videos/htmm/things.ts). Sam, Nov 15: "if it's mentioned
# in the video, it should make the video and the scenery" (spring shoes, a sneaker bus, glasses, a chip factory...).
THING_WORDS = [
    ("sneakerbus", r"\b(sneaker|shoe)[- ]?(bus|buses)\b|\bbuses shaped like sneakers\b"),
    ("springshoe", r"\b(springs?|motors?|robotic shoes?|dunk shoes?)\b"),
    ("tradingcard", r"\bpok[eé]mon\b|\b(?:rare|trading|collectible|collector|rookie|holo|graded|baseball|sports) cards?\b|\bthat same card\b|\bcards? packs?\b"),
    ("shoe", r"\b(shoes?|sneakers?|kicks|footwear|air jordans?)\b"),
    ("bus", r"\bbus(es)?\b"),
    ("glasses", r"\bglasses\b"),
    ("robot", r"\brobots?\b|\bai helper\b"),
    ("chip", r"\bchips?\b(?! (bag|snack))|\bgpus?\b|\bprocessors?\b"),
    ("drone", r"\bdrones?\b|\bflying robots?\b|\bfly your package\b"),
    ("plant", r"\bpower plants?\b|\belectricity\b"),
    ("satellite", r"\bsatellites?\b|\binto space\b|\bin space\b|\bin orbit\b"),
    ("chatbot", r"\bchatbots?\b|\bchat ?gpt\b"),
    ("ring", r"\brings?\b(?! (out|up))|\bchampionships?\b|\btitles?\b"),
    ("stadium", r"\bstadiums?\b|\barenas?\b"),
    ("factory", r"\bfactor(y|ies)\b|\bdata cent(er|re)s?\b|\bbuilds?\b.*\bplants?\b"),
    ("snack", r"\bsnacks?\b|\bchips bag\b"),
    ("hanger", r"\bfashion\b|\bclothes\b|\btunnel fits?\b|\bclothing\b|\bapparel\b"),
    ("dome", r"\bdomes?\b"),
    ("dumbbell", r"\btrain(ing)?\b|\bgym\b|\bworks? out\b|\bbest shape\b"),
    ("tv", r"\bcartoons?\b|\btv\b|\bstream\w*\b|\bvideos?\b"),
    ("books", r"\bbooks?\b|\bbookstore\b|\bdream board\b|\bnotebook\b"),
    ("ereader", r"\be-?readers?\b|\bkindle\b|\btablets?\b"),
    ("letter", r"\bsigns? (them|him|her|a deal)\b|\bmemo\b|\bletters?\b|\bemails?\b|\bresign\w*\b|\bbids?\b|\boffers?\b|\bannounce\w*\b|\bcontracts?\b"),
    ("idea", r"not enough\?|\bnext idea|\bideas?\b"),
    ("shot", r"\bshoot\w*\b|\bshots?\b|\bhalf court\b|\bfree throw\b"),
    ("poster", r"\bposters?\b|\bhighlights?\b|\bbillboards?\b"),
    ("medal", r"\bmedals?\b|\bolympic gold\b|\bgold medal\b|\bolympics?\b"),
    ("crown", r"\bworld record\b|\ball-time\b|\bbest ever\b|\bking\b|\bgreatest\b|\bface of\b|\bdynasty\b"),
]


def things_for(line: str, given: list, prev: list | None = None) -> list:
    """The script's/director's `things` first, then whatever the line mentions, at most 2, no near-duplicates, and
    nothing the previous sentence already showed (one AI bubble per line got repetitive in the Nov 15 test)."""
    out = [t for t in given if isinstance(t, str)]
    prev = prev or []
    low = line.lower()
    card_rx = next((rx for nm, rx in THING_WORDS if nm == "tradingcard"), None)
    if card_rx and "tradingcard" not in out and "tradingcard" not in prev and re.search(card_rx, low):
        out.insert(0, "tradingcard")        # Nov 26 look audit (094): the card the line names is on screen even when the script listed two other things
    for name, rx in THING_WORDS:
        if len(out) >= 2:
            break
        if name not in out and name not in prev and re.search(rx, low):
            if name == "shoe" and ("springshoe" in out or "sneakerbus" in out):
                continue
            if name == "bus" and "sneakerbus" in out:
                continue
            out.append(name)
    return out[:2]


def beats_for(lines: list[str], given: list[str | None], company: str = "") -> list[str]:
    out, prev = [], None
    for text, g in zip(lines, given):
        if g:
            out.append(g); prev = g; continue
        t = text.lower()
        score = {b: len(re.findall(rx, t)) for b, rx in BEATS.items()}
        score["sign"] = 1 if company and company.lower() in t else 0
        ranked = sorted((b for b in PRIORITY if score[b]), key=lambda b: (-score[b], PRIORITY.index(b)))
        pick = next((b for b in ranked if b != prev), "walk")
        out.append(pick); prev = pick
    return out


def _brand(b) -> dict:
    """visual.brand: "SpaceX" or {"name", "bg", "fg", "icon"} (icon: rocket bolt chip globe car brain bird sun play cart robot burger)"""
    if isinstance(b, str):
        b = {"name": b}
    bg, fg = BRAND_COLORS.get(b["name"].lower(), ("#241726", "#ffffff"))
    return {"name": b["name"], "bg": b.get("bg", bg), "fg": b.get("fg", fg), **({"icon": b["icon"]} if b.get("icon") else {})}


def make_plan(script: dict, recorded: dict | None = None) -> dict:
    scenes = [(i, sc) for i, sc in enumerate(script["scenes"]) if sc.get("visual", {}).get("type") == "lowpoly"]
    ranges = {}
    if recorded:
        for key in recorded["frames"]:
            si, fr = (int(x) for x in key.split("_"))
            lo, hi = ranges.get(si, (fr, fr))
            ranges[si] = (min(lo, fr), max(hi, fr))
    lt, out, a = lights(len(scenes)), [], 0
    # one shot per SENTENCE (Nov 15): the director picks each sentence's place / beat / props / mood / brand
    from . import prosody, toon_director, tts
    sents = {i: [x for x, _q, b in tts.sentences(tts.speakable(sc.get("narration", ""))) if not b] or [sc.get("narration", "")]
             for i, sc in scenes}
    flat = [x for i, _ in scenes for x in sents[i]]
    direction, how = toon_director.direct(script, flat)
    print(f"[toon] director: {how}, {len(flat)} sentences", flush=True)
    # Nov 15 frame checks (Neymar, Clark): the AI director added objects the line never names (a medal for a
    # transfer fee, books for "sounds safe") and put a basketball player on a soccer pitch. So: objects only from
    # the line's own words unless a script spells them out, and athletes stay in their sport's place.
    sport_place = next((sc["visual"].get("set") for _, sc in scenes if sc["visual"].get("set") in ("court", "pitch")), "")
    for d in direction:
        if how != "script":
            d["things"] = []
        if sport_place and d.get("place") in ("court", "pitch") and d["place"] != sport_place:
            d["place"] = sport_place
    di = 0
    prev_things: list = []
    # an athlete's sport (Nov 15 frame check: Gemini put Caitlin Clark on a soccer pitch): their home place wins
    vsets = [sc["visual"].get("set") for _, sc in scenes]
    sport = "court" if "court" in vsets else "pitch" if "pitch" in vsets else None
    # frames per syllable over the whole Short, so the last scene (which also holds the CTA and the loop line) can be
    # split into "narration" + an outro montage instead of one shot held for ~10 s (Nov 15 Jensen frame check)
    rate = None
    if recorded and len(scenes) > 1:
        fr = sum(ranges[i][1] - ranges[i][0] + 1 for i, _ in scenes[:-1] if i in ranges)
        sy = sum(max(1, prosody.syllables(x)) for i, _ in scenes[:-1] for x in sents[i])
        rate = fr / sy if sy else None
    for k, (i, sc) in enumerate(scenes):
        v = sc["visual"]
        if recorded:
            if i not in ranges:
                continue
            lo, hi = ranges[i]
            lo, hi = max(0, lo - 2), hi + 2          # render.py may ask one frame off either end
        else:
            lo, hi = 0, int((len(sc.get("narration", "").split()) / 2.6 + 0.6) * FPS)
        n = hi - lo + 1
        ss = sents[i]
        w = [max(1, prosody.syllables(x)) for x in ss]
        tail = 0
        if k == len(scenes) - 1 and rate:
            need = int(sum(w) * rate * 1.1) + 6
            if n - need > FPS * 1.5:
                tail, n = n - need, need
        cuts = [0]
        for j in range(len(ss) - 1):
            cuts.append(round(n * sum(w[:j + 1]) / sum(w)))
        cuts.append(n)
        for j in range(len(ss)):
            d = direction[di] if di < len(direction) else {}
            di += 1
            m = cuts[j + 1] - cuts[j]
            if m <= 0:
                continue
            place = d.get("place", "street")
            if sport and place in ("court", "pitch") and place != sport:
                place = sport
            given = d.get("things") or []
            if how != "script":   # the AI's things only when the line names them (it drew a power plant for "stayed in Brazil")
                given = [t for t in given if any(nm == t and re.search(rx, ss[j].lower()) for nm, rx in THING_WORDS)]
            out.append({"si": i, "a": a, "n": m, "frLo": lo + cuts[j], "light": lt[k], "set": v.get("set", "city"),
                        "action": d.get("action", v.get("action", "idle")), "crowd": int(d.get("crowd", v.get("crowd", 0)) or 0),
                        "props": d.get("props") or [], "beat": d.get("beat", "walk"), "mood": d.get("mood", "happy"),
                        **({"place": place} if place in PLACE_NAMES or place in AH_ALL_SETS or place in AH_SET else {}),
                        **({"loc": {"bridge": 0, "street": 1, "quay": 2}[place]} if place in ("bridge", "street", "quay") else {}),
                        **({"brand": _brand(d["brand"])} if d.get("brand") else {"brand": _brand(v["brand"])} if v.get("brand") else {}),
                        # Nov 15 (afterhour style): a text card in the scene (date sign, money screen that flips, headline,
                        # tombstone...), a fixed view ("face" close-up etc.), a different character for this line, hide the hero
                        **{k: d[k] for k in ("card", "view", "who", "hide", "crowdO") if d.get(k)},
                        **{k: d[k] for k in ("math", "units", "journey", "react") if k in d},      # POV format (Nov 24)
                        "things": (prev_things := things_for(ss[j], given, prev_things)), "line": ss[j][:80], "text": ss[j]})
            a += m
        if tail:
            # outro: quick callbacks to the Short's best moments (logos, things, signs), a new view every ~1.5 s
            picks = [e for e in out if e.get("things") or e["beat"] in ("logo", "sign", "money", "drive", "queue")] or out[:]
            seen, uniq = set(), []
            for e in picks:
                key = (e.get("place"), e["beat"], tuple(e.get("things") or []))
                if key not in seen:
                    seen.add(key); uniq.append(e)
            uniq = [e for e in uniq if e.get("si") != scenes[0][0]][::-1] or uniq    # latest, biggest steps first; not the opener
            pos, kk = lo + n, 0
            while tail > 0:
                m = min(tail, 45) if tail - 45 >= 20 else tail
                src = uniq[kk % len(uniq)] if uniq else out[-1]
                out.append({**{q: v for q, v in src.items() if q not in ("math", "units", "journey", "react") and (q != "card" or not re.search(r"\d", str((src.get("card") or {}).get("text", ""))))}, "a": a, "n": m, "frLo": pos, "si": i, "line": "(outro) " + src.get("line", "")[:60]})
                a += m; pos += m; tail -= m; kk += 1
    slug = f"{script.get('id', '')}-{script.get('slug', '')}"
    co = script.get("company", "")
    bg, fg = BRAND_COLORS.get(co.lower(), ("#241726", "#ffffff"))
    brand = {"name": co, "bg": script.get("brand_color", bg), "fg": script.get("brand_text_color", fg)} if co and script.get("format") != "famous" else None
    sport = next((sc["visual"].get("set") for _, sc in scenes if sc["visual"].get("set") in ("court", "pitch")), "")
    hero = outfit(script.get("hero"), script.get("slug", ""), sport, script.get("name_card", ""))
    plan = {"slug": slug, "fps": FPS, "total": a, "scenes": out, "brand": brand, "hero": hero,
            "seed": int(re.sub(r"\D", "", str(script.get("id", "1"))) or 1)}
    if script.get("format") == "pov":
        plan["pov"] = str(script.get("pov") or "")[:60]     # the opening pill text ("POV: you tap your card for coffee")
    return plan


# ---- afterhour look (Nov 16): the same per-sentence plan as real-3D shots for the AhShort composition ----
AH_SET = {"throne": "throne", "office": "office", "servers": "lab", "garage": "garage", "stall": "stall", "mine": "field",
          "court": "court", "pitch": "pitch", "diamond": "diamond", "gridiron": "gridiron", "tennis": "tennis", "golf": "golf", "pool": "pool", "gym": "gym", "studio": "studio", "farm": "farm", "store": "store", "stage": "stage", "space": "space", "street": "street", "bridge": "street",
          "quay": "beach", "road": "track"}
AH_EXPR = {"happy": "smile", "laugh": "laugh", "shock": "shock", "nervous": "shock", "proud": "smug", "stern": "angry",
           "scheme": "smug", "relief": "smile", "dazed": "sad", "sad": "sad", "calm": "neutral", "excited": "grin"}
AH_POSE = {"cheer": "cheer", "walk": "walk", "run": "walk", "work": "point", "interact": "point", "wave": "wave", "idle": "stand"}
AH_THING = {"shoe": "shoe", "springshoe": "springshoe", "sneakerbus": "bus", "bus": "bus", "robot": "robot", "chip": "chip", "drone": "drone",
            "satellite": "satellite", "ring": "ring", "crown": "crown", "tv": "tv", "books": "books", "letter": "letter", "medal": "medal",
            "idea": "lightbulb", "factory": "factory", "stadium": "stadium", "plant": "factory", "car": "car", "truck": "truck",
            "trophy": "trophy", "cash": "cashstack", "boxes": "box", "check": "letter", "rocket": "rocket", "ball": "basketball", "mic": "mic",
            "laptop": "laptop", "burger": "burger", "controller": "controller", "ereader": "phone", "snack": "burger", "poster": "newspaper", "horse": "horse", "baseball": "baseball", "guitar": "guitar", "rollercoaster": "rollercoaster",
            "noodlecup": "noodlecup", "legobrick": "legobrick", "eiffeltower": "eiffeltower", "giantshovel": "giantshovel", "icepop": "icepop"}
def _ts_union(path: str, typ: str) -> set:
    """the names a TS union type lists (SetName / ThingName), so a script may ask for any set or object directly"""
    try:
        src = (Path(__file__).resolve().parent.parent / path).read_text(encoding="utf-8")
        m = re.search(r"export type " + typ + r" =(.*?);", src, re.S)
        return set(re.findall(r'"([a-z0-9_]+)"', m.group(1))) if m else set()
    except OSError:
        return set()


AH_ALL_SETS = _ts_union("toon/src/videos/afterhour/sets.ts", "SetName")        # Nov 18: a toon "place" may name any 3D set
AH_ALL_THINGS = _ts_union("toon/src/videos/afterhour/things3d.ts", "ThingName")  # and "things" any 3D object
def _lib_model_names() -> set:
    """Nov 18: every CC0 library model (index*.json) may be named in a script's `things` too, e.g. "fort_fence" """
    out: set = set()
    d = Path(__file__).resolve().parent.parent / "toon" / "public" / "models"
    for f in [d / "index.json", *sorted(d.glob("index.*.json"))]:
        try:
            out |= set(json.loads(f.read_text(encoding="utf8")))
        except Exception:
            pass
    return out


AH_ALL_THINGS = AH_ALL_THINGS | _lib_model_names()
AH_BIG = {"car", "truck", "bus", "rocket", "factory", "stadium", "plane", "yacht", "house", "dome", "giantshovel"}
AH_CROWD = [{"body": c, "hat": "hair", "hair": h} for c, h in (("#e86a6a", "#3a2a20"), ("#5ad0d8", "#8a5a2a"), ("#8bc34a", "#1a1a1a"),
            ("#b48ae0", "#3a2a20"), ("#f2a33a", "#5a3b2a"), ("#4a7bd0", "#1a1a1a"))]


_AH_MODELS: dict | None = None
_AH_STOP = {"sign", "signs", "signed", "signing", "deal", "deals", "the", "a", "an", "and", "or", "of", "to", "in", "on", "it", "is", "was", "he", "she", "they", "his", "her", "this", "that", "with", "for", "at", "by", "as", "be", "so", "but",
           # Nov 18 (overnight scene pass): words that mean something else in a story line ("fans" -> ceiling fan, "can" -> tin can,
           # "cold" -> fridge, "Mickey Mouse" -> computer mouse, "defense", "steps", "stack", "power" ...), and no weapons ever
           "woods", "console", "consoles", "can", "cold", "fan", "fans", "trash", "waste", "mouse", "bar", "base", "bay", "bend", "catch", "chest", "chop", "counter",
           "deck", "direction", "display", "fair", "frame", "hole", "hooks", "light", "loot", "pad", "peel", "pot", "power", "present",
           "ride", "round", "seat", "shed", "signal", "stack", "steps", "storage", "tank", "tube", "wall", "wheel", "wings", "trading",
           "finance", "business", "corporate", "commercial", "retail", "healthy", "compact", "emergency", "defense", "entrance",
           "outdoor", "reading", "cooling", "module", "portal", "booster", "logistics", "drawer", "drawers", "remains", "skeleton",
           "pistol", "rifle", "gunturret", "twinguns", "lasergun", "raygun", "cannon", "knife", "hatchet", "arrest"}


def ah_models() -> dict:
    """word -> model name from toon/public/models/index.json (names first, then tags; first name alphabetically wins)"""
    global _AH_MODELS
    if _AH_MODELS is None:
        _AH_MODELS = {}
        d = Path(__file__).resolve().parent.parent / "toon" / "public" / "models"
        idx = {}
        for f in [d / "index.json", *sorted(d.glob("index.*.json"))]:     # index.json + any per-pack index.<pack>.json
            try:
                idx.update(json.loads(f.read_text(encoding="utf8")))
            except Exception:
                pass
        for nm in sorted(idx):                       # names: "vending_machine" is matched by its last word too ("machine" would
            _AH_MODELS.setdefault(nm.replace("_", ""), nm)   # be too vague, so only the full name, spaces removed, and the name itself)
            _AH_MODELS.setdefault(nm, nm)
        for nm in sorted(idx):
            for t in idx[nm].get("tags", []):
                _AH_MODELS.setdefault(t.lower().replace(" ", ""), nm)
    return _AH_MODELS


AH_CODE_WORDS = [("giantshovel", r"\b(?:giant|huge|enormous|house-tall|massive) shovels?\b|\bshovels? (?:as tall as|taller than|the size of) (?:a|the) (?:house|building)"),
                 ("icepop", r"\bice[- ]?pops?\b|\bpopsicles?\b|\bpaletas?\b"),
                 ("eiffeltower", r"\beiffel\b"),
                 ("legobrick", r"\blegos?\b|\b(?:toy|lego|plastic) bricks?\b"),
                 ("noodlecup", r"\bcup noodles?\b|\binstant noodles?\b|\bnoodles?\b|\bramen\b"),
                 ("guitar", r"\bguitars?\b|\bguitarists?\b"),
                 ("rollercoaster", r"\broller ?coasters?\b|\bamusement parks?\b|\btheme parks?\b"),
                 ("horse", r"\bhorses?\b|\bhorse racing\b|\bjockeys?\b|\bracehorses?\b|\bthoroughbreds?\b"),
                 ("baseball", r"\bbaseballs?\b|\bfastballs?\b|\bcurveballs?\b|\bsliders?\b(?=.*\b(?:pitch\w*|baseball)\b)"),
                 ("console", r"\bconsoles?\b|\bplaystations?\b|\bswitch 2\b|\bxbox\b"),
                 ("golfball", r"\bgolf ?balls?\b"),
                 ("golfclub", r"\bgolf clubs?\b|\bputters?\b|\bclubs?\b(?=.*\bgolf)|\bgolf\b.*\b(?:clubs?|drivers?)\b")]


def ah_words_to_models(text: str) -> list:
    """model names for the words (and two-word runs like "vending machine") of a sentence, in order, plurals ok"""
    m, out = ah_models(), []
    low = text.lower()
    for nm, rx in AH_CODE_WORDS:        # Nov 21: words that name a code-built object (console, golf ball, golf club) come first
        if re.search(rx, low) and nm not in out:
            out.append(nm)
    ws = [w for w in re.findall(r"[a-z]+", low)]
    def look(w: str):
        if w in _AH_STOP:                 # the word itself is stopped, so its stem is too ("woods" (Tiger Woods) is not a log)
            return None
        for c in (w, w[:-1] if w.endswith("s") else "", w[:-2] if w.endswith("es") else "", w[:-3] + "y" if w.endswith("ies") else ""):
            if c and c in m and c not in _AH_STOP:
                return m[c]
    for i, w in enumerate(ws):
        hit = (i + 1 < len(ws) and look(w + ws[i + 1])) or look(w)
        if hit and hit not in out:
            out.append(hit)
    return out


AH_SKIN_TONES = {"light": "#ffd19f", "medium": "#c68642", "tan": "#e0ac7e", "brown": "#a8744a", "dark": "#6b4a32"}


def ah_look(o: dict) -> dict:
    """our Outfit dict -> the afterhour Look (white round heads for everyone, like the reference)"""
    hat = o.get("hat")
    lk = {"body": o.get("jacket", "#1b1b22"), "legs": o.get("pants", "#141418")}
    if hat in ("crown", "hardhat", "fedora", "cap"):
        lk.update(hat=hat, hatColor=o.get("cap") or "#f2c230", **({"hatText": o["chest"]} if hat == "hardhat" and o.get("chest") else {}))
    elif hat == "hair":
        lk.update(hat="hair", hair=o.get("hair", "#2a1d16"))
    if o.get("glasses"):
        lk["glasses"] = "shades" if o.get("hat") == "crown" else "round"
    if o.get("beard"):   # Nov 17 (Sam on Shaq: "doesn't really look like him"): his goatee
        lk.update(beard=o["beard"], beardCol=o.get("beardCol", "#2a1d16"))
    sk = (o.get("skin") or "").lower()               # Nov 17 (Sam: "Shaq should be black"): the hero's skin tone; plain "light" keeps the white style
    sk = AH_SKIN_TONES.get(sk.lstrip("#"), sk)      # names (light/medium/tan/brown/dark) or hex
    if sk.startswith("#") and sk not in ("#f5c9a0", "#ffd19f"):   # the unset default ("light") keeps the white style
        lk["skin"] = sk
    if o.get("num"):
        lk["text"] = str(o["num"])
    elif o.get("chest") and hat != "hardhat":
        lk["text"] = str(o["chest"])[:6]
    h = float(o.get("height") or 1)
    if abs(h - 1) > 0.03:
        lk["height"] = round(max(0.85, min(1.35, h)), 2)
    if o.get("kit") in ("bball", "soccer"):            # athletes in a sleeveless jersey with their number, not a jacket
        lk.update(outfit="jersey", trim=o.get("trim", "#ffffff"))
    elif o.get("leather"):
        lk.update(outfit="leather", body="#141414")
    return lk


# ---- Nov 17 (Ninja review: a streamer on a soccer pitch, Drake / LeBron / his mom named but never shown, a clock on
# "followers", an outro of repeats): who the Short is about, who a sentence names, and "no two shots look alike" ----
AH_SPORT_SETS = ("court", "pitch", "diamond", "gridiron", "tennis", "golf", "pool", "rink", "ring", "track")
# Nov 18: a baseball line stands on the baseball field (diamond), not a purple park
AH_BASEBALL_RX = re.compile(r"\b(?:baseball|mlb|major leagues?|the majors|ballparks?|home runs?|homers?|grand slams?|pitchers?|fastballs?|curveballs?|strikeouts?|"
                            r"innings?|shortstops?|outfield\w*|dugouts?|batters?|world series|yankees|dodgers|mets|red sox|cubs|braves|astros|padres|phillies|"
                            r"blue jays|orioles|white sox|nationals|mariners|brewers|rockies|marlins|diamondbacks|first base|home plate)\b", re.I)
# Nov 18: American football lines stand on the gridiron, tennis lines on the tennis court. Soccer / Premier League / World Cup / FIFA lines stay on the pitch.
AH_SOCCER_RX = re.compile(r"\b(?:soccer|premier league|world cup|fifa|uefa|champions league|la liga|bundesliga|serie a|mls|striker|midfielder|goalkeeper|penalty kicks?|"
                          r"messi|ronaldo|mbappe|neymar|haaland|beckham|real madrid|barcelona|manchester|liverpool|chelsea|arsenal)\b", re.I)
AH_GRID_STRONG_RX = re.compile(r"\b(?:nfl|n\.f\.l\.?|quarterbacks?|touchdowns?|super bowl|linebackers?|wide receivers?|running backs?|tight ends?|end zone|gridiron|american football|"
                               r"pro bowl|hail mary|field goals?|offensive lines?|cornerbacks?|punters?|kickoffs?)\b", re.I)
AH_GRID_WEAK_RX = re.compile(r"\bfootball (?:teams?|players?|fields?|games?|coach\w*|season|stars?|careers?|scholarships?|stadiums?|leagues?)\b|\b(?:college|high school|pro|play(?:ed|ing)?|cut from|made) football\b", re.I)
AH_TENNIS_NAMES = ("serena", "federer", "djokovic", "nadal", "alcaraz", "sinner", "osaka", "sharapova", "gauff", "sabalenka", "venus", "agassi", "sampras", "murray", "swiatek")
AH_TENNIS_STRONG_RX = re.compile(r"\b(?:tennis|open era|wimbledon|us open|australian open|french open|roland garros|atp|wta|rackets?|racquets?|forehands?|backhands?|match point|double faults?)\b", re.I)
AH_TENNIS_WEAK_RX = re.compile(r"\b(?:grand slams?|serves?|served|serving|aces?)\b(?! (?:the |our |his |her )?(?:customers?|food|burgers?|coffee|drinks?|meals?|tables?|guests?|clients?|users?|ads?|ad\b))", re.I)


# Nov 21: golf lines stand on the golf course (golf, golfer, the Masters, putt, fairway, PGA, tee off, birdie, hole in one)
AH_GOLF_RX = re.compile(r"\b(?:golf\w*|the masters|masters (?:tournament|champion\w*)|putt\w*|fairways?|pga|tee(?:s|d|ing)? off|birdies?|bogeys?|holes? in one|tiger woods|caddies|caddie|putting greens?|golf courses?)\b", re.I)


# Nov 21: an empty swimming pool used as a practice court. "pool" alone counts, but not carpool / pool of money / prize pool / pool table
AH_POOL_RX = re.compile(r"\bswimming pools?\b|\b(?:empty|drained|dry|disused|abandoned|backyard|hotel|public|old) pools?\b|(?<![\w-])(?<!prize )(?<!talent )(?<!gene )(?<!money )(?<!betting )(?<!car)(?<!liquidity )(?<!the )pools?\b(?! (?:of|table|hall|party|money|funds?|cash|cue|shark)\b)|\bthe pool\b(?! (?:of|table|hall|money|funds?|cash)\b)", re.I)


def ah_sport_set(txt: str, ctx: dict | None = None) -> str | None:
    """the American football / tennis / golf set a line belongs on (None: not a gridiron / tennis line). Soccer lines are never taken."""
    ctx = ctx or {}
    if AH_POOL_RX.search(txt):
        return "pool"
    if AH_GOLF_RX.search(txt):
        return "golf"
    if AH_TENNIS_STRONG_RX.search(txt) or (ctx.get("tennis") and AH_TENNIS_WEAK_RX.search(txt)):
        return "tennis"
    if AH_SOCCER_RX.search(txt) or ctx.get("soccer") and not AH_GRID_STRONG_RX.search(txt):
        return None
    if AH_GRID_STRONG_RX.search(txt) or AH_GRID_WEAK_RX.search(txt):
        return "gridiron"
    return None
# Nov 18: farm lines (barn, tractor, crops) stand on the farm; grocery / cashier lines in the grocery store
AH_FARM_STRONG_RX = re.compile(r"\b(?:farms?|farmers?|farming|farmland|barns?|crops?|harvest\w*|ranch\w*|vineyards?|grow(?:s|ing)? (?:grapes|corn|wheat|crops))\b", re.I)
AH_FARM_RX = re.compile(AH_FARM_STRONG_RX.pattern + r"|\btractors?\b", re.I)
AH_STORE_RX = re.compile(r"\b(?:grocer(?:y|ies)|supermarkets?|store clerks?|baggers?|cashiers?|check-?outs?|checkout counters?)\b", re.I)


# Nov 21: factory floor and mountain / mine sets (164 Nvidia shovels). "mine" alone is a pronoun, so only mine phrases count
AH_FACTORY_RX = re.compile(r"\b(?:factor(?:y|ies)|assembly lines?|conveyor belts?|production lines?|robot arms?|manufactur\w+)\b", re.I)
AH_MOUNTAIN_RX = re.compile(r"\b(?:mountains?|(?:gold|coal|silver|copper|salt|diamond) mines?|the mines?|mine (?:shafts?|carts?|entrances?)|mining|(?<!bitcoin )(?<!crypto )(?<!coin )miners?|gold rush|gold veins?)\b", re.I)


# Nov 21: ice hockey lines stand on the rink set
AH_RINK_RX = re.compile(r"\b(?:hockey|nhl|rinks?|pucks?|stanley cups?|oilers|goalies?|slap ?shots?|on the ice|ice rinks?|power plays?|hat tricks?)\b", re.I)


def ah_scene_set(txt: str) -> str | None:
    """rink / factory / mountain: the place a factory-floor or mine line stands in (None: neither)"""
    if AH_RINK_RX.search(txt):
        return "rink"
    if AH_FACTORY_RX.search(txt):
        return "factory"
    if AH_MOUNTAIN_RX.search(txt):
        return "mountain"
    return None


def ah_place_set(txt: str) -> str | None:
    """the farm / grocery store set a line's words name (None: neither)"""
    if AH_STORE_RX.search(txt):
        return "store"
    if AH_FARM_RX.search(txt):
        return "farm"
    return None
# Nov 18: a gym line stands in the gym, an animation / film studio line in the animation studio (a RECORDING / music studio stays on the stage)
AH_GYM_RX = re.compile(r"\b(?:gyms?|training (?:centre|center)s?|weight rooms?|workouts?|work(?:s|ed)? out|weightlifting|bodybuild\w*|fitness (?:centre|center|club)s?|treadmills?)\b", re.I)
AH_STUDIO_RX = re.compile(r"\b(?:animation|animated|cartoons?|animators?|film studios?|movie studios?)\b|(?<!recording )(?<!music )(?<!podcast )(?<!sound )(?<!radio )(?<!photo )(?<!dance )(?<!yoga )(?<!tv )(?<!television )\bstudios?\b(?! album)", re.I)


def ah_room_set(txt: str) -> str | None:
    """gym / studio: the room a training or animation-studio line belongs in (None: neither)."""
    if AH_STUDIO_RX.search(txt) and not re.search(r"\b(?:recording|music|podcast) studios?\b", txt, re.I):
        return "studio"
    if AH_GYM_RX.search(txt):
        return "gym"
    return None


AH_SCRIPT_SET = {"gaming": "office", "office": "office", "studio": "stage", "stage": "stage", "store": "stall", "warehouse": "garage",
                 "launch": "space", "city": "street"}
AH_GAMER_GROUP = ["office", "lab", "garage", "stage"]
AH_ROOM_GROUP = ["office", "boardroom", "lab"]
AH_MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december"
AH_TIME_RX = re.compile(r"\b(?:1[5-9]|20)\d\d\b|\b\d{1,2}(?::\d\d)?\s?(?:a\.?m\.?|p\.?m\.?)|o'clock|\bmidnight\b|\bnoon\b|"
                        r"\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|a few|several|many)\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?|decades?)\b|"
                        r"\b(?:" + AH_MONTHS + r")\b|\byears? (?:ago|later|earlier)\b|\bovernight\b|\bdeadline\b|\bcountdown\b|\bby (?:friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b", re.I)
AH_TIME_THINGS = {"clock", "alarmclock", "stopwatch", "hourglass", "calendar", "watch", "wristwatch", "timer"}
# capitalised words that are never a person (brands, games, teams, places, calendar words)
AH_NOT_PERSON = set("""converse puma reebok under armour jordan_brand coca cola pepsi nvidia openai spotify disney walmart target costco chipotle visa robinhood delta marriott duolingo uber january february march april may june july august september october november december monday tuesday wednesday thursday
friday saturday sunday fortnite apex legends twitch youtube tiktok instagram google nike adidas netflix amazon apple tesla microsoft meta
facebook xbox playstation nintendo roblox minecraft valorant league warzone call duty five guys mcdonald mcdonalds starbucks uber lyft
lakers bulls warriors celtics heat knicks spurs nets magic suns clippers cavaliers cavs mavericks rockets nba nfl mlb fifa uefa ufc wnba
olympics olympic world cup super bowl finals real madrid barcelona united city chelsea arsenal liverpool psg bayern juventus milan
america american usa us uk canada france brazil china japan korea europe asia africa london paris new york los angeles miami chicago texas
california orlando boston ai ceo cfo ipo wikipedia internet monster energy red bull coca cola pepsi disney spotify hbo hulu espn tnt
christmas thanksgiving easter god""".split())
AH_PERSON_CTX = re.compile(r"(?:\bwith|\bagainst|\bvs\.?|\bversus|\balongside|\bnamed|\bcalled|\bmet|\bmeets|\bbeat|\bbeats|\bbeating|\bfacing|\bfaced|\bthan|\bbehind|\bsigns?|\bsigned|\bhires?|\bhired|\bfires?|\bfired)\s+$")
# people the voice names that everyone knows: (number, body, trim) for athletes; plain tones for the rest
AH_PEOPLE_ATH = {"lebron": ("23", "#fdb927", "#552583", "#8a5a3c"), "jordan": ("23", "#ce1141", "#111111", "#6b4428"), "kobe": ("24", "#fdb927", "#552583", "#8a5a3c"),
                 "curry": ("30", "#1d428a", "#ffc72c", "#a8744a"), "shaq": ("34", "#552583", "#fdb927", "#4a3020"), "shaquille": ("34", "#552583", "#fdb927", "#4a3020"),
                 "durant": ("35", "#1d1160", "#e56020", "#8a5a3c"), "giannis": ("34", "#00471b", "#eee1c6", "#6b4428"), "wembanyama": ("1", "#222222", "#c4ced4", "#6b4428"),
                 "wemby": ("1", "#222222", "#c4ced4", "#6b4428"), "messi": ("10", "#75aadb", "#ffffff", "#e0ac7e"), "ronaldo": ("7", "#c8102e", "#ffffff", "#d9a273"),
                 "mbappe": ("10", "#1a2a6c", "#ffffff", "#6b4428"), "mbappé": ("10", "#1a2a6c", "#ffffff", "#6b4428"), "neymar": ("10", "#f7d117", "#1a8a3a", "#c68642"),
                 "haaland": ("9", "#6cabdd", "#ffffff", "#f1c9a0"), "mahomes": ("15", "#e31837", "#ffb81c", "#a8744a"), "brady": ("12", "#d50a0a", "#ffffff", "#e8b890"),
                 "ohtani": ("17", "#005a9c", "#ffffff", "#e0ac7e"), "bolt": ("9", "#2a8f3a", "#f7d117", "#4a3020"), "doncic": ("77", "#00538c", "#ffffff", "#e8b890"),
                 "tatum": ("0", "#007a33", "#ffffff", "#8a5a3c"), "salah": ("11", "#c8102e", "#ffffff", "#c68642"), "yamal": ("19", "#a50044", "#004d98", "#c68642")}
AH_PEOPLE_PLAIN = {"drake": ("#2a2a36", "#1a1a1a", "#a8744a"), "rihanna": ("#7a2a4a", "#2a1a1a", "#8a5a3c"), "beyonce": ("#c9a227", "#2a1a1a", "#a8744a"),
                   "beyoncé": ("#c9a227", "#2a1a1a", "#a8744a"), "kanye": ("#3a3a3a", "#1a1a1a", "#a8744a"), "eminem": ("#555555", "#d8c27a", "#f1c9a0"),
                   "snoop": ("#4a6aa8", "#1a1a1a", "#6b4428"), "bieber": ("#7a7a8a", "#6a4a2a", "#f1c9a0"), "swift": ("#e8d8a8", "#c9a227", "#f1c9a0"),
                   "bezos": ("#2a3a4a", "#4a4a4a", "#e8b890"), "musk": ("#1a1a24", "#2a1a1a", "#f1c9a0"), "zuckerberg": ("#6a6a72", "#4a2f1c", "#f1c9a0"),
                   "obama": ("#1f2f4f", "#6a6a6a", "#8a5a3c"), "trump": ("#1f2f4f", "#d8b84a", "#e8b890"), "oprah": ("#8a3a5a", "#1a1a1a", "#6b4428"),
                   "mrbeast": ("#2a8fd8", "#2a1a10", "#e8b890"), "pewdiepie": ("#c43a3a", "#d8b84a", "#f1c9a0"), "shroud": ("#3a4a3a", "#2a2a2a", "#e8b890"),
                   "tfue": ("#1a1a24", "#2a1a10", "#e8b890"), "faker": ("#7a1a1a", "#1a1a1a", "#e0ac7e"), "serena": ("#f4f4f4", "#1a1a1a", "#6b4428"), "clark": ("#fdb927", "#1a1a1a", "#f1c9a0")}
# "his mom", "a coach", "the boss": (body, hair, chest text, expression) so the viewer sees the relation
AH_REL = {"mom": ("#d96a8a", "#4a2f1c", "", "smile"), "mother": ("#d96a8a", "#4a2f1c", "", "smile"), "mum": ("#d96a8a", "#4a2f1c", "", "smile"),
          "mama": ("#d96a8a", "#4a2f1c", "", "smile"), "grandma": ("#b48ae0", "#c8c8c8", "", "smile"), "grandmother": ("#b48ae0", "#c8c8c8", "", "smile"),
          "dad": ("#6b7a8f", "#8a8a8a", "", "smile"), "father": ("#6b7a8f", "#8a8a8a", "", "smile"), "grandpa": ("#6a8a6a", "#d8d8d8", "", "smile"),
          "brother": ("#2a8f6a", "#3a2a1c", "", "grin"), "sister": ("#e0a030", "#3a2a1c", "", "grin"), "wife": ("#c0533a", "#2a1a10", "", "smile"),
          "husband": ("#3a4a8a", "#2a1a10", "", "smile"), "girlfriend": ("#c0533a", "#2a1a10", "", "smile"), "boyfriend": ("#3a4a8a", "#2a1a10", "", "smile"),
          "son": ("#4a8ad8", "#3a2a1c", "", "grin"), "daughter": ("#e86a9a", "#3a2a1c", "", "grin"), "friend": ("#2a8f6a", "#5a3a20", "", "grin"),
          "coach": ("#1b3a6b", "#2a2a2a", "COACH", "neutral"), "teacher": ("#6a4a8a", "#5a5a5a", "", "neutral"),
          "boss": ("#2a2f3f", "#2a2a2a", "BOSS", "angry"), "manager": ("#2a2f3f", "#3a2a1c", "", "neutral"), "agent": ("#2a2f3f", "#3a2a1c", "", "smug"),
          "investor": ("#1f3a2f", "#4a4a4a", "", "smug"), "teammate": ("#3a6ad8", "#2a1a10", "", "grin"),
          "opponent": ("#b02a2a", "#2a1a10", "", "angry"), "referee": ("#222222", "#2a2a2a", "REF", "angry"),
          "co-founder": ("#d8a02a", "#3a2a1c", "", "smile"), "cofounder": ("#d8a02a", "#3a2a1c", "", "smile"),
          "judge": ("#222222", "#9a9a9a", "", "angry"), "doctor": ("#e8e8f0", "#2a2a2a", "", "neutral")}
AH_REL_ALT = {"friends": "friend", "investors": "investor", "teammates": "teammate", "coaches": "coach", "brothers": "brother", "sisters": "sister",
              "rival": "opponent", "doctors": "doctor"}
AH_REL_RX = re.compile(r"\b(?:his|her|their|a|an|the|my|your|our)\s+(?:(?:old|new|young|best|first|former|own|famous|big|high school)\s+)*("
                       + "|".join(sorted((re.escape(k) for k in [*AH_REL, *AH_REL_ALT]), key=len, reverse=True))
                       + r")(?:'s)?\b(?!\s+(?:game|company|brand|app|team|product|show|league|rating|ranking|model|idea))", re.I)
AH_PAL = ["#e86a6a", "#5ad0d8", "#8bc34a", "#b48ae0", "#f2a33a", "#4a7bd0", "#d96ab8", "#6ad89a"]
AH_VIEWS = ["ms", "face", "cu", "low", "ws", "wide"]
AH_NO_LOW = {"stage", "throne", "ring"}   # raised floors: the low camera ends up inside them
AH_SKIP_FIRST = {"i", "it", "its", "he", "she", "they", "we", "you", "the", "a", "an", "this", "that", "but", "and", "then", "now", "so", "still",
                 "just", "back", "by", "in", "at", "on", "of", "to", "for", "with", "from", "when", "while", "after", "before", "one", "two",
                 "three", "every", "each", "all", "no", "not", "if", "yes", "his", "her", "their", "our", "my", "your", "today", "later", "next",
                 "some", "many", "most", "what", "who", "why", "how", "here", "there", "even", "only", "once", "soon", "first", "last"}


AH_FOOD_RX = re.compile(r"\b(?:restaurants?|burgers?|cheeseburgers?|diners?|fast[- ]?food|eateries|franchises?|fries|pizzerias?|cafes?|food chain|drive[- ]?thru)\b", re.I)
AH_COUNT_RX = re.compile(r"\b\d[\d,]*\s+(?:\w+\s+)?(?:restaurants?|stores?|shops?|locations?|branches|outlets?|cafes?|franchises?)\b", re.I)
AH_RATIO_RX = re.compile(r"\b(?:one|1)\s+(?:in|out of)\s+(?:every\s+)?(?:ten|10|five|5|four|4|three|3|twenty|20|hundred|100)\b|\b(?:ten|10) (?:percent|per ?cent)\b|\b10\s?%", re.I)
AH_DARK_SETS = {"street", "graveyard", "field", "space", "throne"}   # night / dim rooms: two people do not read there
AH_FACE_VIEWS = ("face", "cu")                                       # close views crop cards and held things


def ah_fits_props(view: str | None, has_props: bool) -> str | None:
    """a close view (face / cu) crops a card or a held thing: use the medium shot instead"""
    return "ms" if (has_props and view in AH_FACE_VIEWS) else view


def ah_ratio_row(k: int, n: int = 10) -> list:
    """"one in every ten": ten small figures in a row, one lit up (gold, halo, bigger)"""
    hot = 2 + (k * 3) % max(1, n - 3)
    row = []
    for i in range(n):
        x = (i - (n - 1) / 2) * 0.21
        if i == hot:
            row.append({"look": {"body": "#f2b630", "legs": "#2c3550", "hat": "crown", "hatColor": "#f2b630", "halo": True}, "at": [x, 0, 1.5],
                        "pose": "cheer", "expr": "grin", "scale": 0.36})
        else:
            row.append({"look": {"body": "#8c93a6", "legs": "#2c3550", "hat": "none"}, "at": [x, 0, 1.5], "pose": "stand", "expr": "neutral", "scale": 0.27})
    return row


def ah_hero_tokens(script: dict | None, plan: dict) -> set:
    toks = set()
    for v in ((script or {}).get("name_card"), (script or {}).get("company"), (script or {}).get("hero_name")):
        toks |= {t for t in re.findall(r"[a-z0-9]+", str(v or "").lower()) if len(t) >= 3}
    for t in re.split(r"[-_ ]", str(plan.get("slug") or "").lower()):
        if len(t) >= 3 and not t.isdigit() and t not in ("famous", "plan", "whatif", "story", "best", "ever", "careers", "how", "pov"):
            toks.add(t)
    return toks


def ah_context(plan: dict) -> dict:
    """who the Short is about: the script (name card + role line) and a world: gamer / athlete / other"""
    script = None
    try:
        from . import aivideo
        script = aivideo.script_for(str(plan.get("slug") or ""))
    except Exception:  # noqa: BLE001
        script = None
    sets = {sc.get("set") for sc in plan["scenes"]} | {sc.get("visual", {}).get("set") for sc in (script or {}).get("scenes", [])}
    sub = str((script or {}).get("name_sub") or "").lower()
    gamer = bool(re.search(r"streamer|gamer|esports|twitch", sub)) or "gaming" in sets
    sportish = bool(re.search(r"player|sprinter|driver|boxer|fighter|racer|athlete|golfer|swimmer|skater|champion|quarterback|runner", sub))
    athlete = bool(sets & {"court", "pitch", "field", "diamond", "gridiron", "tennis", "golf", "pool", "rink"}) or (plan.get("hero") or {}).get("kit") in ("bball", "soccer") or (sportish and not gamer)
    alltxt = " ".join(str(sc.get("text") or sc.get("line") or "") for sc in plan["scenes"])
    return {"script": script, "hero": ah_hero_tokens(script, plan), "gamer": gamer, "athlete": athlete,
            "tennis": bool(AH_TENNIS_STRONG_RX.search(alltxt)) or any(t in AH_TENNIS_NAMES for t in ah_hero_tokens(script, plan)), "soccer": bool(AH_SOCCER_RX.search(alltxt)) and not AH_GRID_STRONG_RX.search(alltxt),
            "famous": (script or {}).get("format") == "famous", "company": str((script or {}).get("company") or "").lower(),
            "brand": str((plan.get("brand") or {}).get("name") or "").lower()}


def ah_person_look(key: str, rel: str | None = None) -> tuple[dict, str]:
    """(Look, expression) for a person the voice names"""
    k = key.lower()
    if rel:
        body, hair, text, expr = AH_REL[rel]
        lk = {"body": body, "legs": "#2c3550", "hat": "hair", "hair": hair}
        if text:
            lk["text"] = text
        if rel in ("investor", "agent", "manager", "boss"):
            lk["tie"] = "#c0353a"
        if rel == "teacher":
            lk["glasses"] = "round"
        if rel == "coach":
            lk.update(hat="cap", hatColor="#1b3a6b")
        return lk, expr
    toks = re.findall(r"[a-zé]+", k)
    for tok in toks:
        if tok in AH_PEOPLE_ATH:
            num, body, trim, skin = AH_PEOPLE_ATH[tok]
            return {"body": body, "legs": trim, "hat": "hair", "hair": "#1a1410", "text": num, "outfit": "jersey", "trim": trim, "skin": skin}, "grin"
    for tok in toks:
        if tok in AH_PEOPLE_PLAIN:
            body, hair, skin = AH_PEOPLE_PLAIN[tok]
            return {"body": body, "legs": "#1a1a22", "hat": "hair", "hair": hair, "skin": skin, **({"glasses": "shades"} if tok in ("drake", "kanye", "snoop") else {})}, "smug"
    h = sum(ord(c) for c in k)
    return {"body": AH_PAL[h % len(AH_PAL)], "legs": "#2c3550", "hat": "hair", "hair": ["#3a2a20", "#1a1a1a", "#8a5a2a", "#5a3b2a"][h % 4]}, "smile"


def ah_people(text: str, ctx: dict) -> list:
    """the people a sentence names (a famous name, "his mom", "a coach"), in order, as [(key, look, expr)], at most 2"""
    t = (text or "").replace("’", "'")
    cands = []                                                    # (position, key, rel)
    for m in AH_REL_RX.finditer(t):
        r = m.group(1).lower()
        cands.append((m.start(1), r, AH_REL_ALT.get(r, r)))
    comp = {w for c in (ctx.get("company"), ctx.get("brand")) for w in re.findall(r"[a-z0-9]+", c or "") if len(w) >= 3}
    for m in re.finditer(r"\b[A-ZÉ][A-Za-zé']+(?:\s+[A-ZÉ][A-Za-zé'.]+)*", t):
        name = m.group(0)
        toks = [w.lower().strip(".'") for w in name.split()]
        known = any(w in AH_PEOPLE_ATH or w in AH_PEOPLE_PLAIN for w in toks)
        if any(w in AH_NOT_PERSON or w in comp or (w in ctx["hero"] and len(w) >= 3) for w in toks):
            continue
        if toks[0] in AH_SKIP_FIRST and not known:
            continue
        if known or (m.start() > 0 and AH_PERSON_CTX.search(t[:m.start()] + " ") and not re.search(r"\d", name)
                     and not any(ah_models().get(w) for w in toks)):
            cands.append((m.start(), name, None))
    out, seen = [], set()
    for pos, key, rel in sorted(cands):
        sig = rel or key.lower().split()[-1]
        if sig in seen:
            continue
        seen.add(sig)
        lk, ex = ah_person_look(key, rel)
        out.append((key, lk, ex))
        if len(out) >= 2:
            break
    return out


def ah_sig(s: dict) -> tuple:
    return (s["set"], s.get("view"), tuple(sorted(t["name"] for t in s.get("things") or [])), (s.get("act") or {}).get("kind"),
            tuple(sorted(str(c["look"].get("body")) + str(c["look"].get("text", "")) for c in s["chars"][1:] if c.get("who"))))


def ah_dedupe(shots: list, ctx: dict) -> list:
    """No two shots look the same (same set + view + things + people). A repeat first changes the camera, then the room
    (a gaming room has an office, a lab, a garage and a stage); the outro takes the least-used room and camera."""
    seen: dict = {}
    use: dict = {}
    for s in shots:
        use[s["set"]] = use.get(s["set"], 0) + 1
    for i, s in enumerate(shots):
        outro = s.pop("_outro", False)
        if s.get("act") or "cam" in s:
            seen.setdefault(ah_sig(s), i)
            continue
        group = AH_GAMER_GROUP if (ctx.get("gamer") and s["set"] in AH_GAMER_GROUP) else \
            AH_ROOM_GROUP if (s["set"] in AH_ROOM_GROUP and not ctx.get("athlete")) else [s["set"]]
        views = ["wide", "ws"] if any(c.get("who") for c in s["chars"][1:]) else             ["wide", "ws"] if s.get("cards") else ["ms", "ws", "wide"] if s.get("things") else AH_VIEWS
        if outro:
            cands = sorted(((st, v) for st in group for v in views), key=lambda sv: (use.get(sv[0], 0), AH_VIEWS.index(sv[1])))
        else:
            cands = [(s["set"], v) for v in views] + [(st, v) for st in group if st != s["set"] for v in views]
        want = [(st, v) for st, v in cands if ah_sig({**s, "set": st, "view": v}) not in seen]
        prev = shots[i - 1] if i else None
        want = [c for c in want if not (prev and (prev["set"], prev.get("view")) == c)] or want
        if want and (outro or ah_sig(s) in seen):
            st, v = want[0]
            use[s["set"]] -= 1
            use[st] = use.get(st, 0) + 1
            s["set"], s["view"] = st, v
        seen.setdefault(ah_sig(s), i)
    return shots


# Nov 18 (Sam: "no picture twice in a Short"): the same set came back 4x in a long Short (131 Flagg: court x5, 085 The Rock: stage x3).
# ah_spread runs after ah_dedupe: a set already used by 2 other sentences goes to a different lit room when the line does not NAME
# the place and does not need it (hoop / ball / sport act); otherwise the repeat gets a clearly different camera (side / high / low).
AH_PLACE_WORDS = {"court": r"court|arena|hardwood|gym\b|garden", "pitch": r"pitch|stadium|field|grass|turf", "stage": r"stage|podium|ceremony|draft|award|concert|spotlight|trophy|champion",
                  "ring": r"ring|wrestl|boxing|fight", "track": r"track|race|sprint", "throne": r"throne|king|crown", "space": r"space|moon|rocket|orbit|mars",
                  "beach": r"beach|sea|ocean|island|yacht", "street": r"street|city|town|road|from [A-Z]", "diner": r"diner|burger|restaurant|food",
                  "field": r"field|mine|farm", "graveyard": r"grave|dead|died"}
AH_SPORT_BOUND = {"basketball", "hoop", "soccerball", "football", "goal", "ball", "net", "whistle", "helmet", "boxing", "gloves", "bat", "baseball"}
AH_ALT_SETS = ["showroom", "office", "boardroom", "mansion", "stall", "stage", "lab"]
# Nov 18 (085: "The crowd loved him" went to the mansion, "A world record" to a market stall): a repeat moves only to a room
# whose meaning fits the line; no fitting room -> it stays and gets a new camera instead
AH_ALT_FIT = {"showroom": r"car|cars|luxury|rich|billion|buy|bought|spend|collect|watch|jet",
              "office": r"orders?|cancel|cancelled|job|work|worked|company|career|salary|paid|pay|contract|deal|signed|boss|hired|fired|employee",
              "boardroom": r"deal|company|business|ceo|board|investor|invest|shares|stake|owner|owns|brand|partner|empire",
              "mansion": r"home|house|mansion|family|mom|dad|kids|lives|lived|rich|luxury|retire",
              "stall": r"sell|sold|selling|shop|market|price|cheap|card|cards|merch|stand|ticket",
              "stage": r"crowd|fans?|famous|award|record|star|show|cheer|loved|movie|actor|film|hollywood|celebrity|viral|views",
              "lab": r"idea|tech|ai|invent|built|build|science|robot|app|code|game|design|smart|future|data",
              "garage": r"garage|car|built|start|started|first|tinker|fix"}
AH_SPREAD_CAMS = [   # side / high / low views: every card stays above the head, far enough back to keep hero + things + card in frame
    {"from": [3.9, 2.1, 7.9], "to": [3.2, 2.0, 7.1], "look": [0, 1.5, 0]},
    {"from": [-3.9, 2.1, 7.9], "to": [-3.2, 2.0, 7.1], "look": [0, 1.5, 0]},
    {"from": [0, 4.6, 8.2], "to": [0, 4.2, 7.6], "look": [0, 1.1, 0]},
    {"from": [-2.6, 0.7, 8.2], "to": [-1.9, 0.85, 7.5], "look": [0, 1.7, 0]},
    {"from": [2.6, 0.7, 8.2], "to": [1.9, 0.85, 7.5], "look": [0, 1.7, 0]},
    {"from": [6.2, 2.8, 10.0], "to": [5.4, 2.6, 9.2], "look": [0, 1.3, 0]},
]


def ah_spread(shots: list, ctx: dict) -> list:
    use: dict = {}         # set -> distinct sentence ids that showed it
    looks: dict = {}       # set -> views / cams already shown there
    moved: dict = {}       # sentence id -> (new set)
    ncam = 0
    for i, s in enumerate(shots):
        k, st = s.get("_k", i), s["set"]
        outro = s.get("_outro_seen")
        txt = s.get("_txt", "")
        bound = bool(s.get("act") or "cam" in s or outro or any(str(t["name"]) in AH_SPORT_BOUND for t in s.get("things") or [])
                     or s["chars"][0].get("pose") in ("shoot", "dunk", "jump", "run")
                     or (st == "diamond" and AH_BASEBALL_RX.search(txt))   # a baseball line stays on the field
                     or (st in ("gym", "studio") and ah_room_set(txt) == st)
                     or (st in ("gridiron", "tennis", "golf", "pool") and ah_sport_set(txt, ctx) == st)
                     or (st in ("rink", "factory", "mountain") and ah_scene_set(txt) == st)
                     or (st == "store" and AH_STORE_RX.search(txt)) or (st == "farm" and AH_FARM_STRONG_RX.search(txt)))   # a football / tennis line stays on its field
        named = bool(re.search(AH_PLACE_WORDS.get(st, r"\b" + re.escape(st) + r"\b"), txt, re.I)) if st in AH_PLACE_WORDS else bool(re.search(r"\b" + re.escape(st) + r"\b", txt, re.I))
        if k in moved:
            s["set"] = st = moved[k]
        elif not bound and not named and len(use.get(st, set()) - {k}) >= 1 and k not in use.get(st, set()):
            alts = list(AH_GAMER_GROUP + ["showroom"]) if ctx.get("gamer") else AH_ALT_SETS
            nxt = shots[i + 1]["set"] if i + 1 < len(shots) else None
            prv = shots[i - 1]["set"] if i else None
            alts = [a for a in alts if a != st and a not in AH_DARK_SETS and (a not in AH_SPORT_SETS or ctx.get("athlete"))]
            alts = [a for a in alts if re.search(r"\b(" + AH_ALT_FIT.get(a, "$^") + r")\b", txt, re.I)]
            alts.sort(key=lambda a: (len(use.get(a, ())), a in (prv, nxt)))
            if alts and len(use.get(alts[0], ())) < len(use.get(st, ())):
                moved[k] = s["set"] = st = alts[0]
        key = s.get("view") if "cam" not in s else json.dumps(s["cam"]["from"])
        seen_here = looks.setdefault(st, [])
        if k not in use.get(st, set()) and use.get(st) and not s.get("act") and "cam" not in s and (key in seen_here):
            # a repeat of the same set from a view we already showed: a different camera
            for j in range(len(AH_SPREAD_CAMS)):
                c = AH_SPREAD_CAMS[(ncam + j) % len(AH_SPREAD_CAMS)]
                if c["from"][1] < 1 and st in AH_NO_LOW:
                    continue
                if json.dumps(c["from"]) not in seen_here:
                    s["cam"] = c; ncam += j + 1; key = json.dumps(c["from"])
                    break
        use.setdefault(st, set()).add(k)
        seen_here.append(key)
    return shots


def ah_shots(plan: dict) -> list:
    hero, shots, views = plan.get("hero") or {}, [], ["ms", "face", "cu", "ms", "low", "face"]
    prev_pose = None
    prev_acts: list = []
    ctx = ah_context(plan)
    side = 0
    for k, sc in enumerate(plan["scenes"]):
        place = sc.get("place") or {0: "bridge", 1: "street", 2: "quay"}.get(sc.get("loc"), "street")
        who = {**hero, **(sc.get("who") or {})}
        outro = str(sc.get("line") or "").startswith("(outro)")
        # the set must fit who the Short is about (Ninja: a streamer stood on a soccer pitch): a gamer lives in a screens room,
        # and a non-athlete never gets a sport pitch; a place the story chose on purpose (space, stage, throne ...) stays
        aset = AH_SET.get(place) or (place if place in AH_ALL_SETS else "street")
        if (ctx["gamer"] and sc.get("set") == "gaming" and aset in ("street", "beach") + AH_SPORT_SETS) or \
                ((ctx["famous"] or ctx["gamer"]) and not ctx["athlete"] and aset in AH_SPORT_SETS):
            aset = AH_SCRIPT_SET.get(sc.get("set"), "office") if sc.get("set") != "city" else "office"
            place = next((pl for pl, st in AH_SET.items() if st == aset), place)
        # Nov 17 (Shaq test: "155 Five Guys restaurants" showed a night street): a restaurant / burger / food-chain line is in the diner
        food_line = bool(AH_FOOD_RX.search(sc.get("text") or sc.get("line") or "")) and place not in ("space", "stage", "throne") and not outro
        if food_line:
            aset = "diner"
        elif AH_BASEBALL_RX.search(sc.get("text") or sc.get("line") or "") and aset not in ("space", "stage", "throne") and place not in ("space", "stage", "throne") and not outro:
            aset = "diamond"                                        # Nov 18: baseball lines live on the baseball field
        elif ctx.get("tennis") and aset == "court":   # Nov 18 Serena remake: the outro landed on the basketball arena
            aset = "tennis"                                         # a tennis star's "court" is the tennis court, never the basketball arena
        elif ah_sport_set(sc.get("text") or sc.get("line") or "", ctx) and aset not in ("space", "stage", "throne") and place not in ("space", "stage", "throne") and not outro:
            aset = ah_sport_set(sc.get("text") or sc.get("line") or "", ctx)   # Nov 18: American football -> gridiron, tennis -> tennis court
        elif ah_scene_set(sc.get("text") or sc.get("line") or "") and aset not in ("space", "stage", "throne") and place not in ("space", "stage", "throne") and not outro:
            aset = ah_scene_set(sc.get("text") or sc.get("line") or "")   # Nov 21: factory floor / mountain mine lines stand there
        elif ah_place_set(sc.get("text") or sc.get("line") or "") and aset not in ("space", "stage", "throne") and place not in ("space", "stage", "throne") and not outro:
            aset = ah_place_set(sc.get("text") or sc.get("line") or "")   # Nov 18: farm / grocery store lines stand there
        elif ah_room_set(sc.get("text") or sc.get("line") or "") and aset not in ("space", "throne") and place not in ("space", "throne") and not outro:
            aset = ah_room_set(sc.get("text") or sc.get("line") or "")        # Nov 18: gym lines -> gym, animation-studio lines -> studio
        # the hero DOES what the sentence says (Sam, Nov 16: "jump shoes, people should jump"): pipeline/ah_actions
        pose = ah_actions.pick_pose(sc.get("text") or sc.get("line") or "", list(sc.get("things") or []) + list(sc.get("props") or []),
                                    sc.get("mood", "happy"), sc.get("action"), place, prev_pose)
        # Nov 16 (Sam: "he hasn't played basketball"): a line that DOES something gets a real mini-scene (`act`)
        thing_names = list(sc.get("things") or []) + list(sc.get("props") or [])
        line_txt = sc.get("text") or sc.get("line") or ""
        if not AH_TIME_RX.search(line_txt):                         # a clock / calendar only for a real date or time ("in 2019", "3 a.m.")
            thing_names = [t for t in thing_names if str(t).lower() not in AH_TIME_THINGS]
        act = ah_actions.pick_act(sc.get("text") or sc.get("line") or "", thing_names, place, sc.get("mood", "happy"),
                                  sc.get("action"), prev_acts[-2:])
        if act and (outro or (not ctx["athlete"] and (ctx["famous"] or ctx["gamer"]) and ah_actions.ACT_SET.get(act, ((), None))[1] in AH_SPORT_SETS + ("field",))):
            act = None                                              # no sport act for a non-athlete, and no repeat act in the outro
        prev_acts.append(act)
        if act:
            pose = ah_actions.ACT_POSE[act]
        else:
            # Sam, Nov 16: an act that is switched OFF (not in approved.json) must never leave a hole: the line still
            # shows its object (cash stack, contract, camera, ball...) held/next to him and the closest simple pose
            want = ah_actions._pick_act_all(sc.get("text") or sc.get("line") or "", thing_names, place,
                                            sc.get("mood", "happy"), sc.get("action"), prev_acts[-3:-1])
            if want:
                pose = ah_actions.ACT_POSE.get(want, pose)
                key = {"sign_contract": "letter", "count_cash": "cash", "throw_cash": "cash", "stack_gold": "goldbar"}.get(want)
                own = [key] if key else sorted(ah_actions.ACT_OWN_PROPS.get(want) or [])
                if want in ("pitch", "bat_swing"):                  # Nov 21: a baseball act's ball is the baseball, never a basketball
                    own = ["baseball"]
                for nm in own:
                    if AH_THING.get(nm) or nm in AH_THING.values():
                        thing_names = [nm] + [t for t in thing_names if t != nm]
                        break
                if want in ("count_cash", "throw_cash", "stack_gold", "vault"):
                    sc = {**sc, "beat": "money"}                        # coins rain too
        if not act and pose == "stand" and sc["n"] > 60:
            pose = "talk"                                           # never a 2 s+ statue: he explains with his hands
        if outro:
            pose = "cheer" if k % 2 else "wave"                     # the sign-off: waves and cheers, never a replay of an earlier picture
        prev_pose = pose
        chars = [{"look": ah_look(who), "at": [0, 0, 0], "pose": pose, "expr": AH_EXPR.get(sc.get("mood", "happy"), "smile")}]
        # every person the sentence names (Drake, LeBron, "his mom", a coach) stands in the shot next to him
        people = [] if (sc.get("who") or sc.get("hide") or outro) else ah_people(line_txt, ctx)
        crowd_n = min(6, int(sc.get("crowd") or 0) // 5) if not people else min(2, int(sc.get("crowd") or 0) // 15)
        if outro:
            crowd_n = max(crowd_n, 3)
        for i in range(crowd_n):     # a few extras behind, cheering/reacting
            chars.append({"look": AH_CROWD[i % len(AH_CROWD)], "at": [(-1) ** i * (1.3 + 0.6 * (i // 2)), 0, -1.6 - 0.9 * (i // 2)],
                          "pose": "cheer" if (sc.get("action") == "cheer" or outro) else "stand", "expr": "laugh" if i % 2 else "smile"})
        for i, (_nm, plk, pex) in enumerate(people):
            sgn = (1 if (side + i) % 2 == 0 else -1) if len(people) == 1 else (-1 if i == 0 else 1)
            chars.append({"look": plk, "at": [sgn * 1.0, 0, -0.25], "rot": -sgn * 0.4, "pose": "talk" if pex in ("smug", "angry") else "stand",
                          "expr": pex, "who": True})
        if people:
            side += 1
        cards = []
        top = 1.97 + (float(chars[0]["look"].get("height") or 1) - 1) * 1.4     # top of the hero's head: cards sit ABOVE it, never behind it
        if sc.get("card") and sc.get("brand") and sc.get("beat") in ("logo", "sign") and (AH_COUNT_RX.search(line_txt) or AH_FOOD_RX.search(line_txt)):
            # "155 Five Guys restaurants": the brand sign above the head and the number card under it (Nov 17 Shaq test)
            b = sc["brand"]; c = dict(sc["card"]); c.pop("sub", None)
            cards.append({"text": b["name"].upper(), "kind": "sign", "bg": b.get("bg"), "fg": b.get("fg"), "at": [0.0, top + 0.95, -0.7], "w": 1.15})
            cards.append({**c, "at": [0.55, top + 0.35, -0.6], "w": 0.62})
        elif sc.get("card"):
            c = dict(sc["card"]); cards.append({**c, "at": [0.3, top + 0.5, -0.6], "w": 0.9})   # above the head, in frame
        elif sc.get("brand") and sc.get("beat") in ("logo", "sign"):
            b = sc["brand"]; cards.append({"text": b["name"].upper(), "kind": "sign", "bg": b.get("bg"), "fg": b.get("fg"), "at": [0.0, top + 0.5, -0.7], "w": 1.0})
        if food_line and not outro and not act and not any(str(t).lower() in ("burger", "snack", "pizza") for t in thing_names) and re.search(r"burger|restaurant|five guys|fast[- ]?food|chain", line_txt, re.I):
            thing_names = ["burger"] + thing_names                  # the burger itself is on screen when the line is about burgers / a burger chain
        if aset == "factory":                       # Nov 21: the factory floor is the factory; no tiny factory model on it
            thing_names = [t for t in thing_names if str(t) not in ("factory", "plant")]
        if aset == "pool":                          # Nov 21: the pool has its own tennis balls
            thing_names = [t for t in thing_names if str(t) not in ("ball", "basketball", "soccerball", "football")]
        if aset == "golf":                          # Nov 21: a golf ball is the set's own; drop generic balls
            thing_names = [t for t in thing_names if str(t) not in ("ball", "basketball", "soccerball", "football")]
        if aset == "diamond":                       # Nov 21: the baseball field has its own ball; a generic ball is a baseball, never a basketball
            thing_names = ["baseball" if str(t) in ("ball", "basketball", "soccerball") else t for t in thing_names]
        if aset in ("gridiron", "tennis"):          # Nov 18: the field has its own ball; a generic "ball" becomes the right one, never a soccer ball
            thing_names = ["football" if str(t) in ("ball", "basketball", "soccerball") and aset == "gridiron" else t for t in thing_names]
            if aset == "tennis":
                thing_names = [t for t in thing_names if str(t) not in ("ball", "basketball", "soccerball")]
        elif aset == "pitch" or ctx.get("soccer"):    # Nov 18: soccer gets a soccer ball, never a basketball / American football
            thing_names = ["soccerball" if str(t) in ("ball", "basketball") else t for t in thing_names]  # an explicit "football" stays (085: The Rock, Canadian football)
        things, seen = [], set()
        own = ah_actions.ACT_OWN_PROPS.get(act, set()) if act else set()   # the act brings this prop itself
        if not thing_names and (ctx["gamer"] or ctx["famous"]) and not (sc.get("card") or act):   # Nov 17: show what the line talks about
            low_l = line_txt.lower()
            if re.search(r"\$|\b(?:dollars?|paid|pays?|earn\w*|worth|cash|salary|bucks)\b", low_l):
                thing_names = ["cash"]
            elif ctx["gamer"] and re.search(r"\b(?:followers?|subscribers?|subs|million)\b", low_l):
                thing_names = ["ereader"]
            elif ctx["gamer"] and re.search(r"\b(?:viewers?|stream\w*|tuned in|watch\w*|crowd|fans|audience)\b", low_l):
                thing_names = ["tv"]
            elif ctx["gamer"] and re.search(r"\b(?:games?|play(?:s|ed|ing)?|fortnite|apex|match(?:es)?|ranked|controller)\b", low_l):
                thing_names = ["controller"]
        for nm in thing_names:          # things + props (+ the object of an act that is switched off)
            t3 = AH_THING.get(nm) or (nm if nm in AH_ALL_THINGS else None)
            if not t3 or t3 in seen or len(things) >= 2 or nm in own or t3 in own:
                continue
            seen.add(t3)
            big = t3 in AH_BIG
            things.append({"name": t3, "at": ([-0.9, 0, -0.4] if t3 == "giantshovel" else [-1.9, 0, -1.6]) if big else ([0.55, 0.85, 0.55] if not things else [-0.55, 0.85, 0.55]),
                           "fit": (3.8 if t3 == "giantshovel" else 1.6) if big else (0.7 if t3 == "tradingcard" else 0.42 if not things else 0.34)})   # held at hand height, in frame (a trading card must be big enough to read)
        for t3 in ([] if outro else ah_words_to_models(line_txt)):   # then library models the sentence's words name
            if len(things) >= 2:
                break
            if t3 in seen or t3 in own or (t3 in AH_TIME_THINGS and not AH_TIME_RX.search(line_txt)):
                continue
            if any(t3 in q or q in t3 for q in seen):               # "burger" + "cheeseburger": one is enough
                continue
            seen.add(t3)
            things.append({"name": t3, "at": [0.55, 0.85, 0.55] if not things else [-0.55, 0.85, 0.55], "fit": 0.42 if not things else 0.34})
        if outro:
            things = []
        shot = {"a": sc["a"], "n": sc["n"], "set": aset, "view": sc.get("view") or views[k % len(views)],
                "chars": chars, "cards": cards, "things": things, "_k": k, "_txt": line_txt, **({"coins": True} if sc.get("beat") == "money" else {})}
        # Rule (Nov 17, owner: "the things that are said are not shown"): a ratio ("one in every ten") is a row of small
        # figures with one lit up, seen from a camera that sees the floor, plus the short number card
        rm = AH_RATIO_RX.search(line_txt)
        if rm and not act and not outro and not people and "cam" not in shot:
            W2N = {"ten": 10, "five": 5, "four": 4, "three": 3, "twenty": 20, "hundred": 100}
            nums = re.findall(r"\b(ten|five|four|three|twenty|hundred|\d+)\b", rm.group(0).lower())
            pct = bool(re.search(r"%|percent|per ?cent", rm.group(0), re.I))
            n = W2N.get(nums[-1], None) if nums and not nums[-1].isdigit() else (int(nums[-1]) if nums else 10)
            n = 10 if pct else (n or 10)
            shot["chars"] = chars[:1] + ah_ratio_row(k, min(n, 12))
            shot["cam"] = {"from": [0, 2.1, 8.6], "to": [0, 2.05, 8.1], "look": [0, 1.55, 0.6]}
            shot["cards"] = [{"text": "10%" if pct else f"1 IN {n}", "kind": "sign", "bg": "#f2b630", "fg": "#1b1b22", "at": [0.0, top + 0.5, -0.6], "w": 1.0}]
            shot["things"] = []
            if shot["set"] in AH_DARK_SETS:                          # the row of figures needs light
                prev_set = shots[-1]["set"] if shots else None
                shot["set"] = prev_set if prev_set and prev_set not in AH_DARK_SETS else "office"
        if act:
            shot["act"] = {"kind": act}
            allowed, default = ah_actions.ACT_SET.get(act, ((), None))
            # the act's own world (court / pitch / ring / track / field ...), but never over a place the story CHOSE on
            # purpose: "you dunk from the free throw line ... on the Moon" stays in space (Nov 16 Wemby review)
            if default and shot["set"] not in allowed and shot["set"] not in ("space", "stage", "throne", "beach"):
                shot["set"] = default
            if "cam" not in shot:
                shot["view"] = ah_actions.ACT_VIEW.get(act, "ms")
        # his tempo (30 fps study): a new view about every 1.3 s, so a long sentence becomes several shots of the same
        # moment from different angles (medium -> face -> close -> low ...), each with its slow push-in
        # Sam, Nov 16: re-cutting the same moment every ~1.3 s "is a headache": ONE picture per sentence with a smooth
        # camera push; a cut only when the line changes. A long sentence (> ~3.5 s) gets one extra cut to a clearly
        # different framing (medium -> face), never a cut every second.
        if people and not act and "cam" not in shot:
            shot["view"] = "wide"                                   # both of them fit in frame, big enough to read (Nov 17: the mom was a tiny dark ws)
            if shot["set"] in AH_DARK_SETS and not (sc.get("place") in ("space",) or sc.get("set") == "space"):
                shot["set"] = "stall" if re.search(r"\b(?:shoes?|sneakers?|store|shop|sell\w*|buy\w*|price\w*|cost\w*|expensive)\b", line_txt, re.I) else "office"   # a lit room
        if people and act and ah_actions.ACT_VIEW.get(act) != "wide":
            shot["cam"] = {"from": [0, 2.1, 7.6], "to": [0, 2.0, 6.9], "look": [0, 1.45, 0]}   # a close act: pull back so the named person is in frame
        parts = (1 if sc["n"] <= 80 else 2) if ("cam" not in shot and not act) else 1   # an act shot is one unbroken take; a still line over ~2.7 s gets a second angle (Nov 16 Nike review: 3 s static holds)
        order = {"ms": ["ms", "face"], "face": ["face", "ms"], "cu": ["cu", "ws"], "low": ["low", "face"],
                 "ws": ["ws", "face"], "wide": ["wide", "face"]}.get(shot["view"], [shot["view"], "face"])
        if people and not act:
            order = ["wide", "ws"]
        if not act and "cam" not in shot and (shot["things"] or shot["cards"]):
            # the thing / card the line names must be in frame: no face / cu on a shot that has one
            shot["view"] = ah_fits_props(shot["view"], True)
            order = [ah_fits_props(o, True) for o in order]
            if shot["cards"] and not people:                       # a card needs head room above the hero: the wide view has it, ms does not
                shot["view"] = "wide"; order = ["wide", "ws"]
            if len(set(order)) < 2:
                order = [order[0], "ws" if order[0] != "ws" else "wide"]
        if pose in ("jump", "dunk", "shoot") and "cam" not in shot and not act:
            # Nov 16 Wemby frame check: a close-up on a jump put his head out of the top of the frame for ~2 s;
            # the whole body (and the air above it) must be in shot when he leaves the ground
            shot["view"] = "wide"; order = ["wide", "ws"]
        if k == 0 and not outro and not act and "cam" not in shot and not people and pose not in ("jump", "dunk", "shoot") and sc["n"] >= 54:
            # Nov 23 (retention: the biggest drop is at 4-5 s, the opening held one picture for 4+ s): the hook sentence opens
            # on a BIG hero with a hard push-in ("hook" view), then cuts to a medium and a wide/close within the first ~4 s
            parts = 3 if sc["n"] >= 120 else 2   # Nov 26 look audit: a 3 s hook was cut into three 1 s re-angles of one picture (Sam: ~1.5-2 s)
            order = ["hook", "wide", "ws"] if (shot["things"] or shot["cards"]) else ["hook", "ms", "face"]   # props/card: never a close view that lets them cover the face
        for j in range(parts):
            a0, a1 = sc["a"] + round(j * sc["n"] / parts), sc["a"] + round((j + 1) * sc["n"] / parts)
            sub = {**shot, "a": a0, "n": a1 - a0, "view": order[j % len(order)], **({"_outro": True} if outro else {})}
            if j and sub["things"]:
                sub["things"] = [dict(t, pop=False) for t in sub["things"]]   # already on screen: no second pop
            shots.append(sub)
    # Nov 17 test render: on raised floors the "low" camera sits INSIDE the platform (2 s of flat purple on the stage)
    for s in shots:
        if s.get("view") == "low" and s.get("set") in AH_NO_LOW and "cam" not in s:
            s["view"] = "ms"
    shots = ah_dedupe(shots, ctx)
    shots = ah_spread(shots, ctx)
    for s in shots:   # dedupe may pick "low" again when it moves a shot to a raised set
        if s.get("view") == "low" and s.get("set") in AH_NO_LOW and "cam" not in s:
            s["view"] = "ws"
    for p, s in zip(shots, shots[1:]):   # Nov 18 test 4 (132 @783): dedupe/spread left two halves of a line on the SAME set + view = a jump cut
        if s["set"] == p["set"] and s.get("view") == p.get("view") and "cam" not in s and not s.get("act"):
            alt = ["wide", "ws"] if (s.get("things") or s.get("cards")) else ["face", "ms", "ws"]
            s["view"] = next((v for v in alt if v != p.get("view") and not (v == "low" and s["set"] in AH_NO_LOW)), "wide")
    for p, s in zip(shots, shots[1:]):   # Nov 26 look audit (119 @599): a one-word line ("Nike.") made an 8-frame shot = a flash cut; it borrows frames from the shot before it (>= 12 frames, ~0.4 s)
        short = 12 - s["n"]
        if short > 0 and p["n"] - short >= 30 and not s.get("act") and not p.get("act") and s["a"] == p["a"] + p["n"]:
            p["n"] -= short; s["a"] -= short; s["n"] += short
    if "pov" in plan:
        shots = pov_shots(plan, shots)
    for sh in shots:
        sh.pop("_k", None); sh.pop("_txt", None)
        for c in sh["chars"]:
            c.pop("who", None)
    return shots


# ---- POV format (Nov 24): "POV: you tap your card for coffee" + stacked math cards + unit rows + journey flythroughs ----
POV_TOP, POV_GAP = 285, 12                    # px: first card's top edge and the gap between cards (toon/src/videos/afterhour/pov.tsx draws the same)
POV_MAX_PIECE = 50                            # frames (~1.7 s): a plain line is cut into views of at most this length
POV_COLLAPSE_AFTER = 60                       # frames the final result card is shown with its rows before they fold away
POV_PILL_FRAMES = 105                         # the "POV: you ..." pill stays up ~3.5 s (the opening views)
_POV_VIEWS = ["ms", "face", "wide", "msL", "wideR", "low", "cu", "hi", "wideL", "msR", "ws"]
_POV_FAR_VIEWS = ["wide", "wideL", "wideR", "hi", "ws"]
_POV_BIG = ("coins", "cash", "cashstack", "arrowup", "box", "pizza", "guitar", "factory")     # held in front of the chest: a close view hides the face behind them
# Nov 24 round 2: what a view looks like = (distance class, side, elevation). Two neighbouring views of one set must differ in at least one
# (wide <-> close, or the other side, or high <-> level): ws and wide are the SAME picture, so are face and cu.
_POV_LOOK = {"wide": ("far", 0, 0), "ws": ("far", 0, 0), "wideL": ("far", -1, 0), "wideR": ("far", 1, 0), "hi": ("far", 0, 1),
             "ms": ("mid", 0, 0), "msL": ("mid", -1, 0), "msR": ("mid", 1, 0), "low": ("mid", 0, -1), "face": ("close", 0, 0), "cu": ("close", 0, 0)}


def _pov_apart(v1: str | None, v2: str | None) -> bool:
    a, b = _POV_LOOK.get(v1 or ""), _POV_LOOK.get(v2 or "")
    return a is None or b is None or a != b


def _pov_views(sh: dict) -> list:
    """Views a plain POV piece may use. A close view puts the head over a card / hides it, crops a crowd or lets a held pile cover
    the face (Nov 24 stills), so those pieces keep to far views; everything else may use any view (a face is never covered)."""
    if len(sh.get("chars") or []) > 3 or any(t["name"] in _POV_BIG for t in sh.get("things") or []):
        out = list(_POV_FAR_VIEWS)
    elif sh.get("cards"):
        out = ["wide", "ms", "wideR", "hi", "msL", "wideL", "ws", "msR"]       # a card seen from an ms view is dropped (the head would cover it) - the far views before it showed it
    elif sh.get("things"):
        out = ["ms", "wide", "wideL", "msR", "wideR", "hi", "msL", "ws", "low"]
    else:
        out = list(_POV_VIEWS)
    return [v for v in out if not (v == "low" and sh.get("set") in AH_NO_LOW)]


def _pov_view_ok(sh: dict, v: str) -> bool:
    return v == "hook" or v in _pov_views(sh)


def pov_card_h(n: int) -> int:
    """Height of one math card when the stack will hold n cards in total (same formula as povCardH in pov.tsx)."""
    return 150 if n <= 2 else 128 if n == 3 else 96


def _pov_num(text: str) -> str:
    """The number a card shows ("$4.79" / "4.79" / "about $34B" -> "4.79" / "34b"), to spot the same figure on a board card and a math card."""
    m = re.search(r"([0-9][0-9,]*)(\.[0-9]+)?\s*([a-zA-Z](?![a-zA-Z]))?", str(text))
    if not m:
        return ""
    frac = (m.group(2) or "").rstrip("0").rstrip(".")
    return m.group(1).replace(",", "") + frac + (m.group(3) or "").lower()


def _pov_shown_nums(hud: dict | None, a: int, n: int) -> set:
    """Numbers the math stack shows at some moment of frames a..a+n."""
    out: set = set()
    for s in (hud or {}).get("stacks", []):
        if s["a"] < a + n and s["b"] > a:
            out |= {_pov_num(c["value"]) for c in s["cards"] if c["at"] < a + n}
    out.discard("")
    return out


def _pov_card_key(c: dict) -> tuple:
    return (c.get("op", ""), c.get("value", ""), c.get("label", ""))


def pov_hud(plan: dict) -> dict | None:
    """The 2D overlay timeline for the Short: the pill and the math-card stacks with the frame each card appears on.
    Cards accumulate over consecutive sentences until a sentence has `math: []` (clears) or a new stack starts (its first
    card differs from the stack's first card and has no operator). Several new cards in one sentence share its time evenly."""
    if "pov" not in plan:
        return None
    total = int(plan.get("total") or 0)
    stacks: list[dict] = []
    cur: dict | None = None

    def close(at: int):
        nonlocal cur
        if cur is not None:
            cur["b"] = max(cur["a"] + 1, at)
            stacks.append(cur)
            cur = None

    for e in plan["scenes"]:
        if str(e.get("line", "")).startswith("(outro)"):
            continue
        if "math" not in e:
            # Nov 26 look audit (178 penny): a finished stack (its last card is the yellow "=" result) used to stay on screen to the
            # end of the Short, over sentences about something else ("$1.14B all of them" above the lucky-penny line and the outro)
            if cur and cur["cards"] and cur["cards"][-1].get("result"):
                close(e["a"] + min(45, int(e["n"])))      # the result card lingers ~1.5 s into the next sentence, then goes
            continue
        m = e["math"]
        if not m:
            close(e["a"])
            continue
        have = list(cur["cards"]) if cur else []
        if cur and not m[0].get("op") and _pov_card_key(m[0]) != _pov_card_key(have[0]):
            close(e["a"])
            have = []
        k = 0          # cards already on the stack (a sentence may repeat the stack so far) are not new
        while k < len(m) and k < len(have) and _pov_card_key(m[k]) == _pov_card_key(have[k]):
            k += 1
        new = m[k:]
        if cur is None and new:
            cur = {"a": e["a"], "b": total, "cards": []}
        for i, c in enumerate(new):
            at = e["a"] + 3 + round(i * max(1, e["n"] - 6) / len(new))
            cur["cards"].append({**c, "at": at})
    close(total)
    for st in stacks:   # the stack has said its last thing: once the final "=" card has been up ~2 s it shrinks to just that yellow card
        last = st["cards"][-1]
        if len(st["cards"]) >= 2 and last.get("result") and st["b"] - (last["at"] + POV_COLLAPSE_AFTER) >= 24:
            st["collapse"] = last["at"] + POV_COLLAPSE_AFTER
    pill = {"text": plan["pov"], "a": 0, "n": min(POV_PILL_FRAMES, max(30, total))} if plan.get("pov") else None
    return {"pill": pill, "stacks": stacks}


def _pov_hud_at(hud: dict | None, a: int, n: int) -> dict | None:
    """Camera shift + the highest NDC y props may reach, for a shot covering frames a..a+n (None = no cards then)."""
    best, h = 0, 0
    for s in (hud or {}).get("stacks", []):
        if s["a"] < a + n and s["b"] > a:
            col = s.get("collapse")
            vis, hh = (1, 150) if col is not None and a >= col + 8 else (sum(1 for c in s["cards"] if c["at"] < a + n), pov_card_h(len(s["cards"])))
            if vis > best:
                best, h = vis, hh
    if not best:
        return None
    bottom = POV_TOP + best * (h + POV_GAP)
    return {"shift": round(min(0.14, 0.05 + 0.03 * best), 3), "ndc": round(1 - 2 * bottom / 1920, 3)}


def pov_shots(plan: dict, shots: list) -> list:
    """Re-cut the normal hero shots for the POV format: a unit-row sentence becomes a row of objects, a journey sentence a
    flythrough, every other line is cut into views of <= ~1.7 s with no picture twice; math-card stacks push the picture down."""
    hud = pov_hud(plan)
    sc = plan["scenes"]
    jc = uc = 0
    out: list = []
    done: set = set()
    for sh in shots:
        k = sh.get("_k", -1)
        e = sc[k] if 0 <= k < len(sc) else {}
        if not (e.get("units") or e.get("journey")):
            if "cam" in sh or "act" in sh:
                # the generic repeat-set cameras (high, far: an empty brown garage) and the word-triggered acts (a 5 s "sign contract" close-up
                # on "tickets", pizza eating on "snacks") are not what a POV line shows: POV cuts its own views
                sh = {q: v for q, v in sh.items() if q not in ("cam", "act")}
            out.append(sh)
            continue
        if k in done:
            continue
        done.add(k)
        a0, n0 = e["a"], e["n"]
        journey = bool(e.get("journey")) and not e.get("units")
        parts = max(1, -(-n0 // POV_MAX_PIECE))
        if journey:
            parts = 2 if n0 < 88 else 3 if n0 < 175 else 4                 # a flythrough: 2-4 views of ~1.2-2 s
            m = re.match(r"\s*(.+?)(?:\s+from\s+(.+?))?\s+to\s+(.+)$", e["journey"], re.I)
            obj, frm, to = (m.group(1), m.group(2), m.group(3)) if m else (e["journey"], None, "the network")
            jc += 1
        else:
            uc += 1
        for j in range(parts):
            x0, x1 = a0 + round(j * n0 / parts), a0 + round((j + 1) * n0 / parts)
            rig = (j + uc) % 4
            if journey:       # departure from the start shop -> low chase / aerial over the streets -> the landmark's facade (it lands, coins burst)
                rig = {2: [4, 5], 3: [4, (1, 2)[jc % 2], 5], 4: [4, 1, 2, 5]}[parts][j]
            u0, u1 = round(j / parts, 4), round((j + 1) / parts, 4)
            spec = ({"journey": {"obj": obj, **({"from": frm} if frm else {}), "to": to, "u0": u0, "u1": u1, "rig": rig, "seed": jc, "dur": n0}} if journey
                    else {"units": {**e["units"], "u0": u0, "u1": u1, "rig": rig}})
            out.append({"a": x0, "n": x1 - x0, "set": "street", "view": "ws", "chars": [], "cards": [], "things": [], "_k": k, "_txt": e.get("text", ""), **spec})
    # plain shots: the standard cut (1-3 views per line) is merged back, then cut to <= ~1.7 s pieces; never repeat a picture
    merged: list = []
    for sh in out:
        q = merged[-1] if merged else None
        if (q and sh.get("_k") == q.get("_k") and not (sh.get("units") or sh.get("journey") or q.get("units") or q.get("journey"))
                and not (sh.get("act") or q.get("act") or sh.get("cam") or q.get("cam")) and sh["set"] == q["set"] and len(sh["chars"]) == len(q["chars"])):
            q["n"] += sh["n"]
            continue
        merged.append(dict(sh))
    out = merged
    res: list = []
    for sh in out:
        if sh.get("units") or sh.get("journey"):
            res.append(sh)
            continue
        far = _pov_views(sh)[0] == "wide"
        parts = 1 if (sh.get("act") or sh.get("cam")) else max(1, -(-sh["n"] // (66 if far else POV_MAX_PIECE)))
        if far and len(_pov_views(sh)) == 2:
            parts = min(parts, 2)             # a crowd has only two views that keep every head in frame: never repeat one
        for j in range(parts):
            a0, a1 = sh["a"] + round(j * sh["n"] / parts), sh["a"] + round((j + 1) * sh["n"] / parts)
            piece = {**sh, "a": a0, "n": a1 - a0}
            if j:
                piece["things"] = [dict(t, pop=False) for t in sh.get("things") or []]
                piece["view"] = "?"            # picked below, once the neighbours are known
            res.append(piece)
    seen: set = set()

    def sig(s_: dict) -> tuple:
        return (s_["set"], s_.get("view"), tuple(t["name"] for t in s_.get("things") or []), tuple(c["text"] for c in s_.get("cards") or []),
                json.dumps(s_.get("act") or "", sort_keys=True), s_["chars"][0].get("pose") if s_["chars"] else "")

    for i, sh in enumerate(res):
        if sh.get("units") or sh.get("journey"):
            continue
        prev = res[i - 1] if i and res[i - 1]["set"] == sh["set"] and not (res[i - 1].get("units") or res[i - 1].get("journey")) else None
        cur = sh.get("view") or "ms"
        views = _pov_views(sh)
        cands = ([cur] if cur == "hook" or cur in views else []) + [v for v in views if v != cur]
        pick = (next((v for v in cands if sig({**sh, "view": v}) not in seen and (prev is None or _pov_apart(prev.get("view"), v))), None)
                or next((v for v in cands if sig({**sh, "view": v}) not in seen and (prev is None or v != prev.get("view"))), None)
                or next((v for v in cands if prev is None or _pov_apart(prev.get("view"), v)), None) or "ws")
        sh["view"] = pick
        seen.add(sig(sh))
    for i, sh in enumerate(res):
        e = sc[sh["_k"]] if 0 <= sh.get("_k", -1) < len(sc) else {}
        if e.get("react") and sh["chars"]:        # the sign-off: the hero reacts (pose, face) in each view of the last line
            idx = sum(1 for q in res[:i] if q.get("_k") == sh["_k"])
            pose, expr = e["react"][idx % len(e["react"])]
            sh["chars"] = [dict(sh["chars"][0], pose=pose, expr=expr)] + sh["chars"][1:]
        if sh.get("cards") and sh.get("view") in ("ms", "msL", "msR") and "cam" not in sh:
            sh["cards"] = []                  # the close view puts the head over the card; the earlier far views already showed it
        h = _pov_hud_at(hud, sh["a"], sh["n"])
        if h:
            sh["hud"] = h
            shown = _pov_shown_nums(hud, sh["a"], sh["n"])
            if sh.get("cards") and sh["set"] == "stage":
                sh["cards"] = []              # the raised stage puts the board right over the hero's face
            if sh.get("cards") and shown:     # the in-scene board repeating the stack's number is dropped (the stack already says it)
                sh["cards"] = [c for c in sh["cards"] if _pov_num(c.get("text", "")) not in shown]
    return res


PLACE_NAMES = ("court", "pitch", "stage", "office", "servers", "space", "garage", "throne", "mine", "stall")


def plates(plan: dict, frames_dir: Path, plates_dir: Path) -> int:
    """Shard folders from toon/scripts/frames.mjs (<frames_dir>/<shard>/ with range.json + the JPEGs in frame order)
    -> <plates_dir>/<slug>/<scene>_<frame>.jpg, the names render.py looks for (LP_PLATES)."""
    out = plates_dir / plan["slug"]
    out.mkdir(parents=True, exist_ok=True)
    files = {}
    for rj in frames_dir.rglob("range.json"):
        r = json.loads(rj.read_text())
        imgs = sorted(rj.parent.glob("*.jp*g"), key=lambda q: int(re.findall(r"\d+", q.stem)[-1]))
        for k, q in enumerate(imgs):
            files[r["start"] + k] = q
    n, gaps = 0, []
    for sc in plan["scenes"]:
        for j in range(sc["n"]):
            f = files.get(sc["a"] + j)
            if not f and files:   # Nov 18: a missing frame fell back to the old renderer = a BLACK flash (099 @556)
                gaps.append(sc["a"] + j)
                near = min(files, key=lambda k: (abs(k - (sc["a"] + j)), k > sc["a"] + j))
                f = files[near]
            if f:
                shutil.copyfile(f, out / f"{sc['si']}_{sc['frLo'] + j}.jpg")
                n += 1
    if gaps:
        print(f"::warning::{plan['slug']} plates: {len(gaps)} missing frame(s) filled from neighbours: {gaps[:10]}")
    try:   # a frame that RENDERED blank (one black flash) gets the frame before it
        import numpy as np
        from PIL import Image
        seq = [out / f"{sc['si']}_{sc['frLo'] + j}.jpg" for sc in plan["scenes"] for j in range(sc["n"])]
        seq = [q for q in seq if q.exists()]
        prev, fixed = None, []
        for q in seq:
            blank = float(np.asarray(Image.open(q).convert("L").resize((45, 80)), np.float32).std()) < 6
            if blank and prev is not None:
                shutil.copyfile(prev, q)
                fixed.append(q.stem)
            elif not blank:
                prev = q
        if fixed:
            print(f"::warning::{plan['slug']} plates: {len(fixed)} blank frame(s) replaced: {fixed[:10]}")
    except Exception as e:  # noqa: BLE001  never cost a Short
        print(f"[plates] blank check skipped: {e!r}")
    return n


def whips(plan: dict, plates_dir: Path) -> int:
    """Nov 15, Sam's reference (@afterhourtheories, every frame studied): it never hard-cuts; the camera whips to the
    next view in 6-10 frames of motion blur. Every hard cut in the finished plates gets that whip: 3 frames before
    the cut smear out sideways, 3 after smear in, alternating left/right. WHIPS=off skips it."""
    import os

    import numpy as np
    from PIL import Image
    if os.environ.get("WHIPS", "off") == "off":   # Sam, Nov 16: the blur cuts "look horrendous": off unless WHIPS=on
        return 0
    d = plates_dir / plan["slug"]
    seq = [d / f"{sc['si']}_{sc['frLo'] + j}.jpg" for sc in plan["scenes"] for j in range(sc["n"])]
    seq = [q for q in seq if q.exists()]
    small = [np.asarray(Image.open(q).convert("L").resize((54, 96)), np.float32) for q in seq]
    dif = [0.0] + [float(np.abs(small[i] - small[i - 1]).mean()) for i in range(1, len(seq))] + [0.0]
    # a real cut is ONE big jump with calm frames either side (a logo popping in changes over several frames)
    cuts = [i for i in range(1, len(seq)) if dif[i] > 22 and dif[i - 1] < dif[i] / 3 and dif[i + 1] < dif[i] / 3]
    cuts = [c for k, c in enumerate(cuts) if k == 0 or c - cuts[k - 1] > 8]

    def shift(a, dx: int):                       # slide sideways, repeating the edge column (no wrap-around seam)
        if dx == 0:
            return a
        p = np.pad(a, ((0, 0), (abs(dx), abs(dx)), (0, 0)), mode="edge")
        return p[:, abs(dx) - dx: abs(dx) - dx + a.shape[1]]

    def smear(q: Path, w: int, slide: int, sign: int):
        a = shift(np.asarray(Image.open(q).convert("RGB"), np.float32), sign * slide)
        acc, k = np.zeros_like(a), 0
        for dx in range(0, w + 1, max(2, w // 10)):
            acc += shift(a, sign * dx)
            k += 1
        Image.fromarray((acc / k).clip(0, 255).astype(np.uint8)).save(q, quality=92)

    W = Image.open(seq[0]).width if seq else 720
    for k, c in enumerate(cuts):
        sign = 1 if k % 2 == 0 else -1
        for off, w, slide in ((-2, int(W * .06), int(W * .04)), (-1, int(W * .14), int(W * .09))):   # softer (Nov 16 review)
            if c + off >= 0:
                smear(seq[c + off], w, slide, -sign)
        for off, w, slide in ((0, int(W * .14), int(W * .09)), (1, int(W * .06), int(W * .035))):
            if c + off < len(seq):
                smear(seq[c + off], w, slide, sign)
    return len(cuts)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "plan":
        script = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        rec = json.loads(Path(sys.argv[4]).read_text(encoding="utf-8")) if len(sys.argv) > 4 else None
        plan = make_plan(script, rec)
        props = {"plan": plan}
        # Nov 16 (Sam: "this is how a video idea could work for the history videos"): story Shorts use the real-3D
        # afterhour look by default; a script can force it with "look": "afterhour" or opt out with "look": "toon"
        # Nov 17 (Sam: "I want almost every script to look like that"): EVERY format now uses the afterhour look;
        # only "look": "toon" in a script or TOON_LOOK=toon keeps the old cartoon path
        if script.get("look") != "toon" and os.environ.get("TOON_LOOK") != "toon":
            props["ah"] = {"shots": ah_shots(plan)}       # frames.mjs renders AhShort when the props carry "ah"
            if "pov" in plan:
                props["ah"]["pov"] = pov_hud(plan)        # POV format: the pill + math-card overlay timeline
        Path(sys.argv[3]).write_text(json.dumps(props), encoding="utf-8")
        print(f"[toon] plan {plan['slug']}: {len(plan['scenes'])} scenes, {plan['total']} frames, lights {[s['light'] for s in plan['scenes']]}")
    elif cmd == "plates":
        plan = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))["plan"]
        print(f"[toon] {plates(plan, Path(sys.argv[3]), Path(sys.argv[4]))}/{plan['total']} plates")
        from . import aivideo                      # Higgsfield AI-video Shorts replace the toon frames with their clips
        sc = aivideo.script_for(plan["slug"])
        if sc and sc.get("aivideo"):
            aivideo.override(sc, plan, Path(sys.argv[4]))
        print(f"[toon] whip transitions on {whips(plan, Path(sys.argv[4]))} cuts", flush=True)
