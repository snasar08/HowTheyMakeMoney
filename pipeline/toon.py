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
           "kevin durant": "35", "tom brady": "12"}


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
    ("plant", r"\bpower plants?\b|\bpower\b"),
    ("satellite", r"\bsatellites?\b|\binto space\b|\bin space\b|\bin orbit\b"),
    ("chatbot", r"\bchatbots?\b|\bchat ?gpt\b|\bai\b|\ba\.i\.(?=\W|$)"),
    ("ring", r"\brings?\b|\bchampionships?\b|\btitles?\b"),
    ("stadium", r"\bstadiums?\b|\barenas?\b"),
    ("factory", r"\bfactor(y|ies)\b|\bdata cent(er|re)s?\b|\bbuilds?\b.*\bplants?\b"),
    ("snack", r"\bsnacks?\b|\bchips bag\b"),
    ("hanger", r"\bfashion\b|\bclothes\b|\bfits?\b|\bclothing\b|\bapparel\b"),
    ("dome", r"\bdomes?\b"),
    ("dumbbell", r"\btrain(ing)?\b|\bgym\b|\bworks? out\b|\bbest shape\b"),
    ("tv", r"\bcartoons?\b|\btv\b|\bstream\w*\b|\bvideos?\b"),
    ("books", r"\bbooks?\b|\bbookstore\b"),
    ("ereader", r"\be-?readers?\b|\bkindle\b|\btablets?\b"),
    ("medal", r"\bmedals?\b|\bgold\b|\bolympic\w*\b"),
    ("crown", r"\bbest ever\b|\bking\b|\bgreatest\b|\bface of\b|\bdynasty\b"),
]


def things_for(line: str, given: list) -> list:
    """The script's/director's `things` first, then whatever the line mentions, at most 2, no near-duplicates."""
    out = [t for t in given if isinstance(t, str)]
    low = line.lower()
    for name, rx in THING_WORDS:
        if len(out) >= 2:
            break
        if name not in out and re.search(rx, low):
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
    di = 0
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
            out.append({"si": i, "a": a, "n": m, "frLo": lo + cuts[j], "light": lt[k], "set": v.get("set", "city"),
                        "action": d.get("action", v.get("action", "idle")), "crowd": int(d.get("crowd", v.get("crowd", 0)) or 0),
                        "props": d.get("props") or [], "beat": d.get("beat", "walk"), "mood": d.get("mood", "happy"),
                        **({"place": place} if place in ("court", "pitch", "stage", "office", "servers", "space", "garage") else {}),
                        **({"loc": {"bridge": 0, "street": 1, "quay": 2}[place]} if place in ("bridge", "street", "quay") else {}),
                        **({"brand": _brand(d["brand"])} if d.get("brand") else {"brand": _brand(v["brand"])} if v.get("brand") else {}),
                        "things": things_for(ss[j], d.get("things") or []), "line": ss[j][:80]})
            a += m
    slug = f"{script.get('id', '')}-{script.get('slug', '')}"
    co = script.get("company", "")
    bg, fg = BRAND_COLORS.get(co.lower(), ("#241726", "#ffffff"))
    brand = {"name": co, "bg": script.get("brand_color", bg), "fg": script.get("brand_text_color", fg)} if co and script.get("format") != "famous" else None
    sport = next((sc["visual"].get("set") for _, sc in scenes if sc["visual"].get("set") in ("court", "pitch")), "")
    hero = outfit(script.get("hero"), script.get("slug", ""), sport, script.get("name_card", ""))
    return {"slug": slug, "fps": FPS, "total": a, "scenes": out, "brand": brand, "hero": hero,
            "seed": int(re.sub(r"\D", "", str(script.get("id", "1"))) or 1)}


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


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "plan":
        script = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        rec = json.loads(Path(sys.argv[4]).read_text(encoding="utf-8")) if len(sys.argv) > 4 else None
        plan = make_plan(script, rec)
        Path(sys.argv[3]).write_text(json.dumps({"plan": plan}), encoding="utf-8")
        print(f"[toon] plan {plan['slug']}: {len(plan['scenes'])} scenes, {plan['total']} frames, lights {[s['light'] for s in plan['scenes']]}")
    elif cmd == "plates":
        plan = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))["plan"]
        print(f"[toon] {plates(plan, Path(sys.argv[3]), Path(sys.argv[4]))}/{plan['total']} plates")
