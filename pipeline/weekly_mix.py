"""This week's script mix from what is actually working (Sam, Nov 18: "every Saturday it looks at the total picture,
sees what videos are going viral, see what videos aren't, and it just plays into that factor. It shouldn't abolish,
but maybe give one style more love that week to experiment").

  python -m pipeline.weekly_mix            # writes analytics/weekly_plan.md (daily in stats.yml; cheap, no API)
  python -m pipeline.weekly_mix --week     # Saturday part 1: same, and logs this week's bet in analytics/experiments.json

Lanes (a "style" of Short): famous-athlete, famous-other, story-plan, story-history, whatif, pov (active);
how, careers (paused by Sam: shown, never planned). Per lane, over Shorts posted in the last WINDOW days that are
at least 48 h old: median views at 48 h, median % watched (retention.json), count.

The plan:
- FOCUS = the measured lane (>= MIN_N Shorts in the window) with the best median 48 h views: its share x1.5.
- EXPERIMENT = the active lane we know least about (fewest measured Shorts, not the focus): at least 2 per part,
  plus one twist to try (hook, length or angle) so we learn something new each week.
- FLOOR: every active lane keeps at least 1 script per part. Nothing is ever dropped.
- Last week's bet is scored: the focus/experiment lanes' Shorts posted since the bet vs the baseline logged then.
"""
from __future__ import annotations

import datetime as dt
import json
import statistics
import sys
from pathlib import Path

from .insights import shorts, _t

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "analytics"
ACTIVE = ["famous-athlete", "famous-other", "story-plan", "story-history", "whatif", "pov"]
PAUSED = ["how", "careers"]
BASE = {"famous-athlete": 0.45, "famous-other": 0.2, "story-plan": 0.15, "story-history": 0.12, "whatif": 0.08, "pov": 0.12}
WINDOW, MIN_N, PER_PART = 21, 3, 10
LOOK_3D = "2026-11-18"   # every format renders in the 3D afterhour look from this date (scripts with look=toon opt out)


def lane(s: dict) -> str:
    f = s.get("format", "how")
    if f == "famous":
        return "famous-athlete" if (s.get("hero") or {}).get("outfit") == "kit" else "famous-other"
    if f == "story":
        return "story-plan" if s.get("story_mode") == "plan" else "story-history"
    return f


def rows(now: dt.datetime) -> list[dict]:
    db = json.loads((A / "stats.json").read_text()) if (A / "stats.json").exists() else {"videos": {}}
    rt = json.loads((A / "retention.json").read_text()) if (A / "retention.json").exists() else {}
    pct = {r["video"]: r.get("avg_pct") for r in rt.get("shorts", [])}
    scripts = {}
    for p in (ROOT / "content" / "scripts").glob("*.json"):
        try:
            s = json.loads(p.read_text(encoding="utf-8"))
            scripts[str(s.get("id"))] = s
        except Exception:
            pass
    out = []
    for r in shorts(db):
        s = scripts.get(str(r.get("script")), {})
        post = r.get("post_at") or db["videos"].get(r["video"], {}).get("published")
        if not post:
            continue
        r["lane"] = lane(s) if s else r.get("format", "?")
        r["posted"] = _t(post)
        r["look"] = "3d" if post[:10] >= LOOK_3D and s.get("look") != "toon" else "old"
        r["pct"] = pct.get(r["video"])
        r["hook"] = ((s.get("scenes") or [{}])[0].get("narration") or "")[:90]
        r["length_test"] = s.get("length_test")
        out.append(r)
    return out


def pc(x) -> str:
    return f"{x:.0f}%" if x else "–"


