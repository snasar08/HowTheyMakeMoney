"""scene_check - does every sentence of a toon/story Short SHOW what it says?

    python -m pipeline.scene_check content/scripts/119-plan-nike.json [more.json ...]

Per script: every problem as ERROR or WARN with scene/sentence number and the line, a 0-100 "scene score", and a
short "objects to build" list (missing objects + invented nouns). Exit code 1 if any ERROR. Deterministic; stdlib +
repo modules only (pipeline.toon, pipeline.toon_director, pipeline.ah_actions, pipeline.tts), no network.

The checker follows what the renderer really does (toon.make_plan / toon.ah_shots): the things a sentence shows are
the script's `things`, then whatever the line's words add (toon.things_for, max 2, nothing the previous line showed),
then only the names in toon.AH_THING are drawn, then library models named by the line's words fill free slots.

ERROR (the Short would render wrong or lie):
  toon length != sentence count (or a story scene with no toon); unknown place/beat/mood/view/action/act/card kind;
  a thing/prop that exists nowhere ("missing object"); a year or money/number figure with no card and no money
  picture; a brand named for the first time with no brand and no card.
WARN (looks weak): same place+view+pose as the line before; same beat twice; >2 clocks or >1 phone; a mentioned
  object that is not drawn; a thing that ah_shots cannot draw; a twist line in a scene with no "face" view; 4+
  lines in a row with no card/thing/brand; a line with a clear action verb (an `act` fires) whose toon `action` forces another pose; fewer than 30% of lines with a thing or card; later brand mentions with
  no sign; no hero.
Score = 100 - 10 per ERROR - 2.5 per WARN (floor 0).
"""
from __future__ import annotations

import glob
import json
import re
import sys
from pathlib import Path

from . import ah_actions, toon_director, tts


def _import_toon():
    """pipeline.toon, with a fallback for a known slip (Nov 16: a comment swallowed the `:` after
    `if os.environ.get("WHIPS", "off") == "off"` in toon.whips, a SyntaxError). The fallback patches the source in memory
    only; fix toon.py itself and this path is never taken."""
    try:
        from . import toon as m
        return m
    except SyntaxError:
        import types
        src = (Path(__file__).resolve().parent / "toon.py").read_text(encoding="utf8")
        src = src.replace('== "off"   # Sam, Nov 16: the blur cuts "look horrendous": off unless WHIPS=on:',
                          '== "off":   # Sam, Nov 16: the blur cuts "look horrendous": off unless WHIPS=on')
        m = types.ModuleType("pipeline.toon")
        m.__package__ = "pipeline"
        m.__file__ = str(Path(__file__).resolve().parent / "toon.py")
        exec(compile(src, m.__file__, "exec"), m.__dict__)
        return m


toon = _import_toon()

ROOT = Path(__file__).resolve().parent.parent
VIEWS = ("ws", "wide", "ms", "cu", "face", "low")
CARD_KINDS = ("sign", "screen", "paper", "flip", "tomb", "white")
DEFAULT_VIEWS = ["ms", "face", "cu", "ms", "low", "face"]       # toon.ah_shots cycles these when `view` is not set
TWIST = re.compile(r"\b(but|suddenly|still|yet|until)\b", re.I)   # "then" is too common to flag
YEAR = re.compile(r"\b(1[0-9]{3}|20[0-9]{2})\b")
FIGURE = re.compile(r"\$|\d[\d,.]*\s*(?:billion|million|trillion|thousand|percent|dollars|pounds|euros|bucks)\b"
                    r"|\b(?:billion|million|trillion)\b|\b\d{1,3}(?:,\d{3})+\b", re.I)
# famous names a line may say out loud (plus toon.BRAND_COLORS keys, the script's company and every brand it draws)
BRANDS = {"nike", "adidas", "converse", "amazon", "google", "meta", "apple", "tesla", "microsoft", "openai", "nvidia", "netflix",
          "uber", "lyft", "spacex", "facebook", "instagram", "youtube", "tiktok", "disney", "walmart", "target", "costco",
          "starbucks", "mcdonald's", "doordash", "roblox", "airbnb", "visa", "spotify", "samsung", "intel", "amd", "oracle",
          "anthropic", "xai", "deepmind", "pepsi", "coca-cola", "puma", "reebok", "gatorade", "underarmour", "kindle",
          "twitter", "snapchat", "paypal", "stripe", "nintendo", "sony", "playstation", "xbox", "chatgpt", "gemini", "claude"}
