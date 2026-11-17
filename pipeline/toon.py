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
AH_POSE = {"cheer": "cheer", "walk": "walk", "run": "walk", "work": "point", "interact": "point", "wave": "wave", "idle": "stand"}
AH_THING = {"shoe": "shoe", "springshoe": "springshoe", "sneakerbus": "bus", "bus": "bus", "robot": "robot", "chip": "chip", "drone": "drone",
            "satellite": "satellite", "ring": "ring", "crown": "crown", "tv": "tv", "books": "books", "letter": "letter", "medal": "medal",
            "idea": "lightbulb", "factory": "factory", "stadium": "stadium", "plant": "factory", "car": "car", "truck": "truck",
            "trophy": "trophy", "cash": "cashstack", "boxes": "box", "check": "letter", "rocket": "rocket", "ball": "basketball", "mic": "mic",
            "laptop": "laptop", "burger": "burger", "controller": "controller", "ereader": "phone", "snack": "burger", "poster": "newspaper"}
AH_BIG = {"car", "truck", "bus", "rocket", "factory", "stadium", "plane", "yacht", "house"}
AH_CROWD = [{"body": c, "hat": "hair", "hair": h} for c, h in (("#e86a6a", "#3a2a20"), ("#5ad0d8", "#8a5a2a"), ("#8bc34a", "#1a1a1a"),
            ("#b48ae0", "#3a2a20"), ("#f2a33a", "#5a3b2a"), ("#4a7bd0", "#1a1a1a"))]


_AH_MODELS: dict | None = None
_AH_STOP = {"sign", "signs", "signed", "signing", "deal", "deals", "the", "a", "an", "and", "or", "of", "to", "in", "on", "it", "is", "was", "he", "she", "they", "his", "her", "this", "that", "with", "for", "at", "by", "as", "be", "so", "but"}


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


def ah_words_to_models(text: str) -> list:
    """model names for the words (and two-word runs like "vending machine") of a sentence, in order, plurals ok"""
    m, out = ah_models(), []
    ws = [w for w in re.findall(r"[a-z]+", text.lower())]
    def look(w: str):
        for c in (w, w[:-1] if w.endswith("s") else "", w[:-2] if w.endswith("es") else "", w[:-3] + "y" if w.endswith("ies") else ""):
            if c and c in m and c not in _AH_STOP:
                return m[c]
    for i, w in enumerate(ws):
        hit = (i + 1 < len(ws) and look(w + ws[i + 1])) or look(w)
        if hit and hit not in out:
            out.append(hit)
    return out


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
AH_SPORT_SETS = ("court", "pitch", "ring", "track")
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
AH_PEOPLE_ATH = {"lebron": ("23", "#fdb927", "#552583"), "jordan": ("23", "#ce1141", "#111111"), "kobe": ("24", "#fdb927", "#552583"),
                 "curry": ("30", "#1d428a", "#ffc72c"), "shaq": ("34", "#552583", "#fdb927"), "shaquille": ("34", "#552583", "#fdb927"),
                 "durant": ("35", "#1d1160", "#e56020"), "giannis": ("34", "#00471b", "#eee1c6"), "wembanyama": ("1", "#222222", "#c4ced4"),
                 "wemby": ("1", "#222222", "#c4ced4"), "messi": ("10", "#75aadb", "#ffffff"), "ronaldo": ("7", "#c8102e", "#ffffff"),
                 "mbappe": ("10", "#1a2a6c", "#ffffff"), "mbappé": ("10", "#1a2a6c", "#ffffff"), "neymar": ("10", "#f7d117", "#1a8a3a"),
                 "haaland": ("9", "#6cabdd", "#ffffff"), "mahomes": ("15", "#e31837", "#ffb81c"), "brady": ("12", "#d50a0a", "#ffffff"),
                 "ohtani": ("17", "#005a9c", "#ffffff"), "bolt": ("9", "#2a8f3a", "#f7d117"), "doncic": ("77", "#00538c", "#ffffff"),
                 "tatum": ("0", "#007a33", "#ffffff"), "salah": ("11", "#c8102e", "#ffffff"), "yamal": ("19", "#a50044", "#004d98")}
