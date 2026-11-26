"""Eyes (Nov 13, Sam: "figure out a way to give it eyes"): after a Short is rendered, a vision model LOOKS at it
like a viewer would and reports what is wrong. Gemini Flash-Lite on the free tier (same GEMINI_API_KEY; ~500
requests/day free, one request per Short), standard library + Pillow + ffmpeg.

  python -m pipeline.eyes out/074-famous-giannis.mp4 content/scripts/074-famous-giannis.json

Sends one sheet of 12 frames (every ~2.5 s, in order) + the cover, with the script's title and narration, and asks
for JSON: a 1-10 score, problems a viewer would notice (unreadable / cut-off / overlapping text, misspellings vs the
script, blank or broken frames, glitchy or distorted characters, logos, a cover that doesn't say the topic) and the
single most useful fix. Warn-only unless EYES=strict (then a score <= 3 blocks the post).

Nov 15 (Sam approved: "the automatic 30 fps frame check before posting"): by default (EYES_FRAMES=all) it sends
EVERY frame at 30 fps as numbered sheets of 100 (like pipeline/allframes), plus a machine scan (blank frames, the
longest frozen stretch), and asks whether each picture shows what the line says. A Short is HELD (needs_fix, the
next ready Short takes its slot) when the score is <= 3, the reviewer marks a serious visible defect ("hold"), or
the picture is frozen for more than 4 s. EYES=warn makes it warn-only again; EYES_FRAMES=12 is the old sample.
"""
from __future__ import annotations

import base64
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://generativelanguage.googleapis.com/v1beta"
MODELS = [m for m in os.environ.get("EYES_MODELS", "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-2.5-flash-lite").split(",") if m]   # Nov 18: gemini-2.5-flash retired (404)
PROMPT = """You are the strict quality checker for a YouTube Shorts channel ("How They Make Money", viewers 13-18).
Image 1 is the cover (frame 0). Image 2 is a sheet of frames from the finished vertical video in time order
(left to right, top to bottom, about 2.5 seconds apart).
Title: {title}
Narration: {narration}

Things that are NORMAL here, never report them: big numbers COUNT UP from 0 to their final value, so a frame
can show a smaller number mid-count (only a FINAL number that disagrees with the narration is a problem); pie
charts fill up from 0%; the animated characters are a simple low-poly cartoon style; today is {today}, so
dates up to now (e.g. Q3 2026) are in the past; one-word captions at the bottom follow the voice.
Judge it the way a viewer scrolling past would. Report only problems you can actually SEE:
- text that is cut off, overlapping other text, too small to read on a phone, or misspelled compared to the narration
- numbers on screen that contradict the narration
- blank, black, frozen-looking or corrupted frames
- characters or objects that look broken, glitched, stretched or melted
- real company logos or brand marks
- a cover that does not make the topic or the number clear
- anything that looks cheap, confusing or off-putting
{extra}Reply with JSON only:
{{"score": <1-10, 10 = would stop a teen scrolling, nothing wrong>, "problems": ["<short, specific>", ...],
"best_fix": "<the single most useful change>", "hold": <true ONLY for a serious defect a viewer cannot miss: blank
or black stretches, broken/corrupted frames, a melted or glitched main character, text covering the main subject
for seconds, unreadable cut-off title, or scenes with nothing to do with the narration for most of the video>}}"""
ALL_FRAMES = """Images 2+ are EVERY frame of the video at 30 fps, 100 per sheet (10 x 10, read left to right, top to
bottom; the small yellow number is the frame index, 30 = 1 second). Also check, for the whole video:
- the scenery: when the narration mentions a thing (a shoe, a bus, a phone, money, a logo, a place), it should be on
  screen around then; a picture that has nothing to do with its line is a problem
- a new view at least every ~2 seconds (no long holds on one shot)
- logos, signs, phones or people cut off at the frame edge
Machine scan of all frames: {scan}
"""

