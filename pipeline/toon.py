"""Toon look (Nov 15, Sam: "these videos look infinitely better than ours ... it should look close to the repo"):
flat cartoon people in an ink-outlined, painted 3D world, rendered with three.js inside Remotion (toon/, built on
the MIT-licensed source of mromidev/claude-animated-shorts). This module turns one of OUR scripts into the plan that
renderer reads, and names the rendered frames like the Blender plates so render.py picks them up (LP_PLATES).

  python -m pipeline.toon plan <script.json> <out_plan.json> [recorded_lp_plan.json]
  python -m pipeline.toon plates <plan.json> <frames_dir> <plates_dir>     # element-00042.jpeg -> <slug>/<scene>_<frame>.jpg

Without a recorded plan the scene lengths are estimated from the words (for look stills only).
"""
from __future__ import annotations

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
                        **({"place": place} if place in PLACE_NAMES else {}),
                        **({"loc": {"bridge": 0, "street": 1, "quay": 2}[place]} if place in ("bridge", "street", "quay") else {}),
                        **({"brand": _brand(d["brand"])} if d.get("brand") else {"brand": _brand(v["brand"])} if v.get("brand") else {}),
                        # Nov 15 (afterhour style): a text card in the scene (date sign, money screen that flips, headline,
                        # tombstone...), a fixed view ("face" close-up etc.), a different character for this line, hide the hero
                        **{k: d[k] for k in ("card", "view", "who", "hide", "crowdO") if d.get(k)},
                        "things": (prev_things := things_for(ss[j], given, prev_things)), "line": ss[j][:80]})
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
                out.append({**src, "a": a, "n": m, "frLo": pos, "si": i, "line": "(outro) " + src.get("line", "")[:60]})
                a += m; pos += m; tail -= m; kk += 1
    slug = f"{script.get('id', '')}-{script.get('slug', '')}"
    co = script.get("company", "")
    bg, fg = BRAND_COLORS.get(co.lower(), ("#241726", "#ffffff"))
    brand = {"name": co, "bg": script.get("brand_color", bg), "fg": script.get("brand_text_color", fg)} if co and script.get("format") != "famous" else None
    sport = next((sc["visual"].get("set") for _, sc in scenes if sc["visual"].get("set") in ("court", "pitch")), "")
    hero = outfit(script.get("hero"), script.get("slug", ""), sport, script.get("name_card", ""))
    return {"slug": slug, "fps": FPS, "total": a, "scenes": out, "brand": brand, "hero": hero,
            "seed": int(re.sub(r"\D", "", str(script.get("id", "1"))) or 1)}


# ---- afterhour look (Nov 16): the same per-sentence plan as real-3D shots for the AhShort composition ----
AH_SET = {"throne": "throne", "office": "office", "servers": "lab", "garage": "garage", "stall": "stall", "mine": "field",
          "court": "court", "pitch": "pitch", "stage": "stage", "space": "space", "street": "street", "bridge": "street",
          "quay": "beach", "road": "track"}
AH_EXPR = {"happy": "smile", "laugh": "laugh", "shock": "shock", "nervous": "shock", "proud": "smug", "stern": "angry",
           "scheme": "smug", "relief": "smile", "dazed": "sad", "sad": "sad", "calm": "neutral", "excited": "grin"}
AH_POSE = {"cheer": "cheer", "walk": "walk", "run": "walk", "work": "dig", "interact": "point", "wave": "wave", "idle": "stand"}
AH_THING = {"shoe": "shoe", "springshoe": "springshoe", "sneakerbus": "bus", "bus": "bus", "robot": "robot", "chip": "chip", "drone": "drone",
            "satellite": "satellite", "ring": "ring", "crown": "crown", "tv": "tv", "books": "books", "letter": "letter", "medal": "medal",
            "idea": "lightbulb", "factory": "factory", "stadium": "stadium", "plant": "factory", "car": "car", "truck": "truck",
            "trophy": "trophy", "cash": "cashstack", "boxes": "box", "check": "letter", "rocket": "rocket", "ball": "basketball", "mic": "mic",
            "laptop": "laptop", "burger": "burger", "controller": "controller", "ereader": "phone", "snack": "burger", "poster": "newspaper"}
