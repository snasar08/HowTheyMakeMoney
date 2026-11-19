"""Merge toon/public/models/index.<pack>.json into index.json and credits.<pack>.md into CREDITS.md (run after adding packs)."""
import json
from pathlib import Path
d = Path(__file__).resolve().parent.parent / "public" / "models"
idx = json.loads((d / "index.json").read_text(encoding="utf8"))
for f in sorted(d.glob("index.*.json")):
    idx.update(json.loads(f.read_text(encoding="utf8")))
(d / "index.json").write_text(json.dumps(dict(sorted(idx.items())), indent=1), encoding="utf8")
head = (d / "CREDITS.head.md").read_text(encoding="utf8") if (d / "CREDITS.head.md").exists() else ""
parts = [head] + [f.read_text(encoding="utf8") for f in sorted(d.glob("credits.*.md"))]
(d / "CREDITS.md").write_text("\n".join(parts), encoding="utf8")
print(len(idx), "models")
