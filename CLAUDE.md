# How They Make Money — notes for Claude (short version)

This file is loaded into EVERY chat, helper and routine turn, so it stays short (Nov 18 2026, Sam: "more usage
friendly"; it was 56 KB = ~14k tokens per turn). The full notes, every past decision and its reason are in
`docs/HISTORY.md`: grep it for a topic (`grep -n "Blender" docs/HISTORY.md`) instead of reading it whole.
When you change how something works, add one line here only if every session needs it; details go in HISTORY.md.

YouTube Shorts channel **How They Make Money** (@HowTheyMakeMoneyDaily): how famous people and companies make
their money, told as fast 3D cartoon stories with an AI voice. Owner: Sam (snasar08). Hands-off, **free only**
(never add a paid service or ask for a card; Higgsfield Pro is the only paid plan).

## Sam's rules (never break)
- Free tiers only. Claude never creates, sees or types an API key or secret: Sam adds secrets himself.
- Never change post times (12:00, 15:00, 16:30, 18:00, 20:00 ET), posts/day (5), upload mode or the voice without Sam.
- Voice: Gemini TTS **Umbriel, +1.5 semitones** (`GEMINI_PITCH_ST`). Free tier = 10 requests/day per model
  (one request voices a whole Short); add no extra voice requests.
- Kid-safe. Never invent numbers: every figure comes from a source page actually opened, listed in `sources`.
- No copied logo art, crests, real jersey designs or other creators' lines. Brand names in plain lettering are fine.
- **Check every scene** before calling a video good (Sam, Nov 18: "not frame by frame but enough to check what's
  broken and what isn't"): `python -m pipeline.scenesheet video.mp4 outdir` = start/middle/end of every shot on 1-2
  sheets + an automatic scan of every frame (blank, flash, frozen, too short/long shot, jump inside a shot). Look
  closer (`pipeline.allframes`, or stills) only at what it flags or what looks wrong. No picture repeats inside a
  Short; a new view every ~1.5-2 s; every thing a line mentions is on screen.
- Before pushing to main, send Sam the result and wait for his yes (unless he said to go ahead for that job).
- Team: 3 Sonnet helpers do the work in parallel; the lead coordinates and checks.

## How it runs
- `content/scripts/NNN-slug.json` = the queue (`ready` / `delivered` / `draft` / `needs_fix`).
- `.github/workflows/nightly.yml` (GitHub Actions, public repo = free): ~3 AM, ~9:41 AM, ~2:23 PM ET runs fill only
  OPEN slots in the next 36 h (`publish.taken_slots`), so extra runs never double-post. Jobs: plan -> voice (Gemini,
  one machine per Short) -> toon frames on 20 machines -> make (captions, music, checks, eyes, Buffer).
- Posting: Buffer GraphQL (`BUFFER_API_KEY` secret; token regenerated Nov 18; it expires and Buffer
  emails a week before: Sam makes a new one and updates the secret), video hosted on a GitHub Release. `slot-audit` branch = report of upcoming posts; `slot-fix` = delete extras.
  `remake` branch = re-render already scheduled Shorts in the current look with their recorded voice, same slots
  (`content/remake.txt`: line 1 ids, line 2 the run id whose voice artifacts to reuse; artifacts live 2 days).
- Look (Nov 17): **every format** renders in the real-3D cel-shaded "afterhour" look (Remotion + three.js,
  `toon/src/videos/afterhour/`: char.ts people, sets.ts 21 sets, things3d.ts 60 objects, cards.ts text signs,
  acts/ mini-scenes gated by acts/approved.json). `pipeline/toon.ah_shots` turns each spoken sentence into a shot.
  A script's per-scene `toon` list (one dict per sentence) picks place/things/card/brand/mood/view; see
  content/WRITER_GUIDE.md. `"look": "toon"` opts out. Reference style: @afterhourtheories (study notes in HISTORY.md).
- **Check scenes as text first** (cheap): `python -m pipeline.ah_table content/scripts/NNN.json` prints what every
  sentence shows; `python -m pipeline.scene_check` scores it. Render stills only for what still looks wrong:
  `node scripts/stills.mjs AhShort <out> <frames> 0.5 <props.json>` (props from `python -m pipeline.toon plan <script> <props.json>`).
- Full test render: push branch `toon-test` (ids in `toon/test_id.txt`; push as `HEAD:refs/heads/toon-test`, a tag
  has the same name); MP4s land on release `toon-test`. New 3D objects: branch `things-test/<date>`.
- Checks after every render: clarity (Whisper), audio, quality gate (`run.gate`), **eyes** (`pipeline/eyes.py`,
  free Gemini looks at every frame, holds bad Shorts as `needs_fix`).
- Analytics: `stats.yml` daily -> analytics/insights.md, health.md, retention.md. "How are the Shorts doing" ->
  `python -m pipeline.now`.
- Formats now: `famous` (most; athletes and big names, real dated earnings), `story` (history / plan), some `whatif`.
  `how` and `careers` are paused (drafts). What works: a surprising number in line one, number titles, person stories.

## Weekly scripts
Saturday cloud routines (4 parts) follow `content/ROUTINE.md` and `content/WRITER_GUIDE.md` (read those, not this
history). The mix each week comes from `analytics/weekly_plan.md` (`pipeline/weekly_mix.py`: focus on the lane that goes viral,
one experiment lane, never drop a lane; bets logged in analytics/experiments.json). Up to 75 ready scripts; quality gate: sources opened, idea score 85+, lint 0 errors, story score 80+,
scene check passing, one `toon` dict per sentence.
Any object or set (place) a script needs that is not built yet gets BUILT (Sam, Nov 18), never worked around;
what a part can't finish goes into content/BUILD_QUEUE.md, which the next part builds first.

## Usage (Sam's plan limits)
Fresh chat per chunk of work with a handoff memory; helpers on Sonnet do the reading and return short reports;
text tables before images; small contact sheets; batch tool calls; background long jobs and wait for the
notification. User skill `usage-saver` has the full list.