AH_PEOPLE_PLAIN = {"drake": ("#2a2a36", "#1a1a1a"), "rihanna": ("#7a2a4a", "#2a1a1a"), "beyonce": ("#c9a227", "#2a1a1a"),
                   "beyoncé": ("#c9a227", "#2a1a1a"), "kanye": ("#3a3a3a", "#1a1a1a"), "eminem": ("#555555", "#d8c27a"),
                   "snoop": ("#4a6aa8", "#1a1a1a"), "bieber": ("#7a7a8a", "#6a4a2a"), "swift": ("#e8d8a8", "#c9a227"),
                   "bezos": ("#2a3a4a", "#4a4a4a"), "musk": ("#1a1a24", "#2a1a1a"), "zuckerberg": ("#6a6a72", "#4a2f1c"),
                   "obama": ("#1f2f4f", "#6a6a6a"), "trump": ("#1f2f4f", "#d8b84a"), "oprah": ("#8a3a5a", "#1a1a1a"),
                   "mrbeast": ("#2a8fd8", "#2a1a10"), "pewdiepie": ("#c43a3a", "#d8b84a"), "shroud": ("#3a4a3a", "#2a2a2a"),
                   "tfue": ("#1a1a24", "#2a1a10"), "faker": ("#7a1a1a", "#1a1a1a"), "serena": ("#f4f4f4", "#1a1a1a"), "clark": ("#fdb927", "#1a1a1a")}
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
AH_SKIP_FIRST = {"i", "it", "its", "he", "she", "they", "we", "you", "the", "a", "an", "this", "that", "but", "and", "then", "now", "so", "still",
                 "just", "back", "by", "in", "at", "on", "of", "to", "for", "with", "from", "when", "while", "after", "before", "one", "two",
                 "three", "every", "each", "all", "no", "not", "if", "yes", "his", "her", "their", "our", "my", "your", "today", "later", "next",
                 "some", "many", "most", "what", "who", "why", "how", "here", "there", "even", "only", "once", "soon", "first", "last"}