# invented-product phrases: "builds a robotic dunk shoe", "launches a sneaker bus"
STOPW = r"(?!in\b|with\b|that\b|for\b|to\b|so\b|and\b|of\b|from\b|you\b|your\b|it\b)"
INVENT = re.compile(r"\b(?:build|builds|built|launch|launches|launched|invent\w*|create[sd]?|design\w*|unveil\w*|ship|ships|"
                    r"releases?|introduc\w+|roll(?:s|ed)? out)\s+(?:an?|your|new|brand-new)\s+((?:" + STOPW + r"[a-z][a-z-]+\s){0,2}" + STOPW + r"[a-z][a-z-]+)", re.I)
FILLER = {"it", "them", "this", "that", "money", "sense", "history", "everything", "something", "more", "one", "you", "up", "out",
          "his", "her", "their", "our", "its", "who", "what", "how", "so", "then", "again", "first", "best", "own", "way", "plan",
          "deal", "move", "court", "gym", "city", "brand", "company", "league", "school", "team", "world", "bet", "name", "mark", "list", "team", "year", "years", "fans", "people", "wins", "win", "pay", "rules"}


def _load_names() -> dict:
    """object names that exist: code-built (things3d.ts), library models (index*.json), AH_THING keys/values, word table"""
    code = set()
    try:
        src = (ROOT / "toon" / "src" / "videos" / "afterhour" / "things3d.ts").read_text(encoding="utf8")
        m = re.search(r"export type ThingName\s*=\s*([^;]+);", src)
        code = set(re.findall(r'"([a-z0-9_]+)"', m.group(1))) if m else set()
    except OSError:
        pass
    models = set()
    d = ROOT / "toon" / "public" / "models"
    for f in [d / "index.json", *sorted(d.glob("index.*.json"))]:
        try:
            models |= set(json.loads(f.read_text(encoding="utf8")))
        except (OSError, ValueError):
            pass
    word_names = {n for n, _ in toon.THING_WORDS}
    known = code | models | set(toon.AH_THING) | set(toon.AH_THING.values()) | word_names | set(toon_director.THINGS) | set(toon_director.PROPS)
    return {"code": code, "models": models, "known": known}


NAMES = _load_names()


def _sents(narr: str) -> list[str]:
    out = [x for x, _q, b in tts.sentences(tts.speakable(narr or "")) if not b]
    return out or [narr or ""]


def _clip(s: str, n: int = 90) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"


class Report:
    def __init__(self):
        self.items: list[tuple[str, str, str, str]] = []     # (level, where, msg, line)
        self.build: dict[str, str] = {}                       # object name/noun -> why

    def add(self, level: str, where: str, msg: str, line: str = ""):
        self.items.append((level, where, msg, line))

    def count(self, level: str) -> int:
        return sum(1 for i in self.items if i[0] == level)


