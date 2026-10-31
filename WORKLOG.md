## Oct 31 2026 — shorts-craft skill
- Added project skill `.claude/skills/shorts-craft` with MIT guides from github.com/agricidaniel/claude-youtube
  (hook, shorts, shorts-playbook, retention-scripting, algorithm). Excluded its API/OAuth scripts and
  paid DataForSEO parts. Weekly batch step 2 now reads it. Directory plugins (Social Media Skills,
  ffmpeg-llm) need a one-tap Add by Sam; not installed.

## Oct 30 2026 — cover frame, loop seam, breath split, title test, blank-frame gate
- fx.hook full on frame 0; fx.loop_blend; tts.breath_split (>14 words); lint long-sentence warning;
  gate on blank frames; CLAUDE.md weekly batch rotates title_style as an ongoing test.

## Oct 30 2026 — visual FX (merged)
- New `pipeline/fx.py`: count-up stats, coin bursts on huge numbers, hook title punch-in (low-poly),
  zoom-blur scene changes, 2D drift, color grade + vignette + static grain, keyword icons.
- Tested: 3d-e2e (005, 028: clarity 100%/96%, zone OK, Buffer dry run OK) + local low-poly render of 030.
  Moving grain made a 33 s Short 89 MB, so grain is static now (030: 22 MB).

# WORKLOG

## Oct 30 2026 — voice + features (merged)
- Voice: Sam disliked am_fenrir, then af_bella → **am_puck** at 1.2 (top-rated Kokoro male tier, most
  expressive; Fish Audio S2 Pro / other top open models are non-commercial or ~30x real-time on CPU).
- Loudness normalized to -14 LUFS (measured -15.0). Numbers pop in captions; music mood per format.
- 1 PM extra post (Sam's request): 030 what-if Amazon. First launch crashed (launch.yml lacked Mesa/EGL)
  → fixed + low-poly stat-card fallback; second launch fell back to a release (fresh asset 404 for a
  few seconds) → public_ok now retries ~90 s; `reschedule/030` put it on Buffer for Fri 13:00
  (post 6ae4b5eb…, scheduled). Today: 12:00 031, 13:00 030, 18:00 032.

## CURRENT TASK — branch `variety-upgrade` (started Oct 29 2026)
Resume: `git switch variety-upgrade`, read this section + TODO.md, continue from "In progress".
Scope (Sam, Oct 29): (1) 4 rotating formats [how / what-if / careers / famous], 20+ sourced ideas
each; (2) low-poly animated 3D style — BRANCH ONLY until Sam approves; (3) rules for real people
and brands; (4) daily free stats → analytics/stats.json → insights.md → writer + queue order;
(5) GitHub e2e, merge 1+3+4, report. Never break daily posting; never change post times,
posts/day, voice or upload mode without asking.

### Done
- Part 3 rules (b648379): STYLE.md "Real people and brands", CLAUDE.md, lint blocks likeness/brand-mark
  prompts and unsourced quotes.
- Part 1 formats (07863d9): `format` (how/whatif/careers/famous) + `visual_style` on every script; queue
  alternates formats, priority = score × format weight; 64 new sourced-stat ideas in topics.md (22 whatif,
  21 careers, 21 famous) + the 20 ranked "how" topics; writer variety rules in CLAUDE.md.
- Part 4 learning loop (ce0fff8): stats.yml daily 11:07 UTC → analytics/stats.json (snapshots, tagged),
  insights.md + format_weights.json (min 10 per group). Writer + monthly report read them.
- e2e PASSED on ce0fff8 → **merged to main 58ec5e3** (parts 1, 3, 4 only).
- YT_API_KEY works: first stats run 15:25 UTC Oct 29 → 6 videos, 1 subscriber, all matched to scripts.
  Views so far 0–2 per Short (public; brand-new channel).
- Part 2 low-poly (branch only): pipeline/crowd.py (GPU skinning + instancing), pipeline/lowpoly.py
  (sets field/store/warehouse/city/office/stage, props, hero + crowds, 5 shot types, 540x960), render.py
  (lowpoly shots, big yellow stat, lowercase one-word captions, hard cuts), lint keeps lowpoly out of
  the daily queue (LOWPOLY_LIVE=False). Bench on GitHub 1080x1920: moderngl 123 ms (100 chars) /
  207 ms (300); three.js+SwiftShader 1262 / 3270 ms with frame readback → moderngl.
- Test scripts (draft): 030 whatif Amazon (lowpoly), 031 famous richest person (lowpoly), 032 careers
  pilots (3D-character images, 2 credits), + 005 Starbucks for "how". Local renders in
  out/compare/formats/.

- e2e of the 4 tests on GitHub (798b428) PASSED: 030 105 s, 031 71 s, 032 93 s, 005 106 s; clarity
  100/98/96/100%; zone, gate, Buffer dry run OK. Credits this task: 2 (balance 437.5).

- **Sam approved low-poly (Oct 29).** LOWPOLY_LIVE=True; 030/031/032 ready (pilots got broll1/2, 2 more
  credits → 4 this task, balance 435.5); queue alternates format AND visual style. Final e2e 206d2c5
  (real nightly path, Buffer dry run) booked Fri 12:00 031 famous (low-poly) + Fri 18:00 032 careers.
  Merged to main.

### In progress
- Nothing.

---
# Earlier: 3D upgrade (branch `3d-upgrade`)

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

- Phase 3 batch merged to main c94ca62: cash-rain 3D shot, ranked topics.md top 20 (casinos
  dropped), Whisper model cache (e2e: 82/75/56 s per Short).

- **Sam's correction (Oct 29):** "people" = 3D-rendered CGI characters (smooth, stylized-realistic,
  soft studio light, clean backgrounds), not photos. STYLE.md/CLAUDE.md/lint updated (≥2 of 4
  images; never name a creator). Redid the 4 test images for 001/002 in that style (4 credits,
  ledger now 8/100, balance 487.5 → 483.5). **Don't regenerate the 27 queued Shorts until Sam
  approves the look.**