AH_BIG = {"car", "truck", "bus", "rocket", "factory", "stadium", "plane", "yacht", "house"}
AH_CROWD = [{"body": c, "hat": "hair", "hair": h} for c, h in (("#e86a6a", "#3a2a20"), ("#5ad0d8", "#8a5a2a"), ("#8bc34a", "#1a1a1a"),
            ("#b48ae0", "#3a2a20"), ("#f2a33a", "#5a3b2a"), ("#4a7bd0", "#1a1a1a"))]


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
    if o.get("num"):
        lk["text"] = str(o["num"])
    elif o.get("chest") and hat != "hardhat":
        lk["text"] = str(o["chest"])[:6]
    return lk


def ah_shots(plan: dict) -> list:
    hero, shots, views = plan.get("hero") or {}, [], ["ms", "face", "cu", "ms", "low", "face"]
    for k, sc in enumerate(plan["scenes"]):
        place = sc.get("place") or {0: "bridge", 1: "street", 2: "quay"}.get(sc.get("loc"), "street")
        who = {**hero, **(sc.get("who") or {})}
        pose = AH_POSE.get(sc.get("action", "idle"), "stand")
        chars = [{"look": ah_look(who), "at": [0, 0, 0], "pose": pose, "expr": AH_EXPR.get(sc.get("mood", "happy"), "smile")}]
        for i in range(min(6, int(sc.get("crowd") or 0) // 5)):     # a few extras behind, cheering/reacting
            chars.append({"look": AH_CROWD[i % len(AH_CROWD)], "at": [(-1) ** i * (1.3 + 0.6 * (i // 2)), 0, -1.6 - 0.9 * (i // 2)],
                          "pose": "cheer" if sc.get("action") == "cheer" else "stand", "expr": "laugh" if i % 2 else "smile"})
        cards = []
        if sc.get("card"):
            c = dict(sc["card"]); cards.append({**c, "at": [0.48, 2.2, -0.6], "w": 0.88})   # up beside the head, in frame
        elif sc.get("brand") and sc.get("beat") in ("logo", "sign"):
            b = sc["brand"]; cards.append({"text": b["name"].upper(), "kind": "sign", "bg": b.get("bg"), "fg": b.get("fg"), "at": [0.48, 2.2, -0.6], "w": 0.88})
        things, seen = [], set()
        for nm in list(sc.get("things") or []) + list(sc.get("props") or []):
            t3 = AH_THING.get(nm)
            if not t3 or t3 in seen or len(things) >= 2:
                continue
            seen.add(t3)
            big = t3 in AH_BIG
            things.append({"name": t3, "at": [-1.9, 0, -1.6] if big else ([0.55, 0.85, 0.55] if not things else [-0.55, 0.85, 0.55]),
                           "fit": 1.6 if big else (0.42 if not things else 0.34)})   # held at hand height, in frame
        shot = {"a": sc["a"], "n": sc["n"], "set": AH_SET.get(place, "street"), "view": sc.get("view") or views[k % len(views)],
                "chars": chars, "cards": cards, "things": things, **({"coins": True} if sc.get("beat") == "money" else {})}
        if sc.get("hide") and cards:   # a card-only shot: frame the card
            cards[0]["at"] = [0, 1.55, 0.3]; cards[0]["w"] = 1.15; shot["chars"] = chars[:0]
            shot["cam"] = {"from": [0, 1.55, 2.5], "to": [0, 1.55, 2.2], "look": [0, 1.55, 0.3]}
        shots.append(shot)
    return shots


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
    n = 0
    for sc in plan["scenes"]:
        for j in range(sc["n"]):
            f = files.get(sc["a"] + j)
            if f:
                shutil.copyfile(f, out / f"{sc['si']}_{sc['frLo'] + j}.jpg")
                n += 1
    return n


def whips(plan: dict, plates_dir: Path) -> int:
    """Nov 15, Sam's reference (@afterhourtheories, every frame studied): it never hard-cuts; the camera whips to the
    next view in 6-10 frames of motion blur. Every hard cut in the finished plates gets that whip: 3 frames before
    the cut smear out sideways, 3 after smear in, alternating left/right. WHIPS=off skips it."""
    import os

    import numpy as np
    from PIL import Image
    if os.environ.get("WHIPS", "on") == "off":
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
        if os.environ.get("TOON_LOOK") == "afterhour" or script.get("look") == "afterhour":
            props["ah"] = {"shots": ah_shots(plan)}       # frames.mjs renders AhShort when the props carry "ah"
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