def check(script: dict) -> tuple[Report, dict]:
    r = Report()
    story = script.get("format") == "story"
    mode = script.get("story_mode", "")
    scenes = [(i, sc) for i, sc in enumerate(script.get("scenes", [])) if sc.get("visual", {}).get("type") == "lowpoly"]
    brands = set(BRANDS) | set(toon.BRAND_COLORS)
    if script.get("company") and script.get("format") != "famous":
        brands.add(str(script["company"]).lower())
    for _i, sc in scenes:
        for d in sc.get("toon") or []:
            if isinstance(d.get("brand"), dict) and d["brand"].get("name"):
                brands.add(d["brand"]["name"].lower())
            elif isinstance(d.get("brand"), str):
                brands.add(d["brand"].lower())
    if story and not script.get("hero"):
        r.add("WARN", "script", "no `hero`: the character will not look like the person (hair, skin, number)")
    if not scenes:
        if story:
            r.add("ERROR", "script", "story Short with no lowpoly scenes (toon Shorts use visual.type = lowpoly)")
        else:
            return r, {"score": None, "sentences": 0, "story": story, "mode": mode, "shown": 0}

    once: set = set()                                       # warn once per object per script
    rows: list[dict] = []                                   # one per sentence, in order
    prev_things: list = []
    prev_pose = None
    prev_acts: list = []
    clocks = phones = 0
    brand_seen: set[str] = set()
    k = 0                                                   # index among all shots (the view cycle)
    for si, sc in scenes:
        sents = _sents(sc.get("narration", ""))
        tl = sc.get("toon")
        sw = f"scene {si + 1}"
        if not isinstance(tl, list):
            r.add("ERROR" if story else "WARN", sw, f"no `toon` list (needs one dict per sentence, {len(sents)} here)", _clip(sc.get("narration", "")))
            if not story:
                continue          # a non-story Short may leave the scenes to the director: nothing to check
            tl = []
        elif len(tl) != len(sents):
            r.add("ERROR", sw, f"toon has {len(tl)} dicts but the narration has {len(sents)} sentences "
                              f"(the splitter also breaks long sentences at commas: shorten or add dicts)", _clip(sc.get("narration", ""), 120))
        v = sc.get("visual", {})
        scene_rows = []
        for j, text in enumerate(sents):
            d = tl[j] if j < len(tl) and isinstance(tl[j], dict) else {}
            w = f"{sw}, sentence {j + 1}"
            line = _clip(text)
            place = d.get("place", "street")
            beat = d.get("beat", "walk")
            mood = d.get("mood", "happy")
            view = d.get("view")
            if "place" in d and place not in toon_director.PLACES:
                r.add("ERROR", w, f"unknown place '{place}' (use {', '.join(toon_director.PLACES)})", line)
            if "beat" in d and beat not in toon_director.BEATS:
                r.add("ERROR", w, f"unknown beat '{beat}' (use {', '.join(toon_director.BEATS)})", line)
            if "mood" in d and mood not in toon_director.MOODS:
                r.add("ERROR", w, f"unknown mood '{mood}' (use {', '.join(toon_director.MOODS)})", line)
            if view is not None and view not in VIEWS:
                r.add("ERROR", w, f"unknown view '{view}' (use {', '.join(VIEWS)})", line)
            act = d.get("action", v.get("action", "idle"))
            if "action" in d and act not in ah_actions.POSES and act not in ah_actions.OLD_ACTIONS:
                r.add("ERROR", w, f"unknown action '{act}' (use {', '.join(sorted(ah_actions.POSES))})", line)
            card = d.get("card")
            if card is not None:
                if not isinstance(card, dict) or not card.get("text"):
                    r.add("ERROR", w, "card needs a dict with `text`", line)
                    card = None
                elif card.get("kind") and card["kind"] not in CARD_KINDS:
                    r.add("ERROR", w, f"unknown card kind '{card['kind']}' (use {', '.join(CARD_KINDS)})", line)
            # objects the script names
            given = d.get("things") or []
            props = d.get("props") or []
            for nm in list(given) + list(props):
                if not isinstance(nm, str):
                    continue
                if nm not in NAMES["known"]:
                    r.add("ERROR", w, f"missing object: {nm} (build it or pick another)", line)
                    r.build[nm] = f"{w}: named in toon, no such object"
                elif nm not in toon.AH_THING and ("undrawable", nm) not in once:
                    once.add(("undrawable", nm))
                    r.add("WARN", w, f"'{nm}' exists but ah_shots cannot draw it from `things`/`props` (not in toon.AH_THING); "
                                     f"it only shows if a library model matches the line's words", line)
            # what the renderer will really show
            shown_plan = toon.things_for(text, [t for t in given if isinstance(t, str)], prev_things)
            prev_things = shown_plan
            drawn: list[str] = []
            for nm in list(shown_plan) + [p for p in props if isinstance(p, str)]:
                t3 = toon.AH_THING.get(nm)
                if t3 and t3 not in drawn and len(drawn) < 2:
                    drawn.append(t3)
            for t3 in toon.ah_words_to_models(text):
                if len(drawn) >= 2:
                    break
                if t3 not in drawn:
                    drawn.append(t3)
            # mentions that map to an object but are not drawn
            low = text.lower()
            for nm, rx in toon.THING_WORDS:
                if re.search(rx, low):
                    t3 = toon.AH_THING.get(nm)
                    if t3 is None:
                        if nm in ("idea", "shot", "letter") or ("nodraw", nm) in once:
                            continue
                        once.add(("nodraw", nm))
                        r.add("WARN", w, f"mention not shown: '{nm}' has no 3D object in the story look (it is dropped)", line)
                        r.build.setdefault(nm, f"{w}: the line mentions it, nothing draws it")
                    elif t3 not in drawn and nm not in (given or []):
                        r.add("WARN", w, f"mention not shown: '{nm}' is in the line but not in `things` (add it, or the 2 slots are taken)", line)
            # pose / view like ah_shots
            pose = ah_actions.pick_pose(text, list(shown_plan) + list(props), mood, act, place, prev_pose)
            # acts (Nov 16): a line with a clear action verb plays a real mini-scene (ah_shots does the same call)
            kind = ah_actions.pick_act(text, list(shown_plan) + [p for p in props if isinstance(p, str)], place, mood, act, prev_acts[-2:])
            prev_acts.append(kind)
            if "act" in d:
                dk = d["act"].get("kind") if isinstance(d["act"], dict) else d["act"]
                if dk not in ah_actions.ACTS:
                    r.add("ERROR", w, f"unknown act '{dk}' (use {', '.join(ah_actions.ACTS)})", line)
            if kind:
                forced = d.get("action")
                if isinstance(forced, str) and forced in ah_actions.POSES and forced not in ah_actions.OLD_ACTIONS and forced != ah_actions.ACT_POSE[kind]:
                    r.add("WARN", w, f"the line says an action ({kind}) but `action: \"{forced}\"` forces another pose: the renderer plays "
                                     f"the {kind} act with pose {ah_actions.ACT_POSE[kind]}; drop `action` or reword the line", line)
            if kind:
                pose = ah_actions.ACT_POSE[kind]
            prev_pose = pose
            vw = view or DEFAULT_VIEWS[k % len(DEFAULT_VIEWS)]
            k += 1
            has_brand = bool(d.get("brand") or v.get("brand"))
            money = beat == "money" or any(t in ("cash", "cashstack", "coins", "goldbar") for t in list(given) + list(props) + drawn)
            # numbers must be SHOWN
            yr, fig = YEAR.search(text), FIGURE.search(text)
            if (yr or fig) and not card and not money:
                what = f"year {yr.group(0)}" if yr else f"figure '{fig.group(0).strip()}'"
                r.add("ERROR", w, f"{what} is said but not shown: add a `card` (flip/sign/screen) or a money beat", line)
            # brands
            for tok in re.findall(r"[A-Za-z][A-Za-z'-]*", text):
                b = tok.lower()
                if b in brands and tok[0].isupper():
                    if b == "target" and not re.search(r"\bTarget\b", text):
                        continue
                    if not (has_brand or card):
                        if b not in brand_seen:
                            r.add("ERROR", w, f"brand '{tok}' named with no `brand` and no `card` (pop its code-drawn sign/logo)", line)
                        else:
                            r.add("WARN", w, f"brand '{tok}' named again with no sign (fine if it just showed; else add `brand`)", line)
                    brand_seen.add(b)
                    break
            # counters
            if beat == "clock" or "clock" in drawn:
                clocks += 1
            if beat == "phone" or "phone" in drawn:
                phones += 1
            row = {"w": w, "line": line, "text": text, "place": place, "beat": beat, "view": vw, "pose": pose, "explicit_view": view,
                   "visual": bool(card or drawn or has_brand or kind or beat in ("logo", "sign")), "thing_or_card": bool(card or drawn or kind),
                   "act": kind,
                   "twist": bool(TWIST.search(text) or text.rstrip().endswith(("?", "!")))}
            rows.append(row)
            scene_rows.append(row)
        # twist lines want a face close-up somewhere in the scene
        tw = [x for x in scene_rows if x["twist"]]
        if tw and not any(x["view"] == "face" for x in scene_rows):
            r.add("WARN", sw, f"twist line with no `view: \"face\"` in the scene (a face filling the frame sells the punchline)", tw[0]["line"])
        # invented products in plan steps
        if mode == "plan" or story:
            for x in scene_rows:
                for m in INVENT.finditer(x["text"]):
                    words = [t for t in re.findall(r"[a-z-]+", m.group(1).lower())]
                    head = words[-1] if words else ""
                    if not head or head in FILLER or len(head) < 4 or any(wd in FILLER for wd in words[-1:]):
                        continue
                    cand = " ".join(words)
                    if toon.ah_words_to_models(cand) or any(re.search(rx, cand) for _n, rx in toon.THING_WORDS):
                        continue
                    if x["thing_or_card"] and x["text"] and re.search(r"\b(sign|card)\b", "") :
                        continue
                    if mode == "plan":
                        r.build.setdefault(f"invented: {cand}", f"{x['w']}: \"{_clip(x['text'], 70)}\"")

    # cross-line checks
    for a, b in zip(rows, rows[1:]):
        if (a["place"], a["view"], a["pose"]) == (b["place"], b["view"], b["pose"]):
            r.add("WARN", b["w"], f"same place+view+pose as the line before ({b['place']}/{b['view']}/{b['pose']}): looks repeated", b["line"])
        if a["beat"] == b["beat"] and b["beat"] != "walk":
            r.add("WARN", b["w"], f"same beat twice in a row ({b['beat']})", b["line"])
    if clocks > 2:
        r.add("WARN", "script", f"{clocks} clocks (max 2 per Short)")
    if phones > 1:
        r.add("WARN", "script", f"{phones} phones (max 1 per Short)")
    run = 0
    for x in rows:
        run = 0 if x["visual"] else run + 1
        if run == 4:
            r.add("WARN", x["w"], "4 lines in a row with no card, thing or brand: the picture looks empty (give one a number card or the object it says)", x["line"])
    if story and rows:
        share = sum(1 for x in rows if x["thing_or_card"]) / len(rows)
        if share < 0.30:
            r.add("WARN", "script", f"only {round(share * 100)}% of lines show a thing or a card (aim for 30%+)")
    score = max(0.0, 100 - 10 * r.count("ERROR") - 2.5 * r.count("WARN"))
    return r, {"score": round(score), "sentences": len(rows), "story": story, "mode": mode,
               "shown": sum(1 for x in rows if x["thing_or_card"]), "acts": sum(1 for x in rows if x.get("act"))}