# ACT CHECK (Nov 16): story Shorts have "acts" (the hero performs a scripted action). One short description per kind;
# a kind not listed falls back to its name. Frame ranges come from the toon plan's ah.shots ({a, n, act: {kind}}).
ACT_DESC = {
    "dribble": "visibly DRIBBLING a basketball", "shoot": "visibly SHOOTING a basketball that goes through the hoop",
    "dunk": "visibly DUNKING a basketball into the hoop", "block": "visibly BLOCKING an opponent's shot / jumping to swat the ball",
    "pass": "visibly PASSING a basketball to a teammate", "layup": "visibly doing a LAYUP at the hoop",
    "kick": "visibly KICKING a ball", "punch": "visibly PUNCHING (boxing)", "sprint": "visibly SPRINTING on a track",
    "trophy_lift": "visibly LIFTING a trophy overhead", "eat": "visibly EATING food", "drink": "visibly DRINKING",
    "phone_call": "visibly TALKING on a phone held to the ear", "type_laptop": "visibly TYPING on a laptop",
    "count_cash": "visibly COUNTING cash (bills in hand / stacks)", "sign_contract": "visibly SIGNING a contract with a pen",
    "drive_car": "visibly DRIVING a car (seated at the wheel, car moving)", "throw_cash": "visibly THROWING cash into the air",
    "present_chart": "visibly PRESENTING a chart (pointing at it)", "unbox": "visibly UNBOXING a package",
    "handshake_deal": "visibly SHAKING HANDS to close a deal", "qb_throw": "visibly THROWING a football",
    "touchdown": "visibly SCORING a touchdown", "bat_swing": "visibly SWINGING a baseball bat",
    "pitch": "visibly PITCHING a baseball", "tennis_serve": "visibly SERVING a tennis ball",
    "golf_swing": "visibly SWINGING a golf club", "goal_celebrate": "visibly CELEBRATING a goal",
    "race_car": "visibly RACING a car", "sprint_finish": "visibly CROSSING a finish line", "lift_weights": "visibly LIFTING weights",
    "ring_bell": "visibly RINGING a bell", "ribbon_cut": "visibly CUTTING a ribbon", "stack_gold": "visibly STACKING gold bars",
    "card_swipe": "visibly SWIPING a card", "cash_register": "visibly working a CASH REGISTER",
    "stock_up": "a stock chart visibly GOING UP", "stock_crash": "a stock chart visibly CRASHING",
    "vault": "visibly at a VAULT of money", "hire": "visibly HIRING someone", "gaming": "visibly PLAYING a video game",
    "streaming": "visibly STREAMING (talking to a camera/mic)", "sing_stage": "visibly SINGING on a stage",
    "guitar": "visibly PLAYING a guitar", "film_camera": "visibly FILMING with a camera",
    "rocket_launch": "visibly LAUNCHING a rocket", "build_tools": "visibly HAMMERING nails into a wooden house frame (hammer swinging at the frame)",
    "code_screens": "visibly CODING on screens", "robot_build": "visibly BUILDING a robot",
    "post_video": "visibly POSTING a video on a phone", "eat_pizza": "visibly EATING pizza", "eat_fries": "visibly EATING fries",
    "eat_icecream": "visibly EATING ice cream", "eat_donut": "visibly EATING a donut", "eat_cookie": "visibly EATING a round dark sandwich cookie (two dark wafers with white cream between)", "drink_soda": "visibly DRINKING a soda",
}
ACT_ASK = """ACT CHECK. In these frame ranges the character performs a scripted action. For EACH one decide whether a viewer
would instantly read that action (right pose, the right object in hand, the action actually completing; a character just
standing or posing beside the object is NOT clear):
{lines}
Add to the JSON reply a key "acts": one object per range above, in order:
{{"kind": "<kind>", "frames": "<A-B>", "clear": <true|false>, "why": "<one short sentence of what you actually see>"}}
"""


