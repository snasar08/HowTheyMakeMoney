# Character credits

| Asset | Author | License | Source |
|---|---|---|---|
| Animated Human (mesh, rig, Idle/Walk/Run/Work/Jump/Punch/Death clips, clothed textures) | Quaternius | CC0 1.0 (public domain) — `src/quaternius-animated-human/License.txt` | https://opengameart.org/content/animated-human-low-poly |

CC0 needs no attribution; it's listed anyway. The `.glb` next to this file is converted from the
FBX (`src/`) by `.github/workflows/convert-chars.yml` (Blender, headless) — no changes to the model.
`skins/*.png` are the pack's clothed palette textures (renamed, unchanged).

## People pack (Nov 11): `people/*.glb`
| Asset | Author | License | Source |
|---|---|---|---|
| Ultimate Modular Men Pack: Casual, Hoodie, Beach, Worker, Punk, Farmer, Suit, Adventurer (`m_*.glb`) | Quaternius | CC0 1.0 (public domain) | https://quaternius.com/packs/ultimatemodularcharacters.html |
| Ultimate Modular Women Pack: Adventurer, Punk (`w_*.glb`) | Quaternius | CC0 1.0 (public domain) | https://quaternius.com/packs/ultimatemodularwomen.html |
| Ultimate Modular Women Pack: Casual, Formal, Suit, Worker (`v_*.glb`) | Quaternius | CC0 1.0 (public domain); the pack's License.txt | the pack's own Google Drive folder, linked from https://quaternius.com/packs/ultimatemodularwomen.html |

`m_*` and `w_*` are the unchanged GLB copies hosted on poly.pizza; `v_*` are the author's glTF files repacked as GLB (same data, Nov 11) (only models listed there as CC0 were taken; the
author's Google Drive was over its download quota on Nov 10). Each model has one shared 62-bone rig, 24
clips and four swappable parts (head, body, legs, feet) with named flat-color materials. Used by
`pipeline/people.py` (GL) and `pipeline/blender_lp.py`. The older single figure above is still used by
`pipeline/scenes_chars.py`.