def report(path: str, out=print) -> dict | None:
    try:
        script = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        out(f"== {path}\n  ERROR  cannot read: {e}")
        return {"path": path, "score": 0, "errors": 1, "warns": 0}
    r, info = check(script)
    e, w = r.count("ERROR"), r.count("WARN")
    kind = f"{script.get('format', '?')}" + (f"/{info['mode']}" if info["mode"] else "")
    if info["score"] is None:
        out(f"== {path}  [{kind}]  not a toon Short (no lowpoly scenes): skipped")
        return {"path": path, "score": None, "errors": 0, "warns": 0, "sentences": 0}
    out(f"== {path}  [{kind}, {info['sentences']} sentences]  scene score {info['score']}  errors {e}  warns {w}  acts {info.get('acts', 0)}")
    for lvl, where, msg, line in sorted(r.items, key=lambda i: (i[0] != "ERROR", )):
        out(f"  {lvl:5s} {where}: {msg}" + (f'\n          "{line}"' if line else ""))
    if r.build:
        out("  objects to build / decide:")
        for nm, why in r.build.items():
            out(f"    - {nm}  ({why})")
    if not r.items:
        out("  clean")
    return {"path": path, "score": info["score"], "errors": e, "warns": w, "sentences": info["sentences"]}


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    files = []
    for a in argv:
        files += sorted(glob.glob(a)) or [a]
    if not files:
        print(__doc__)
        return 2
    rows = [report(f) for f in files]
    if len(rows) > 1:
        print("\nscript".ljust(52) + "score  errors  warns")
        for x in rows:
            sc = "  n/a" if x["score"] is None else f"{x['score']:5d}"
            print(f"{Path(x['path']).name:51s} {sc}  {x['errors']:6d}  {x['warns']:5d}")
    return 1 if any(x["errors"] for x in rows) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