def med(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None


def lane_stats(rs: list[dict]) -> dict:
    out = {}
    for ln in ACTIVE + PAUSED:
        g = [r for r in rs if r["lane"] == ln and r["v48"] is not None]
        out[ln] = {"n": len(g), "v48": med([r["v48"] for r in g]), "pct": med([r["pct"] for r in g])}
    return out


def plan(st: dict) -> tuple[str | None, str, dict]:
    measured = [l for l in ACTIVE if st[l]["n"] >= MIN_N and st[l]["v48"] is not None]
    focus = max(measured, key=lambda l: (st[l]["v48"], st[l]["pct"] or 0)) if measured else None
    exp = min([l for l in ACTIVE if l != focus], key=lambda l: (st[l]["n"], -BASE[l]))
    share = dict(BASE)
    if focus:
        share[focus] = min(0.6, share[focus] * 1.5)
    tot = sum(share.values())
    share = {l: v / tot for l, v in share.items()}
    n = {l: max(1, round(share[l] * PER_PART)) for l in ACTIVE}
    n[exp] = max(n[exp], 2)
    while sum(n.values()) > PER_PART:   # take back from the biggest non-floor lane, never below 1 or the exp minimum
        big = max((l for l in ACTIVE if n[l] > (2 if l == exp else 1)), key=lambda l: n[l])
        n[big] -= 1
    while sum(n.values()) < PER_PART:
        n[focus or "famous-athlete"] += 1
    return focus, exp, n


TWISTS = [("length", "make half of them short (25-35 s, length_test short) and half long (45-60 s, length_test long)"),
          ("hook", "open on a surprise number the viewer would not guess (the hook style that wins on this channel)"),
          ("angle", "pick names trending this week (a record, a new contract, a viral moment) instead of evergreen ones")]


def score_last_bet(rs: list[dict], st: dict) -> list[str]:
    p = A / "experiments.json"
    log = json.loads(p.read_text()) if p.exists() else []
    if not log:
        return ["- No earlier bet logged yet (first one is logged by Saturday part 1 with `--week`)."]
    b = log[-1]
    since = _t(b["at"])
    out = [f"- Bet of {b['at'][:10]}: focus **{b['focus'] or 'none'}**, experiment **{b['experiment']}** ({b.get('twist', '')})."]
    for key in ("focus", "experiment"):
        ln = b.get(key)
        if not ln:
            continue
        new = [r["v48"] for r in rs if r["lane"] == ln and r["posted"] >= since and r["v48"] is not None]
        base = (b.get("baseline") or {}).get(ln)
        if len(new) < 2:
            out.append(f"  - {ln}: too early ({len(new)} Shorts with 48 h stats since then).")
        else:
            m = med(new)
            verdict = "WORKED" if base and m >= base * 1.15 else "worse" if base and m <= base * 0.85 else "about the same"
            out.append(f"  - {ln}: {len(new)} new Shorts, median {m:.0f} views at 48 h vs {base or '?'} before -> **{verdict}**.")
    return out


def main(argv: list[str]) -> int:
    now = dt.datetime.now(dt.timezone.utc)
    allr = rows(now)
    win = [r for r in allr if (now - r["posted"]).days <= WINDOW]
    st = lane_stats(win)
    focus, exp, n = plan(st)
    week = int(now.strftime("%V"))
    twist = TWISTS[week % len(TWISTS)]
    L = [f"# This week's mix ({now.date().isoformat()})", "",
         f"Made by `python -m pipeline.weekly_mix` from analytics/stats.json + retention.json (Shorts posted in the last "
         f"{WINDOW} days, at least 48 h old). Saturday parts follow the **counts per part** below instead of a fixed mix.", "",
         "## Lanes", "", "| lane | Shorts | median views 48 h | median watched | |", "|---|---|---|---|---|"]
    for ln in ACTIVE + PAUSED:
        s = st[ln]
        tag = "paused" if ln in PAUSED else ("FOCUS" if ln == focus else "EXPERIMENT" if ln == exp else "")
        L.append(f"| {ln} | {s['n']} | {s['v48'] if s['v48'] is not None else '–'} | "
                 f"{pc(s['pct'])} | {tag} |")
    ranked = sorted([r for r in win if r["v48"] is not None], key=lambda r: -r["v48"])
    L += ["", "## Going viral (top 5, last %d days)" % WINDOW, ""]
    L += [f"- {r['v48']} views, {r['lane']}, {r['look']} look{', ' + pc(r['pct']) + ' watched' if r['pct'] else ''}: "
          f"**{r['title']}** — \"{r['hook']}\"" for r in ranked[:5]]
    L += ["", "## Not working (bottom 5)", ""]
    L += [f"- {r['v48']} views, {r['lane']}: {r['title']} — \"{r['hook']}\"" for r in ranked[-5:][::-1]]
    looks = {k: [r["v48"] for r in win if r["look"] == k and r["v48"] is not None] for k in ("old", "3d")}
    L += ["", f"Look: old {len(looks['old'])} Shorts (median {med(looks['old'])}), 3D {len(looks['3d'])} Shorts "
          f"(median {med(looks['3d'])}){' — too few 3D Shorts yet to compare' if len(looks['3d']) < MIN_N else ''}.", ""]
    L += ["## Plan for each Saturday part (10 scripts)", ""]
    for ln in ACTIVE:
        why = " (FOCUS: best views, x1.5)" if ln == focus else f" (EXPERIMENT: least known; twist: {twist[1]})" if ln == exp else ""
        L.append(f"- {ln}: **{n[ln]}**{why}")
    L += ["- how / careers: 0 (paused by Sam)", "",
          "Fewer than 10 needed? Keep the ratio, but every active lane still gets at least 1 and the experiment 2.",
          "Write the focus lane like the top 5 above (same hook shape, same kind of person); never copy their lines.", "",
          "## Last week's bet", ""]
    L += score_last_bet(allr, st)
    A.mkdir(exist_ok=True)
    (A / "weekly_plan.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    if "--week" in argv:
        p = A / "experiments.json"
        log = json.loads(p.read_text()) if p.exists() else []
        if not log or (now - _t(log[-1]["at"])).days >= 6:
            log.append({"at": now.isoformat(timespec="minutes"), "focus": focus, "experiment": exp, "twist": twist[0],
                        "counts": n, "baseline": {l: st[l]["v48"] for l in ACTIVE}})
            p.write_text(json.dumps(log, indent=1) + "\n")
    print(f"[weekly_mix] focus={focus} experiment={exp} counts={n}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