def load_acts(video: Path, total: int | None = None) -> list[dict]:
    """Act shots [{kind, a, b}] (b inclusive) from the toon plan props (ah.shots with act). Looked up, in order: env
    EYES_ACTS (a props/plan JSON or sidecar), <video>.acts.json, EYES_PLAN_DIR/<stem>.json, toonplans/<stem>.json and
    tp/<stem>.json (the nightly make job has toonplans/). Adjacent shots of the same kind merge. [] when none found.
    `total` = frames in the video: plan frame numbers are scaled if the plan length differs by more than 2%."""
    cands = [os.environ.get("EYES_ACTS"), str(video) + ".acts.json", str(video.with_suffix(".acts.json"))]
    for d in (os.environ.get("EYES_PLAN_DIR"), "toonplans", "tp"):
        if d:
            cands.append(str(Path(d) / f"{video.stem}.json"))
    for c in cands:
        if not c or not Path(c).is_file():
            continue
        try:
            data = json.loads(Path(c).read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        shots = data if isinstance(data, list) else ((data.get("ah") or {}).get("shots") or data.get("shots") or [])
        return acts_from_shots(shots, total)
    return []


def acts_from_shots(shots: list, total: int | None = None) -> list[dict]:
    shots = [s for s in shots if isinstance(s, dict) and "a" in s and "n" in s]
    end = max([int(s["a"]) + int(s["n"]) for s in shots] or [0])
    k = total / end if total and end and abs(total - end) / end > 0.02 else 1.0
    out: list[dict] = []
    for s in shots:
        kind = (s.get("act") or {}).get("kind")
        if not kind:
            continue
        a, b = round(int(s["a"]) * k), round((int(s["a"]) + int(s["n"])) * k) - 1
        if out and out[-1]["kind"] == kind and a <= out[-1]["b"] + 1:
            out[-1]["b"] = max(out[-1]["b"], b)
        else:
            out.append({"kind": kind, "a": a, "b": max(a, b)})
    return out


def act_text(acts: list[dict]) -> str:
    lines = "\n".join("- frames %d-%d (%s): he should be %s" % (
        x["a"], x["b"], x["kind"], ACT_DESC.get(x["kind"], "visibly doing: " + x["kind"].replace("_", " "))) for x in acts)
    return ACT_ASK.format(lines=lines)


def parse_acts(reply: dict | None, acts: list[dict]) -> list[dict]:
    """Per-act verdicts [{kind, frames, clear (True/False/None = no verdict), why}], one per expected act, in order.
    Tolerant of a missing/garbled "acts" key, string booleans, and verdicts out of order (matched by frames, then kind)."""
    raw = (reply or {}).get("acts")
    got = [g for g in raw if isinstance(g, dict)] if isinstance(raw, list) else []
    used: set[int] = set()
    out = []
    for x in acts:
        fr = f'{x["a"]}-{x["b"]}'
        pick = next((i for i, g in enumerate(got) if i not in used and str(g.get("frames", "")).replace(" ", "") == fr), None)
        if pick is None:
            pick = next((i for i, g in enumerate(got) if i not in used and g.get("kind") == x["kind"]), None)
        v = {"kind": x["kind"], "frames": fr, "clear": None, "why": ""}
        if pick is not None:
            used.add(pick)
            c = got[pick].get("clear")
            if isinstance(c, str):
                c = {"true": True, "false": False}.get(c.strip().lower())
            v["clear"] = c if isinstance(c, bool) else None
            v["why"] = str(got[pick].get("why", ""))[:200]
        out.append(v)
    return out


def act_blockers(verdicts: list[dict]) -> list[str]:
    return [f'act {v["kind"]} unclear at frames {v["frames"]}: {v.get("why") or "no reason given"}'[:200]
            for v in verdicts if v.get("clear") is False]


def frames(video: Path, n: int = 12):
    from PIL import Image
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                               capture_output=True, text=True, check=True).stdout.strip() or 0)
    out = []
    for i in range(n + 1):
        t = 0.0 if i == 0 else min(dur - 0.1, 0.8 + (i - 1) * max(dur - 1.0, 1) / max(n - 1, 1))
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1",
                            "-f", "image2pipe", "-vcodec", "png", "pipe:1"], capture_output=True, check=True)
        out.append(Image.open(io.BytesIO(r.stdout)).convert("RGB"))
    return out


