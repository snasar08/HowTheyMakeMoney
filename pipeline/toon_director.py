"""The director (Nov 15, Sam: "the scenes are the most important part, they should truly pertain to the video"):
one scene per SENTENCE, chosen from the toon kit so the picture shows what the line says (like the reference Short:
"AI race" = a race, "trillionaire" = a money mountain, "self-driving car company" = a car on a street).

A script may spell its scenes out (scene `toon`: a list, one dict per sentence); otherwise Gemini Flash-Lite (free
tier, same GEMINI_API_KEY, ~500 requests/day; one request per Short) picks them; otherwise a keyword fallback.

  python -m pipeline.toon_director content/scripts/060-whatif-uber.json      # print the scenes it picks
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://generativelanguage.googleapis.com/v1beta"
MODELS = [m for m in os.environ.get("DIRECTOR_MODELS", "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-2.5-flash-lite,gemini-2.5-flash").split(",") if m]

PLACES = ["street", "bridge", "quay", "road", "court", "pitch", "stage", "office", "servers", "space", "garage"]
BEATS = ["walk", "drive", "queue", "phone", "clock", "money", "logo", "sign"]
PROPS = ["car", "truck", "trophy", "cash", "boxes", "check", "rocket", "ball", "mic", "flag", "laptop", "burger", "controller"]
MOODS = ["happy", "laugh", "shock", "nervous", "proud", "stern", "scheme", "relief", "dazed", "sad", "calm", "excited"]
ACTIONS = ["stand", "walk", "run", "cheer", "work"]
THINGS = ["shoe", "springshoe", "sneakerbus", "bus", "glasses", "robot", "chip", "drone", "plant", "satellite", "chatbot", "ring",
          "stadium", "factory", "snack", "hanger", "dome", "dumbbell", "tv", "books", "ereader", "medal", "crown"]
ICONS = ["swoosh", "star", "rocket", "bolt", "chip", "globe", "car", "brain", "bird", "sun", "play", "cart", "robot", "burger", "letter"]

KIT = f"""You direct a cartoon YouTube Short (flat 2D characters in a colourful 3D world). The hero is the main
character. For EVERY sentence pick ONE scene that literally shows what that sentence says, so a viewer with the
sound off still understands. Use only this kit:
- place: {", ".join(PLACES)}  (street/bridge/quay = a town; road = a long street for driving; court = basketball;
  pitch = soccer; stage = concert stage; office = desks; servers = data center; space = the Moon with Earth in the sky; garage = a small garage with a workbench and boxes, where companies start)
- beat (what happens): walk (hero in the place), drive (hero drives a car along the road), queue (a long line of
  people waiting), phone (giant phone with an app and pins popping in), clock (giant clock racing, for time and
  years), money (cash stacks popping up, for dollars/earnings/prices), logo (a company's logo pops up big beside the
  hero, use when a company/product is founded, launched, bought or named), sign (a big sign with the brand name)
- props (0-2 extra objects that appear): {", ".join(PROPS)}
- things (0-2 drawn objects the sentence MENTIONS, so we see them: the most important rule): {", ".join(THINGS)}
  (springshoe = a sneaker with springs/motors; sneakerbus = a bus shaped like a sneaker; plant = power plant;
  factory = factory or data center; hanger = clothes/fashion; dumbbell = training/gym; tv = a show/cartoon/stream)
- mood (hero face): {", ".join(MOODS)}
- action: {", ".join(ACTIONS)}
- crowd: 0-60 people around (more for fans, customers, everyone)
- brand (only for logo/sign beats, or when a company is named): {{"name": "...", "bg": "#hex", "fg": "#hex", "icon": one of {", ".join(ICONS)}}}
  Use the company's real brand colours.
