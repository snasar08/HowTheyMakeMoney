# WORKLOG — 3D upgrade (branch `3d-upgrade`)

On restart: read this file and TODO.md, `git switch 3d-upgrade`, continue from "In progress".
Rules: the live channel posts from `main` untouched; merge only after a full GitHub end-to-end test
passes and the 3D version is clearly better. Free tools only; ≤100 Higgsfield credits on experiments.

## Status
- Live channel: OK. Launch Oct 26 (009, 019, 002 scheduled via Buffer at 7/8/9 PM), nightly ran
  Oct 27 and Oct 28 ("Delivered Shorts" commits on main).
- Higgsfield experiment ledger: start 491.5 credits (Oct 29). Spent: 4 (people B-roll 001/002).

## Done
- 2026-10-29 branch `3d-upgrade` from main 0154f54.
- Renderer benchmark on GitHub's runner (`bench3d.yml`, results on branch `3d-bench-results`):
  | renderer | per 1080x1920 frame |
  |---|---|
  | moderngl + Mesa llvmpipe (EGL), MSAA 4 | 100–120 ms |
  | same, no MSAA | 77–86 ms |
  | same, 720x1280 MSAA 4 | 47–60 ms |
  | Blender 4.0 Cycles CPU, 16 spp, no denoise | 14,680 ms |
  → **moderngl chosen** (≈130x faster; renders straight into the Pillow pipeline).
- `pipeline/gl3d.py`: engine (key + rim + hemispheric light, soft tone curve, floor fading into the
  theme background, contact shadows, fog, depth-of-field post pass, vignette, lens shift so 3D
  content sits between the channel tag and the caption dead zone). All GL work runs on one
  dedicated thread (`run3d`) because frames render in a thread pool.
- `pipeline/scene3d.py`: bars rising from a floor (staggered, overshoot, values + labels float
  above), big extruded number counting over growing coin + cash stacks (stat), pie whose slice
  lifts and slides out (donut), spinning globe with Natural Earth land + glowing dots (new
  `globe` visual: `{"type": "globe", "points": [{"lat", "lon"}], "label"}`), extruded 3D text.
  Five camera paths so consecutive shots differ.
- `render.py`: chart scenes use 3D for every beat (every 3rd beat cuts to B-roll + figure);
  3D card-swing transition on every cut. `RENDER_3D=off` / `TRANSITION_3D=off` switch back;
  automatic 2D fallback if GL fails.
- Sam (Oct 29): "I want it to be like people not just those 3d models of people". Read as:
  show realistic made-up people in the photos. STYLE.md/CLAUDE.md now require ≥2 of 4 images
  with candid realistic people (no real/famous people, no kids alone). Made 4 such B-roll images
  for 001/002 (4 credits).
- `buffer_dry` upload mode: read-only Buffer channel lookup + exact post payload, no post.
- `3d-e2e.yml`: pushing branch `3d-e2e` renders 001/002/022 on GitHub with real voice + all
  checks + gate + Buffer dry run; results → branch `3d-e2e-results`, MP4s as artifact.
- Local comparison videos: out/compare/{001,002}-*-before-after.mp4 (left = current main,
  right = 3D), plus the individual files.

- e2e run #2 on GitHub (15e2e04): PASSED. Per Short incl. real voice, Whisper clarity check
  and 3D on llvmpipe: 001 148 s, 002 133 s, 022 97 s (budget 8 min). zone check OK, quality gate
  passed, Buffer dry run found "How They Make Money" and built valid posts (nothing posted).
  BUT every 3D frame was blurred on GitHub only: Mesa doesn't resolve multisampled depth
  reliably, so depth of field treated everything as out of focus. Fix (248acf3): separate
  half-res depth pass into a float texture. Results publishing fixed the ci-test way.
- Linter, failure-alert issue, safe-area centering, pronunciation fixes, per-Short camera
  variety, analytics/PLAN.md (see TODO.md).
- Higgsfield image-to-video hook priced: Grok Video 1.5 3 s 480p = 7.5 credits, Seedance 2.5
  4 s 480p = 12. At 2/day that's ~450–720 credits/month on top of ~243–332 → over the 600
  plan. Not adopted; no credits spent on it.

- e2e #3 (248acf3) sharp frames confirmed; e2e #4 (b72cf52) passed: 128/127/90 s, clarity
  98/100/100%, zone OK, gate OK, Buffer dry run OK.
- **MERGED to main 76e5799** (Oct 29 ~07:05 UTC). Off switch: repo variable RENDER_3D=off.
- out/REPORT.md written (local, out/ is gitignored).

## In progress
- Watch the first 3D nightly (10:17 UTC Oct 29): check "Delivered Shorts" commit + no failure issue.

## Next
- Read e2e results; fix; check render minutes vs 8-min budget.
- Price one Higgsfield image-to-video hook clip (optional).
- Phase 3 list in TODO.md.

## Decisions
- moderngl over Blender/three.js (numbers above). three.js/Chromium not prototyped: same
  software GL (SwiftShader) plus a browser and frame capture overhead, no quality gain over
  the moderngl path for this content.
- 3D on chart scenes only; Higgsfield photos stay photos (with people) — Sam wants real-looking
  people, not 3D figures.

## Needs Sam
- Confirm the "people" reading above (realistic made-up people in the photos).
