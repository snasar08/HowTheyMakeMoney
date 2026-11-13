"""Pick the channel's Gemini voice from the test (Nov 13, Sam: "do everything yourself").
Rules from the research and Sam's feedback: a male voice in the normal speaking range (95-160 Hz: not deep
like narrator2, not high like the old voice), real but not sing-song movement (2.6-5.5 st), then the most
natural (UTMOS). Writes <dir>/pick.txt (the voice name) and <dir>/pick.log (the ranking)."""
import json
import re
import sys
from pathlib import Path

d = Path(sys.argv[1])
scores = json.loads((d / "scores.json").read_text())
log = (d / "gemini.log").read_text()
rows = []
for m in re.finditer(r"(g\d+-(\w+)): [\d.]+s, median ([\d.]+) Hz, movement ([\d.]+) st", log):
    key, voice, hz, st = m.group(1), m.group(2), float(m.group(3)), float(m.group(4))
    ok = 95 <= hz <= 160 and 2.6 <= st <= 5.5
    rows.append((ok, scores.get(key, {}).get("utmos", 0), voice, hz, st))
rows.sort(key=lambda r: (not r[0], -r[1]))
text = "".join(f"{v}: ok={o} utmos={u} {hz} Hz {st} st\n" for o, u, v, hz, st in rows)
(d / "pick.log").write_text(text)
print(text)
if rows:
    (d / "pick.txt").write_text(rows[0][2] + "\n")