Rules: in a what-if Short the hero IS the one person doing the thing: show them doing it (drive for rides, boxes
for deliveries, burger for food) on most lines, not standing around. Use clock at most twice and phone at most once
per Short. money happens on the street or in an office, never in space. Consecutive sentences should look different (change place, beat or camera subject); a sports star plays in
their sport's place; numbers about money -> money; about time -> clock; about many people -> queue or crowd;
about an app or phone -> phone; rides/driving/delivery -> drive. Never invent facts.
Reply with JSON only: {{"scenes": [{{"i": 0, "place": "...", "beat": "...", "props": [], "things": [], "mood": "...", "action": "...", "crowd": 0, "brand": null}}, ...]}}"""


def _gemini(prompt: str) -> dict | None:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.4}}
    for m in MODELS:
        req = urllib.request.Request(f"{API}/models/{m}:generateContent", data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "x-goog-api-key": key})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                res = json.loads(r.read())
            text = "".join(p.get("text", "") for c in res.get("candidates", []) for p in c.get("content", {}).get("parts", []))
            out = json.loads(text[text.find("{"):text.rfind("}") + 1])
            out["_model"] = m
            return out
        except Exception as e:  # noqa: BLE001
            print(f"[director] {m}: {str(e)[:160]}", flush=True)
    return None


def clean(sc: dict) -> dict:
    """Keep only kit values; drop anything unknown."""
    out = {"place": sc.get("place") if sc.get("place") in PLACES else "street",
           "beat": sc.get("beat") if sc.get("beat") in BEATS else "walk",
           "props": [p for p in (sc.get("props") or []) if p in PROPS][:2],
           "mood": sc.get("mood") if sc.get("mood") in MOODS else "happy",
           "action": sc.get("action") if sc.get("action") in ACTIONS else "stand",
           "crowd": max(0, min(60, int(sc.get("crowd") or 0))),
           "things": [t for t in (sc.get("things") or []) if t in THINGS][:2]}
    b = sc.get("brand")
    if isinstance(b, dict) and b.get("name"):
        ok = lambda c: isinstance(c, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", c or "")
        out["brand"] = {"name": str(b["name"])[:16], "bg": b["bg"] if ok(b.get("bg")) else "#241726",
                        "fg": b["fg"] if ok(b.get("fg")) else "#ffffff", **({"icon": b["icon"]} if b.get("icon") in ICONS else {})}
    if out["beat"] == "drive":
        out["place"] = "road"
    if out["beat"] in ("logo", "sign") and "brand" not in out:
        out["beat"] = "walk"
    return out


def vary(out: list[dict]) -> list[dict]:
    """Nov 15 Uber test: three clocks and back-to-back phones. No beat other than walk twice in a row, clock <= 2,
    phone <= 1; a dropped beat becomes walk in a different place."""
    seen: dict[str, int] = {}
    cap = {"clock": 2, "phone": 1, "queue": 2, "money": 2}
    for i, sc in enumerate(out):
        b = sc["beat"]
        prev = out[i - 1]["beat"] if i else None
        if b != "walk" and (b == prev or seen.get(b, 0) >= cap.get(b, 9)):
            sc["beat"] = "walk"
            sc.pop("brand", None) if b not in ("logo", "sign") else None
            if sc["place"] == "road":
                sc["place"] = "street"
        seen[sc["beat"]] = seen.get(sc["beat"], 0) + 1
    return out


def fallback(sentences: list[str], script: dict) -> list[dict]:
    from .toon import beats_for
    fmt, hero_sets = script.get("format"), {sc.get("visual", {}).get("set") for sc in script.get("scenes", [])}
    home = "court" if "court" in hero_sets else "pitch" if "pitch" in hero_sets else "stage" if "studio" in hero_sets else "street"
    beats = beats_for(sentences, [None] * len(sentences), script.get("company", "") if fmt != "famous" else "")
    out = []
    for i, (s, b) in enumerate(zip(sentences, beats)):
        sc = {"place": home if b == "walk" else "street", "beat": b, "props": [], "mood": "happy", "action": "stand", "crowd": 0}
        if re.search(r"\b(fans|crowd|everyone|people|customers)\b", s.lower()):
            sc["crowd"] = 30
        out.append(clean(sc))
    return out


def direct(script: dict, sentences: list[str]) -> tuple[list[dict], str]:
    """One scene per sentence: the script's own `toon` lists win, then Gemini, then the keyword fallback."""
    given = []
    for sc in script.get("scenes", []):
        given += sc.get("toon") or []
    if len(given) >= len(sentences):
        return [clean(g) for g in given[:len(sentences)]], "script"
    hero = script.get("name_card") or "an everyday person"
    prompt = (f"{KIT}\n\nShort: \"{script.get('title', '')}\" (format: {script.get('format')}, company/topic: "
              f"{script.get('company', '')}, hero: {hero}).\nSentences:\n" + "\n".join(f"{i}: {s}" for i, s in enumerate(sentences)))
    res = _gemini(prompt)
    if res and isinstance(res.get("scenes"), list):
        by = {int(x.get("i", k)): x for k, x in enumerate(res["scenes"]) if isinstance(x, dict)}
        fb = None
        out = []
        for i in range(len(sentences)):
            if i in by:
                out.append(clean(by[i]))
            else:
                fb = fb or fallback(sentences, script)
                out.append(fb[i])
        return vary(out), res.get("_model", "gemini")
    return fallback(sentences, script), "keywords"


if __name__ == "__main__":
    from . import tts
    s = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    sents = [x for sc in s["scenes"] for x, _q, b in tts.sentences(tts.speakable(sc["narration"])) if not b]
    scenes, how = direct(s, sents)
    print("director:", how)
    for t, sc in zip(sents, scenes):
        print(f"- {t[:60]:60s} -> {sc}")