def ah_hero_tokens(script: dict | None, plan: dict) -> set:
    toks = set()
    for v in ((script or {}).get("name_card"), (script or {}).get("company"), (script or {}).get("hero_name")):
        toks |= {t for t in re.findall(r"[a-z0-9]+", str(v or "").lower()) if len(t) >= 3}
    for t in re.split(r"[-_ ]", str(plan.get("slug") or "").lower()):
        if len(t) >= 3 and not t.isdigit() and t not in ("famous", "plan", "whatif", "story", "best", "ever", "careers", "how"):
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
    athlete = bool(sets & {"court", "pitch", "field"}) or (plan.get("hero") or {}).get("kit") in ("bball", "soccer") or (sportish and not gamer)
    return {"script": script, "hero": ah_hero_tokens(script, plan), "gamer": gamer, "athlete": athlete,
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
            num, body, trim = AH_PEOPLE_ATH[tok]
            return {"body": body, "legs": trim, "hat": "hair", "hair": "#1a1410", "text": num, "outfit": "jersey", "trim": trim}, "grin"
    for tok in toks:
        if tok in AH_PEOPLE_PLAIN:
            body, hair = AH_PEOPLE_PLAIN[tok]
            return {"body": body, "legs": "#1a1a22", "hat": "hair", "hair": hair, **({"glasses": "shades"} if tok in ("drake", "kanye", "snoop") else {})}, "smug"
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
        views = ["wide", "ws"] if any(c.get("who") for c in s["chars"][1:]) else AH_VIEWS
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
        aset = AH_SET.get(place, "street")
        if (ctx["gamer"] and sc.get("set") == "gaming" and aset in ("street", "beach") + AH_SPORT_SETS) or \
                ((ctx["famous"] or ctx["gamer"]) and not ctx["athlete"] and aset in AH_SPORT_SETS):
            aset = AH_SCRIPT_SET.get(sc.get("set"), "office") if sc.get("set") != "city" else "office"
            place = next((pl for pl, st in AH_SET.items() if st == aset), place)
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
        if sc.get("card"):
            c = dict(sc["card"]); cards.append({**c, "at": [0.48, 2.2, -0.6], "w": 0.88})   # up beside the head, in frame
        elif sc.get("brand") and sc.get("beat") in ("logo", "sign"):
            b = sc["brand"]; cards.append({"text": b["name"].upper(), "kind": "sign", "bg": b.get("bg"), "fg": b.get("fg"), "at": [0.48, 2.2, -0.6], "w": 0.88})
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
            t3 = AH_THING.get(nm)
            if not t3 or t3 in seen or len(things) >= 2 or nm in own or t3 in own:
                continue
            seen.add(t3)
            big = t3 in AH_BIG
            things.append({"name": t3, "at": [-1.9, 0, -1.6] if big else ([0.55, 0.85, 0.55] if not things else [-0.55, 0.85, 0.55]),
                           "fit": 1.6 if big else (0.42 if not things else 0.34)})   # held at hand height, in frame
        for t3 in ([] if outro else ah_words_to_models(line_txt)):   # then library models the sentence's words name
            if len(things) >= 2:
                break
            if t3 in seen or t3 in own or (t3 in AH_TIME_THINGS and not AH_TIME_RX.search(line_txt)):
                continue
            seen.add(t3)
            things.append({"name": t3, "at": [0.55, 0.85, 0.55] if not things else [-0.55, 0.85, 0.55], "fit": 0.42 if not things else 0.34})
        if outro:
            things = []
        shot = {"a": sc["a"], "n": sc["n"], "set": aset, "view": sc.get("view") or views[k % len(views)],
                "chars": chars, "cards": cards, "things": things, **({"coins": True} if sc.get("beat") == "money" else {})}
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
            shot["view"] = "wide" if k % 2 else "ws"                # both of them fit in frame
        if people and act and ah_actions.ACT_VIEW.get(act) != "wide":
            shot["cam"] = {"from": [0, 2.1, 7.6], "to": [0, 2.0, 6.9], "look": [0, 1.45, 0]}   # a close act: pull back so the named person is in frame
        parts = (1 if sc["n"] <= 80 else 2) if ("cam" not in shot and not act) else 1   # an act shot is one unbroken take; a still line over ~2.7 s gets a second angle (Nov 16 Nike review: 3 s static holds)
        order = {"ms": ["ms", "face"], "face": ["face", "ms"], "cu": ["cu", "ws"], "low": ["low", "face"],
                 "ws": ["ws", "face"], "wide": ["wide", "face"]}.get(shot["view"], [shot["view"], "face"])
        if people and not act:
            order = ["wide", "ws"]
        if pose in ("jump", "dunk", "shoot") and "cam" not in shot and not act:
            # Nov 16 Wemby frame check: a close-up on a jump put his head out of the top of the frame for ~2 s;
            # the whole body (and the air above it) must be in shot when he leaves the ground
            shot["view"] = "wide"; order = ["wide", "ws"]
        for j in range(parts):
            a0, a1 = sc["a"] + round(j * sc["n"] / parts), sc["a"] + round((j + 1) * sc["n"] / parts)
            sub = {**shot, "a": a0, "n": a1 - a0, "view": order[j % len(order)], **({"_outro": True} if outro else {})}
            if j and sub["things"]:
                sub["things"] = [dict(t, pop=False) for t in sub["things"]]   # already on screen: no second pop
            shots.append(sub)
    shots = ah_dedupe(shots, ctx)
    for sh in shots:
        for c in sh["chars"]:
            c.pop("who", None)
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