- Photo parallax: `pipeline/depth.py` (Depth Anything V2 Small, Apache-2.0, cached per image) +
  `gl3d.parallax` (photo as a depth-displaced mesh, slow camera drift, 6 paths). `PARALLAX=off`
  turns it off. Local 001 render 132 s incl. first model load.
- out/compare/{001,002}-*-live-vs-3dchars.mp4 (left live, right 3D-character images + parallax).
- Sam also asked: code-rendered animated CC0 characters. Using Quaternius "Animated Human"
  (CC0, OpenGameArt; credited in assets/characters/CREDITS.md). `pipeline/character.py` (GLB
  reader + numpy skinning), `pipeline/scenes_chars.py` (shopper + cart, cashier + belt, warehouse
  worker). FBX→GLB via `convert-chars.yml` (Blender on GitHub) → branch 3d-assets.

- Code characters done: Quaternius GLB has 9 clips (Idle, Walk, Run, Working, Jump, Punch,
  Death + 2 tiny), 791-vertex mesh, 6 palette skins (now in assets/characters/skins/ — short
  path, Windows 260-char limit). Auto-scaled to 1.75 m. Scenes: shopper pushing a loaded cart
  down an aisle, cashier at a register with items on the belt (+ customer), warehouse worker
  crouching/lifting by pallets. 58–63 ms/frame locally (GPU); llvmpipe on GitHub estimated
  ~2x slower, still far inside the 8-min budget (only a few beats per Short would use them).
  Look: clean but obviously low-poly/game-like — less polished than the Higgsfield 3D style.
- Samples (local, out/compare/): 001-costco-code-characters.mp4 (9 s: 3 scenes),
  001-costco-higgsfield3d-vs-codechars.mp4 (left Higgsfield 3D-style + parallax, right code),
  {001,002}-*-live-vs-3dchars.mp4 (left live main, right 3D-style images + parallax).

- **Sam picked the Higgsfield 3D style (Oct 29).** Made 2 new 3D-character B-roll images for each
  of the 22 queued Shorts (44 credits; prompts in bench/broll3d_prompts.json, results in
  bench/broll3d_results.txt). All 44 URLs load; lint 0 errors. Code-character work stays in the
  repo (pipeline/character.py, scenes_chars.py) but isn't used by the renderer.
- Credits: experiments 8 + queued regeneration 44 = 52 this session; balance ~439.5.

- Final e2e 703160d PASSED (001 122 s, 002 115 s, 022 83 s; depth model OK on the runner).
  **MERGED to main c2b10b7.** Off switch for parallax: PARALLAX=off (env / repo var).

- **Posting timing fix (Oct 29, merged 5ca7c6b):** scheduled nightlies started 16:49/15:54/16:41 UTC
  (cron 10:17). Old rule "slot ≥ 60 min ahead" then skipped noon and booked 18:00 + next noon —
  nothing went late or failed, but Oct 27 got only 1 post (18:00). Sam's manual run (10:54 ET
  Oct 29) double-booked noon (005 on top of 029). Now: slot-aware scheduling (open slots only,
  max 2/day, 36 h horizon, 20 min lead), crons 01:23 UTC (evening) + 13:41 UTC (backup),
  `pipeline/slot_audit.py` + `slot-audit.yml`. Offline test bench/test_slots.py: no doubles.
- Slot fix ran: deleted Buffer post 6ae35f13… (005 at noon Oct 29), 005 back to ready (b2358a6).
  Audit after: Thu 12:00 029, Thu 18:00 004 — clean.

## In progress
- Nothing. e2e 2c9f6ec (real nightly path, Buffer dry run, 11:10 ET): saw Thu 12:00 029 + Thu 18:00 004,
  filled only Fri 12:00 (005) + Fri 18:00 (028) — tonight's evening run should do the same for real.
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
