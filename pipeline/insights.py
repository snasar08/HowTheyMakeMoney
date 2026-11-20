"""Turn analytics/stats.json into plain-English findings (analytics/insights.md) and format
weights for the queue (analytics/format_weights.json).

Metrics per Short: views at 48 h and 7 days after posting (nearest snapshot at or after that age),
like rate and comment rate (per view). Compared by format, visual style, hook style, title style,
length bucket, theme and post slot. Small-number guard: a group needs MIN_N Shorts (default 10)
before anything is called a finding; smaller groups are listed as "early signals" only.

  python -m pipeline.insights
"""
from __future__ import annotations

import datetime as dt
import json
import os
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "analytics"
MIN_N = int(os.environ.get("INSIGHTS_MIN_N", "10"))
DIMS = [("format", "Format"), ("visual_style", "Visual style"), ("hook_style", "Hook style"),
        ("title_style", "Title style"), ("length_bucket", "Length"), ("theme", "Theme"), ("post_slot", "Post time")]


def _t(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def views_at(row: dict, hours: float) -> int | None:
    pub = _t(row["published"])
    for snap in sorted(row["snapshots"], key=lambda x: x["t"]):
        if (_t(snap["t"]) - pub).total_seconds() >= hours * 3600:
            return snap["views"]
    return None


def shorts(db: dict) -> list[dict]:
    out = []
    for vid, row in db.get("videos", {}).items():
        if not row.get("snapshots") or not row.get("tags"):
            continue
        last = max(row["snapshots"], key=lambda x: x["t"])
        v = max(1, last["views"])
        out.append({**row["tags"], "video": vid, "title": row["title"], "v48": views_at(row, 48), "v7d": views_at(row, 168),
                    "views": last["views"], "like_rate": last["likes"] / v, "comment_rate": last["comments"] / v})
    return out


def med(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None


def main() -> int:
    path = A / "stats.json"
    db = json.loads(path.read_text()) if path.exists() else {"videos": {}}
    rows = shorts(db)
    lines = [f"# Insights ({dt.date.today().isoformat()})", "",
             f"Shorts with stats: **{len(rows)}**. A comparison needs at least {MIN_N} Shorts per group "
             "before it counts as a finding; anything smaller is an early signal only.", ""]
    weights = {}
    if not rows:
        lines += ["No posted Shorts have stats yet (needs the YT_API_KEY secret and a few days of posts).",
                  "Writer: keep the default format mix (~25% each) this week."]
    else:
        overall = med([r["v48"] for r in rows]) or med([r["views"] for r in rows]) or 1
        top = sorted(rows, key=lambda r: -(r["v48"] or r["views"]))
        lines += ["## Best and worst so far (views at 48 h, or latest)", ""]
        for r in top[:3]:
            lines.append(f"- 🔝 {r['title']} — {r['v48'] or r['views']} views, {r['format']}, {r['hook_style']} hook")
        for r in top[-3:][::-1]:
            lines.append(f"- 🔻 {r['title']} — {r['v48'] or r['views']} views, {r['format']}, {r['hook_style']} hook")
        lines.append("")
        for key, label in DIMS:
            groups = {}
            for r in rows:
                groups.setdefault(r.get(key) or "?", []).append(r)
            if len(groups) < 2:
                continue
            lines += [f"## {label}", "", "| group | Shorts | median views 48 h | median 7 d | like rate | comment rate | |",
                      "|---|---|---|---|---|---|---|"]
            for g, rs in sorted(groups.items(), key=lambda kv: -(med([r["v48"] for r in kv[1]]) or 0)):
                n = len(rs)
                m48, m7 = med([r["v48"] for r in rs]), med([r["v7d"] for r in rs])
                lr, cr = med([r["like_rate"] for r in rs]), med([r["comment_rate"] for r in rs])
                tag = "finding" if n >= MIN_N else "early signal"
                lines.append(f"| {g} | {n} | {m48 if m48 is not None else '–'} | {m7 if m7 is not None else '–'} | "
                             f"{lr:.1%} | {cr:.2%} | {tag} |")
                if key == "format" and n >= MIN_N and m48:
                    weights[g] = round(min(1.4, max(0.7, m48 / overall)), 2)
            lines.append("")
        lines += ["## What the writer should do", ""]
        if weights:
            best = max(weights, key=weights.get)
            lines.append(f"- Lean toward **{best}** (weight {weights[best]}); keep ~20% experimental; never drop a format.")
        else:
            lines.append("- Not enough Shorts per group yet. Keep the default mix; note early signals only.")
    A.mkdir(exist_ok=True)
    (A / "insights.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (A / "format_weights.json").write_text(json.dumps(weights, indent=2) + "\n")
    print(f"[insights] {len(rows)} Shorts, weights {weights or 'none yet'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