def sheet(imgs, cols: int = 6, w: int = 270):
    from PIL import Image
    h = int(w * imgs[0].height / imgs[0].width)
    rows = (len(imgs) + cols - 1) // cols
    s = Image.new("RGB", (cols * w, rows * h), (20, 20, 20))
    for k, im in enumerate(imgs):
        s.paste(im.resize((w, h)), (k % cols * w, k // cols * h))
    return s


def _jpeg(im, q=85) -> str:
    b = io.BytesIO()
    im.save(b, "JPEG", quality=q)
    return base64.b64encode(b.getvalue()).decode()


def all_frames(video: Path):
    """Every frame at 30 fps (108x192) -> (numbered 10x10 sheets, scan dict: blank frames, longest frozen run)."""
    import tempfile

    import numpy as np
    from PIL import Image, ImageDraw
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", "fps=30,scale=108:192", "-q:v", "4",
                        f"{d}/%05d.jpg"], check=True)
        fs = sorted(Path(d).glob("*.jpg"))
        ims = [Image.open(f).convert("RGB") for f in fs]
        for im in ims:
            im.load()
    blank, run, longest, prev = 0, 0, 0, None
    for im in ims:
        a = np.asarray(im.convert("L"), dtype=np.float32)
        blank += a.std() < 6
        run = run + 1 if prev is not None and np.abs(a - prev).mean() < 0.4 else 0
        longest = max(longest, run)
        prev = a
    sheets = []
    for s0 in range(0, len(ims), 100):
        sh = Image.new("RGB", (1080, 1920), (0, 0, 0))
        for j, im in enumerate(ims[s0:s0 + 100]):
            im = im.copy()
            ImageDraw.Draw(im).text((2, 2), str(s0 + j), fill=(255, 255, 0))
            sh.paste(im, (j % 10 * 108, j // 10 * 192))
        sheets.append(sh)
    return sheets, {"frames": len(ims), "blank_frames": int(blank), "longest_frozen_s": round((longest + 1) / 30, 1)}


def look(video: Path, script: dict) -> dict | None:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    acts: list[dict] = []
    imgs = frames(video, 0 if os.environ.get("EYES_FRAMES", "all") == "all" else 12)
    narration = " ".join(sc.get("narration", "") for sc in script.get("scenes", []))
    if os.environ.get("EYES_FRAMES", "all") == "all":
        sheets, scan = all_frames(video)
        extra = ALL_FRAMES.format(scan=json.dumps(scan))
        try:
            acts = load_acts(video, scan.get("frames"))
        except Exception as e:  # noqa: BLE001
            print(f"::warning title=eyes::could not read the acts ({e!r})", flush=True)
        if acts:
            extra += act_text(acts)
        pics = [_jpeg(sh, 80) for sh in sheets]
    else:
        scan, extra, pics = {}, "", [_jpeg(sheet(imgs[1:]))]
    text = PROMPT.format(title=script.get("title", ""), narration=narration, extra=extra,
                         today=__import__("datetime").date.today().strftime("%B %Y"))
    if extra:
        text = text.replace("Image 2 is a sheet of frames from the finished vertical video in time order\n"
                            "(left to right, top to bottom, about 2.5 seconds apart).", "")
    body = {"contents": [{"parts": [
        {"text": text},
        {"inline_data": {"mime_type": "image/jpeg", "data": _jpeg(imgs[0].resize((540, 960)))}},
        *({"inline_data": {"mime_type": "image/jpeg", "data": p}} for p in pics)]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}
    last = ""
    for m in MODELS:
        req = urllib.request.Request(f"{API}/models/{m}:generateContent", data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "x-goog-api-key": key})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                res = json.loads(r.read())
            text = "".join(p.get("text", "") for c in res.get("candidates", []) for p in c.get("content", {}).get("parts", []))
            out = json.loads(text[text.find("{"):text.rfind("}") + 1])
            out["model"] = m
            if acts:
                out["acts"] = parse_acts(out, acts)
            if scan:
                out["scan"] = scan
            return out
        except urllib.error.HTTPError as e:
            last = f"{m}: HTTP {e.code} {e.read()[:200]!r}"
        except Exception as e:  # noqa: BLE001
            last = f"{m}: {e!r}"
    print(f"::warning title=eyes::could not get a review ({last[:300]})", flush=True)
    return None


def report(name: str, r: dict | None) -> list[str]:
    """Print the review; returns blockers (score <= 3, a "hold" defect, frozen > 4 s; none with EYES=warn)."""
    if not r:
        return []
    print(f"::notice title={name} eyes::score {r.get('score')}/10 ({r.get('model')}); fix: {str(r.get('best_fix', ''))[:200]}",
          flush=True)
    for p in (r.get("problems") or [])[:6]:
        print(f"::warning title={name} eyes::{str(p)[:220]}", flush=True)
    try:
        low = float(r.get("score", 10)) <= 3
    except (TypeError, ValueError):
        low = False
    frozen = float((r.get("scan") or {}).get("longest_frozen_s", 0)) > 4
    if r.get("scan"):
        print(f"::notice title={name} frames::{json.dumps(r['scan'])}", flush=True)
    out = [f"eyes score {r.get('score')}/10"] if low else []
    if r.get("hold") is True:
        out.append(f"eyes hold: {str((r.get('problems') or ['serious defect'])[0])[:160]}")
    acts = r.get("acts") or []
    for v in acts:
        print(f"::notice title={name} act::{v.get('kind')} frames {v.get('frames')} clear={v.get('clear')}: {str(v.get('why', ''))[:160]}",
              flush=True)
    if acts and all(v.get("clear") is None for v in acts):
        print(f"::warning title={name} eyes::{len(acts)} act(s) to check but the reviewer returned no act verdicts", flush=True)
    out += act_blockers(acts)
    if frozen:
        out.append(f"picture frozen {r['scan']['longest_frozen_s']} s")
    if out and os.environ.get("EYES", "block") == "warn":
        print(f"::warning title={name} eyes::would hold ({'; '.join(out)}) but EYES=warn", flush=True)
        return []
    return out


if __name__ == "__main__":
    v, s = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    print(json.dumps(look(v, s), indent=2))
