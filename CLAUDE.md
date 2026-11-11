# How They Make Money — notes for Claude

YouTube Shorts channel **How They Make Money** (@HowTheyMakeMoneyDaily). Each Short explains how
one company or industry makes its money, using researched figures, Higgsfield images, animated
charts, an AI voice and word-highlighted captions. Owner: Sam (snasar08). He wants it hands-off
and **free beyond his Higgsfield Pro plan** — never add a paid service or ask for a card.

## How it runs
- `content/scripts/NNN-slug.json` — the queue. `status: "ready"` → waiting; `"delivered"` → done.
- `.github/workflows/nightly.yml` — GitHub Actions (free tier, no GPU). **Slot-aware** (Oct 29):
  runs ~3 AM ET (fills today's 12:00/15:00/18:00 slots; Sam, Nov 3: 3 posts/day) + ~9:41 AM ET backup + a third run (cron 19:23 UTC, added Nov 9 after GitHub dropped one run and failed to start the other; it arrives in the evening and fills tomorrow early); each run renders only for OPEN slots
  in the next 36 h (`publish.taken_slots` from the delivered records; never a taken slot, max
  `MAX_PER_DAY`=3/day, a passed slot rolls to the next free one), so late/backup/manual runs
  never double-post. GitHub starts scheduled runs late (Oct 26–28: 5.5–6.5 h). Check Buffer:
  push branch `slot-audit` (report) / `slot-fix` (delete extras, scripts back to ready). Minutes: the repo is public, so standard GitHub runners are free and unlimited (6 h max per job, ~20 jobs at once); a run takes ~5–8 minutes.
- `pipeline/render.py` draws every frame with Pillow and pipes to ffmpeg (1080x1920, 30 fps).
- **Channel voice since Nov 3: Qwen3-TTS clone** (Apache-2.0) of `assets/voice/narrator.wav` (one designed narrator;
  Sam said every Kokoro/Chatterbox read sounded robotic; picked on measured UTMOS 4.50 / same-voice 0.86 / pitch
  movement 5.3 st vs Kokoro 4.43 / 0.81 / 3.6, see assets/voice/README.md). Nightly: `plan` job decides tonight's
  Shorts (`run.py --plan-ids`), one `voice` job per Short runs `pipeline/voice_prepass.py` in a Python 3.12 venv
  (~5–8 min each, parallel) into `.cache/voice` (wav + Whisper word timings), and `make` renders with
  VOICE_ENGINE=qwen. A Short uses it only if EVERY line is cached (`tts.use_engine_for`), else Kokoro am_puck below.
  Repo variable VOICE_ENGINE=kokoro switches back.
- `pipeline/tts.py` — voice (Kokoro = fallback since Nov 3). Default Kokoro-82M **`am_puck` at 1.2** (Oct 30: Sam disliked am_fenrir, then af_bella — wants a MALE voice, speed 1.2 is right. am_puck ties for Kokoro's top male grade, C+, and moves most in pitch; Sam also rejected am_michael on day 1; bigger open models like Fish Audio S2 Pro are non-commercial and ~30x slower than real time without a GPU). One Kokoro call per sentence, questions 7% slower + 0.5 s beat. Audio is loudness-normalized to −14 LUFS (YouTube's target). CPU. Optional Ming-3.0-tts.
- **Second voice (Nov 1, optional):** Sam's main voice stays am_puck 1.2 (his favorite). For back-and-forth
  lines, start a sentence with `B:` in a scene's narration and it's read by `KOKORO_VOICE2` = `am_puck,am_michael`
  (a blend; Sam's pick "#5"). Tags are stripped from captions/clarity. Use sparingly (a viewer-style question,
  then the narrator answers); most Shorts need none.
- `pipeline/music.py` — background music synthesized in numpy (original, nothing to license),
  seeded per script, ducked under the voice. `MUSIC_GAIN` env var (default 0.12, 0 = off).
  Sam disliked the whoosh sound on cuts, so it was removed — don't add cut SFX back.
- End-of-video CTA (`CTA_LINE` in `render.py`): "Comment which brand we should do next, and
  subscribe." after the last scene's answer (Sam removed the mid-video like/subscribe ask — it
  broke the flow). Comment bubble + SUBSCRIBE→SUBSCRIBED pop in on their words. Then the script's
  `loop` line ("So next time you … ask yourself:") which leads straight back into the opening
  question, so the replay is seamless. No "Follow for more". Keep prompts kid-safe.
- First frame shows the hook overlay fully (no pop-in); thin progress bar along the top edge.
- Quality gate (`gate()` in `run.py`): a Short is NOT posted if clarity < 90%, a breath run
  > 8 s, clipping, untimed captions, failed images, or a chart in the caption zone. It's marked
  `status: "needs_fix"` with reasons and the next ready script takes its slot.
- Posting order: `score` (0–100 virality estimate) — nightly posts the highest-scoring ready
  Short first, then by id.
- **Learning loop (Oct 29):** `stats.yml` runs daily (~7 AM ET): `pipeline/stats.py` appends public
  views/likes/comments per Short (YouTube Data API, read-only key secret `YT_API_KEY`) to
  `analytics/stats.json`, tagged with format, topic, visual style, theme, hook style, title style,
  length and post time; `pipeline/insights.py` writes `analytics/insights.md` (best vs worst, views
  at 48 h / 7 d, like and comment rates by group; < 10 Shorts per group = early signal only) and
  `analytics/format_weights.json` (0.7–1.4, only once a format has ≥ 10 Shorts), which the queue
  uses: priority = score × format weight, formats alternate post to post. `analytics/status.json`
  says whether the key works. **Health check (Nov 8):** `pipeline/health.py` runs after stats and writes `analytics/health.md` (each Short from the last 7 days: views, views/h, likes, comments, thumbnail status). Nightly saves each Short's frame 0 to `analytics/covers/<id>.jpg`; health downloads YouTube's public thumbnail and marks it MISSING, "our cover" (fingerprint match >= 90%) or "other frame", with a ::warning for problems. **Retention (Nov 9):** `pipeline/retention.py` (after health) reads the YouTube Analytics API with the owner sign-in (secrets `YTA_CLIENT_ID`/`YTA_CLIENT_SECRET`/`YTA_REFRESH_TOKEN`, made once with `pipeline/analytics_auth.py`; channel account = nightlightbeanie, read-only; Google app "Claude" in project My First Project, published) and writes `analytics/retention.md`: average % watched, share still watching at 25/50/75/end, and the steepest drop in seconds, for Shorts from the last 14 days. Skips quietly without the secrets. First read (Nov 9): every Short loses the most viewers at ~4–5 s (right after the opening line); the editorial PlayStation Short held 83% average vs 40–58% for chart Shorts. To check analytics, read `analytics/health.md` (or run `python -m pipeline.health` locally after pulling). Never change post times, posts/day, voice or upload mode for this.
- `pipeline/audio_check.py` runs after every render: one-breath runs (>6 s), syllables/s per
  scene, swallowed words, silent CTA beat, clipping. Prints `::warning`s; `AUDIO_CHECK=strict`
  blocks delivery.
- `pipeline/clarity_check.py` runs Whisper (`base.en`, CPU) on the final mix and compares it
  with the script: clarity % plus each word it couldn't hear (min 95%, `CLARITY_MIN`). Sam said
  some words weren't clear. Found and fixed: Kokoro swallowed weak first syllables ("Across" →
  "cross"; fixed by a leading "..." in `tts.kokoro`) and music masked line openings (duck now
  starts 0.2 s early). If a line keeps failing, reword it — don't slow the voice.
- Hooks: every Short opens with a question in the first line + on-screen overlay, and the title
  is a question (Sam: hooks matter most). Aim for topics/hooks that score ~90/100 for virality.
- Captions: numbers always pop (highlight color, 18% bigger, commas kept); the spoken word gets a
  small punch. Music mood per format (`music.MOODS`: whatif faster/bouncy, famous steady, careers
  warm, how lo-fi). Buffer delivery retries the public-URL check ~90 s; if a Short still falls
  back to a release, push branch `reschedule/<id>` to put it on Buffer.
- **Visual FX (Oct 30, `pipeline/fx.py`, `FX=off` disables):** stats count up from 0, coin/sparkle
  burst on billion+ numbers, big title punch-in over the first 0.75 s of low-poly Shorts, zoom-blur
  into each new low-poly scene, slow drift on 2D shots, light grade (contrast, vignette, static grain —
  moving grain tripled file size), and small Pillow-drawn icons (coin/truck/plane/house/box) above
  matching caption words.
- Also (Oct 30): frame 0 shows the full hook title (YouTube's usual cover frame); the last 0.35 s
  fades into frame 0 so the replay loops seamlessly; Kokoro sentences over 14 words are split at the
  comma/conjunction nearest the middle (`tts.breath_split`) so no line runs out of breath; lint warns
  on sentences > 18 words; the gate blocks a Short with > 2 blank (flat-color) frames.
- Shots change every ~1.4 s (max 2 s, Sam wants something new at least every 2 s).
- **3D charts (since Oct 29 2026):** `pipeline/gl3d.py` (moderngl engine; Mesa llvmpipe via EGL on
  GitHub, ~0.1 s/frame) + `pipeline/scene3d.py` (bars from a floor, coin/cash stacks with a counting
  number, pie slice-out, globe, extruded text) + a 3D card swing on cuts. All GL calls go through
  `run3d` (one GL thread). Off switch: repo variable `RENDER_3D=off` → old 2D charts; automatic
  2D fallback if GL fails. A Short renders in ~1.5–2.5 min on the runner. `globe` visual type:
  `{"type": "globe", "points": [{"lat": .., "lon": ..}], "label": ".."}` (real coordinates only).
  Test: push branch `3d-e2e` (real voice, checks, gate, Buffer dry run; results on
  `3d-e2e-results`). Benchmarks: `bench3d.yml` on `3d-upgrade`.
- **Low-poly style (approved by Sam Oct 29 2026, live):** visual type
  `lowpoly` (`pipeline/lowpoly.py`: code-built sets field/store/warehouse/city/office/stage, props,
  people in the pack's clothed CC0 textures (6 skin tones; Nov 1, Sam wanted them to look like people), eased camera moves with slight handheld sway, Lanczos upscale + light sharpen, a hero + instanced crowds of up to ~400 via `pipeline/crowd.py` GPU skinning, 5 camera
  shots cut every beat, 540x960 upscaled) with big yellow outlined stats and lowercase one-word
  yellow captions. CC0 characters: `assets/characters/CREDITS.md`. Meant for `whatif` + `famous`. **Famous worlds (Nov 1):** sets `court` (basketball), `pitch` (soccer night stadium), `studio` (music), `gaming` (streamer desk), `launch` (rockets); props `ball` (dribbled beside the hero), `mic`, `headset`; script fields `name_card` ("Cristiano Ronaldo") + `name_sub` ("soccer player") show a yellow name banner ~0.8–4.2 s. **Hero looks (Nov 10, Sam asked twice):** a famous person is drawn as a recognisable cartoon WITHOUT being a copy: script-level `hero` = `{skin, hair (short/buzz/bald/quiff/long/bangs/ponytail/bun/afro/curly/mohawk), hair_color, beard (none/stubble/full/goatee/mustache), outfit (tee/kit/suit/hoodie/dress), shirt, pants, socks, shoes, extras (glasses/cap/headband), height}` (`pipeline/lp_hero.py`; hex colors). Plain colors only: never a logo, crest, sponsor, number or real jersey design, never a photoreal face, no fake quotes; the name banner still says who it is. The same hero rides through every scene (render.py copies it into each low-poly visual); what-if Shorts with no `hero` get a stable everyman from the slug (`lp_hero.auto`). Why the old "never their hair/outfit" rule changed: Sam's original idea was a stylised look-alike, and a blocky cartoon with a hairstyle and plain-color clothes is neither a likeness nor synthetic media of a real person.
  **Nov 10 rebuild (Sam: "the low poly has no background", "the editing sucks"):** every set has a real sky (gradient, sun/moon, clouds, stars), far scenery and full dressing (stadium stands all round, floodlights, shop fronts, lamps, trees, walls, screens); shots always frame the hero against the set (`lowpoly.pick_shot`: hero / front / low / close / orbit / side / wide / back / crane; the old top-down shot is gone; no close-up while a big number is up); a punch-in lands every cut; falls play once; the cover shows name banner + title + hero (the banner used to hide the title). In Blender the people are welded, smooth-shaded and subdivided (`BL_SMOOTH`, default `180s1`), hero extras ride on bones in both renderers, colored screens glow without washing out, indoor sets use weaker light (`key_e`/`amb_e`). Quick check without voice: `python -m pipeline.lp_look <script> out.jpg [plan_dir] [beats]` (local GL sheet; with a plan_dir it records those frames for Blender), `python -m pipeline.preview` works for low-poly too. With the look fixed, `run.LOWPOLY_GAP` = 2 (at most one low-poly Short in every three posts) and the weekly batch may write `lowpoly` for up to 1 script in 3. Popular Shorts use hand-made smooth 3D (Blender + paid add-ons or paid AI video); we match the smooth figures, lighting, depth of field and camera work for free, not hand animation or realistic faces. **People pack (Nov 11, Sam said to download the better free models):** the low-poly people are now Quaternius "Ultimate Modular Men/Women" (CC0, `assets/characters/people/`, credits in `assets/characters/CREDITS.md`): 8 men + 6 women with modelled faces, hair, beards and clothes, one shared 62-bone rig and 24 clips, four swappable parts (head / body / legs / feet), every surface a named flat-color material. `pipeline/people.py` (GL) and `pipeline/blender_lp.py` build a look from a string `P:head,body,legs,feet;Material=hex;slot.Material=-` (`lp_hero.look_name`). `lp_hero.look(hero)` maps the same script `hero` fields to parts (hair -> which head; bald/buzz hide the hair; a full beard with short/long/curly hair uses the bearded head; outfit -> body and legs; all colors recolored), `lp_hero.accessories` adds only what the heads lack (beards on other heads, buzz cut, glasses, cap, headband, long hair for women), `lp_hero.crowd_looks()` is the 16-person crowd mix. A full beard on a bald or buzz-cut head uses the bearded head with only the beard part of its hair piece kept (`bRRGGBB` color value, `lp_hero.BEARD_CUT`); stubble is not drawn (blocks read as a neck brace); the script `hero` now wins over an old per-scene `kit`. Blender gotcha: the importer leaves an action playing on each armature, so a render re-poses it; `blender_lp.model` clears animation data and never trusts a pose across frames. Clip names are the pack's (`lowpoly.CLIP`: cheer = wave, work = interact, idle = idle_neutral). Blender names actions `<Clip>_CharacterArmature` (`blender_lp._clip_key`). Ruled out: Quaternius Universal Base Characters (free version is underwear-only bodies), Kenney Mini Characters (blockier). Families (first letter of the model name; parts only mix inside one, the exports have different bind poses): `m_` men, `v_` women (casual, formal dress, suit, worker: the author's own glTF files from his Google Drive, repacked as GLB), `w_` two more women from poly.pizza (adventurer, punk). More models (witch, sci-fi, soldier, medieval, king...) are in the same Drive folders if a script needs them. The old single figure is only used by `pipeline/scenes_chars.py`. Renderer choice (GitHub, 1080x1920):
  moderngl 123/207 ms per frame for 100/300 characters vs three.js+SwiftShader 1262/3270 ms.
- **Blender stage (Nov 3, nightly):** low-poly Shorts are re-rendered in Cycles: `lpplan` records every 3D frame
  (LP_RECORD; `lowpoly._record`), 20 `blender` machines render `pipeline/blender_lp.py` shards at 540x960 with
  Poly Haven lighting (`pipeline/polyhaven.py`), `make` uses them only if ALL frames of a Short arrived (LP_PLATES),
  else the GL look. Skipped when the run starts after 8 AM ET. ON since Nov 3 after fixing kit colors, exposure and blocked shots (Standard view, rim light, depth of field on close shots). Repo variable BLENDER=off disables it.
  Test the whole nightly file as a dry run on script 040: push branch `nightly-test`.
- **Editorial style (Nov 3):** `visual_style: "editorial"` (`pipeline/editorial.py`): dark backstory page, HTMM mark + `tag`, per-scene `layout` cards (real people, free-license Wikimedia Commons photos only via `pipeline/photos.py`: CC0/PD/CC BY/CC BY-SA, credits auto-added to the description) / stat / headline / timeline. Use the REELS.md Reel 5 arc; ~1 in 3 should be an "almost went bankrupt" story (Sam's favorite, REELS.md). Add 4–8 more Commons photos in the script's `photos` list ([{photo, caption}]) so a new picture shows every other beat. Example: 043-how-prime. No Higgsfield images needed.
- **Premium look (Nov 9):** 3D charts get a stage light (`spot` in `scene3d.look_for`, applied in the gl3d post pass: bright pool on the chart, darker corners), low depth of field so labels stay sharp, bigger value/label text, deep plum (not white) secondary bars on bold_bright, pies kept clear of their label, cash that falls below the number. Word cards (`render.shot_wordcard`, used when a Short runs out of pictures) and plain text scenes share `_card_bg` (drifting soft lights + vignette); the key word (number, else longest word) is in the accent color with a wipe-in underline and soft shadow. Editorial Shorts open on a 0.45 s title cover (`_cover_text` over the settled page; long titles use 3 lines). Caption icons never draw over charts or word cards. Preview locally without voice: `python -m pipeline.preview content/scripts/NNN.json out.png` (3D works on Sam's PC).
- **Commons photos in chart Shorts (Nov 9, Sam):** a `charts3d` script may add `"photos": [{"photo": "File:...", "caption": "..."}]` (same format as editorial). The renderer mixes them in with the 4 Higgsfield images (keys `brollpN`), so fewer shots fall back to word cards; credits go in the description automatically. Only use photos that look as good as the Higgsfield renders: real places, events, landmarks, people (stadiums, headquarters, founders), at least ~1500 px, no visible logos or brand marks. Tested Nov 9: Commons product snapshots (ink cartridges, printers) are amateur, low-res and branded, so skip those and leave `photos` out rather than add weak ones.
- Chart scenes also get code-drawn "alt" shots (ticker / waffle / columns) on a drifting grid.
- **Posting via Buffer (default since Oct 26 2026):** `UPLOAD_MODE` defaults to `buffer` in
  `nightly.yml`. Each Short is attached to a GitHub Release (the public video URL) and scheduled
  on the YouTube channel through Buffer's GraphQL API (`createPost`, `customScheduled`, `dueAt` =
  its POST_SLOTS time, `metadata.youtube` title/categoryId 27/isAiGenerated; no tags field, so
  tags go in as hashtags). Channel "How They Make Money" = Buffer id `6adeccfa2f1f5ed648d31e71`
  (looked up through the API each run). **Needs the repo to be public** — Buffer fetches the
  video at publish time and private release assets aren't reachable. Any Buffer failure falls
  back to the release with a `::warning::`. `POST_START` (2026-10-27): nightly does nothing before.
  Free plan: 1 key, 100 req/15 min, 250/day, 3,000/30 days; a run uses ~4 requests per Short.
- `.github/workflows/ci-test.yml` (push to `ci-test` or Run workflow): renders 001 with the real
  voice + audio check, and schedules → confirms → deletes one private test post on Buffer.
  Results land on the `ci-test-results` branch (`buffer-test.json`, `out-render.log`).
- Rendering frames runs in a thread pool (`RENDER_THREADS`, default min(4, cores)); same output.
- `pipeline/publish.py` — `UPLOAD_MODE` repo variable:
  - `release` (default): MP4 attached to a GitHub Release with title/description to paste. Sam
    uploads from the YouTube app. Required until YouTube approves the API audit, because uploads
    from unaudited API projects are locked to private.
  - `youtube`: direct scheduled upload via the YouTube Data API (`publishAt`, private until then,
    `containsSyntheticMedia: true`). Needs `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`
    secrets (see `pipeline/youtube_auth.py`).

## Status / next steps (handoff, Oct 25 2026)
- Sam watched the first test (001-costco). Feedback: opening is great; **voice too slow and he
  dislikes am_michael**; needed more shot changes. Done since: shot change every ~2 s (`make_beats`),
  key-number pop-ups over B-roll, chart punch-ins, flash + whoosh on cuts, Kokoro speed 1.2, captions
  from Kokoro's real word timestamps (`align_words`). Not yet rendered with real voice — test it.
- **Voice:** done — Sam picked `am_fenrir` at 1.25 (now the default in code and workflow). To
  revisit, run `python -m pipeline.voice_samples out/voice-samples.mp4`. `.github/workflows/voice-test.yml`
  also tries Ming-3.0 on CPU (experimental; upstream only tested on GPUs).
- **B-roll:** every script has `images.broll1/broll2` prompts (from `content/broll_prompts.json`).
  001–014 all have URLs (Oct 25 2026). New scripts: generate with Higgsfield (settings below), 4 at a time.
- Posting: `UPLOAD_MODE=release` until the YouTube API audit is approved. Free connectors checked
  and ruled out for 2/day: Make free (100 MB/month transfer), Zapier free (no webhooks),
  Upload-Post free (10 posts/month). Modal was dropped (wanted a card).

## First-time setup (run from Claude Code on Sam's computer)
1. `pip install -r requirements.txt` (Python 3.11 — Kokoro does not support 3.13+), plus ffmpeg
   and espeak-ng.
2. Render one test: `python -m pipeline.run --id 001 --dry` → `out/001-costco.mp4`. Watch it,
   check the voice, captions and images. `python -m pipeline.preview content/scripts/001-costco.json p.png`
   gives a quick still per scene without audio.
3. Optional voice upgrade: clone https://github.com/inclusionAI/Ming-3.0-tts next to the repo,
   follow its README, check the `_ming()` call in `pipeline/tts.py` matches its current API, and
   time a render on CPU. Only switch the repo variable `VOICE_ENGINE=ming` if one Short renders in
   under ~6 minutes on a 2-core CPU; otherwise keep Kokoro (Actions minutes are the budget).
   The workflow would also need a step that clones the Ming repo and installs its requirements.
4. In GitHub: Actions → "Make Shorts" → Run workflow with `dry_run` checked, download the
   `test-shorts` artifact and confirm it works on GitHub's machines.
5. Ask Sam to Watch the repo (Watch → Custom → Releases) so release notifications reach his phone.

## Weekly script batch (cloud routines, Saturdays — two parts so one session never runs too long)
Posting uses 21 Shorts/week (3/day since Nov 3). Goal: build a buffer, capped so credits aren't wasted.
1. Count `ready` scripts. **If 45 or more are ready, write nothing** (still do step 8). Otherwise
   write `min(15, 45 - ready)` new scripts in this part (part 1 ~12:30 ET, part 2 ~4:30 PM ET,
   so up to 30/week).
   First, fix any `status: "needs_fix"` scripts (reasons are in `needs_fix`; e.g. reword lines
   with unclear words, shorten long sentences), then set them back to `ready` and drop the field.
   If `content/performance.json` exists, read it: lean toward the topics and hook styles of the
   most-viewed Shorts and away from the least-viewed.
   **Score gate (Sam wants ~90/100 virality):** give every idea a `score` 0–100 (would a
   13–18-year-old stop scrolling? topic they use/love × question hook × surprising number) and
   only write ideas scoring **85+**. Gaming, phones, apps teens use, food/snacks, sneakers,
   sports, YouTubers/streamers rank high; hotels, B2B, software for offices rank low. Store the
   number in the script's `score` field (the nightly run posts the highest first).
   Every script also needs: a question as the first line, the overlay and the title, and a
   `loop` field — one short line spoken last ("So next time you …, ask yourself:") that leads
   back into the opening question. The last scene must not say "Follow for more" (the CTA is
   added automatically).
   **Formats (Sam, Oct 29 2026) — rotate 4:** `format` = `how` (how X makes money), `whatif`
   (absurd scenario on ONE real stat, e.g. "What if one person delivered every Amazon package in
   a day?"), `careers` (how pilots/streamers/NBA players make money), `famous` (a famous person's
   real, dated net worth/earnings). Ideas + sources: `content/topics.md` "Formats". Mix per batch:
   start ~25% each, then follow `analytics/insights.md` (more of what wins, fewer losers) but keep
   ~20% experimental and NEVER drop a format entirely without asking Sam. Variety: no two Shorts
   in a row (by posting order) share format + theme + hook style; vary length (25–55 s; stories may run longer, Nov 1), hook
   style and title style. **Title test (Oct 30):** rotate `title_style` evenly (question / number /
   statement / whatif) until each has ≥ 10 posted Shorts in `analytics/insights.md`; after that,
   ~60% the winning style, the rest spread over the others so the test keeps running. Every script sets `format`, `visual_style` (`charts3d` for most; `lowpoly` for at most 1 in 3 (Nov 10; famous scripts set `hero`, see 051/061/073) — see existing 030/031 for the lowpoly scene JSON), `hook_style` (question / number / whatif / challenge / surprise),
   `title_style` (question / number / statement / whatif). Real people: STYLE.md
   "Real people and brands".
   **Before writing, read `analytics/insights.md`** (updated by stats.yml before Saturday).
2. Read `content/STYLE.md`, `content/angles.md`, a few existing scripts, and the project skill
   `.claude/skills/shorts-craft/SKILL.md` (hook variants, retention, loop guides; project rules win), and
   **`content/REELS.md`** (what Sam's favorite reels do: fragments, a flip every 3–5 s, time-jumps,
   on-screen counter `hud`, this-or-that comment question via `cta` + `cta_question`; Reel 5 = the founder → problem → nobody believed → money flip → famous backers → dated scoreboard arc for `how`/`famous`). Topics: household-name
   companies, plus jobs/careers people are curious about (YouTubers, streamers, pilots, NBA
   players, real estate agents…). Pick from `content/topics.md` or add new ones. A repeat company
   needs a clearly different angle, new figures, new hook, new B-roll and a different structure —
   never a near-copy (YouTube demonetizes repetitive content). Log each angle in `angles.md`.
   Move used topics to the Used list.
3. Research each with web search. Use only figures from sources you opened (filings first).
   Put every source in `sources` and in the description (see existing scripts' format).
   **Opening pages from the cloud routine:** its sandbox can search but can't open pages, so use
   the GitHub fetcher (`pipeline/fetch_sources.py`, `.github/workflows/fetch-sources.yml`):
   ```bash
   B=research/$(date -u +%Y%m%d-%H%M)        # if that push is refused, use claude/research-<same>
   git switch -c "$B" origin/main
   mkdir -p research && printf '%s\n' URL1 URL2 ... > research/requests.txt   # up to ~60 URLs
   git add research/requests.txt && git commit -m "Source request" && git push -u origin "$B"
   # wait ~2 min, then poll until research/index.json appears (it lists ok/error per URL)
   for i in $(seq 1 20); do git pull -q origin "$B"; [ -f research/index.json ] && break; sleep 30; done
   ```
   Read `research/pages/*.txt` (first lines give URL/FINAL_URL). Need more URLs? Append to
   requests.txt, push again, poll again (already-fetched URLs are skipped). Then `git switch main`
   and write scripts there — never merge the research branch into main.
   What works from GitHub's machines (tested Oct 26 2026): company investor-relations sites and
   their PDF results/10-K copies (e.g. investor.apple.com, investors.coca-colacompany.com,
   stock.walmart.com, nintendo.co.jp/ir), Wikipedia, `api.bls.gov` (BLS data API). Blocked (403):
   **sec.gov and data.sec.gov**, bls.gov web pages, some IR sites (ir.dominos.com); nasdaq.com
   times out. So use the company's own IR press release / annual report PDF instead of EDGAR.
4. Next ids continue from the highest existing `NNN`. Same JSON shape as existing scripts.
5. Images: Higgsfield connector, `generate_image_batch`, model `gpt_image_2_5`,
   `aspect_ratio: "9:16"`, `quality: "medium"`, `resolution: "2k"`, `use_unlim: false`
   (1 credit each). Pro plan allows only **4 images at a time** — submit groups of 4, wait with
   `jobs_wait`, then the next 4. Put each `result_url` into `images.hook.url`, `images.mid.url`, `images.broll1.url`, `images.broll2.url` (4 images per Short).
   Check `balance` first; if under 60 credits, write the scripts but stop before images and leave
   a note in the commit message. No real people or logos in prompts. At least 2 of the 4 images show
   made-up people as 3D-rendered CGI characters (smooth, stylized-realistic, soft studio light,
   clean backgrounds) — see STYLE.md "3D characters"; never name a creator in a prompt.
   (Pending Sam's approval of the look, Oct 29: don't regenerate already-queued Shorts.)
6. Validate every file parses as JSON and has 5–6 scenes, and run `python -m pipeline.lint <files>`
   (fix every error, most warnings). Follow `.claude/skills/punchy-story/SKILL.md` (Sam, Nov 4: stories
   felt bland) and run `python -m pipeline.story_score <files>`: rewrite anything under 80. It checks
   structure only, and doesn't replace the idea `score` above. Then commit and push to `main`.
7. Never leave a script with `status: "ready"` and missing image URLs — set `status: "draft"` if
   images couldn't be made, so the nightly run skips it.
8. On the first Saturday of the month (part 1 only), open a GitHub issue "Monthly report YYYY-MM":
   Shorts delivered last month (count `delivered` with dates), queue size, Higgsfield credits left,
   failures / `::warning` audio or Buffer issues from the last month's Actions runs, a short
   **insights summary** (top/bottom 3 Shorts, which formats/hooks/titles/lengths lead, and whether
   each is a finding or an early signal — copy from `analytics/insights.md`), and anything that
   needs Sam.

## Rules
- **No picture repeats within a Short (Sam, Nov 3).** Editorial Shorts take each photo once (`editorial.pictures` + photo slots in `render.plan`); give them 8–12+ Commons photos. Image-style (`charts3d`) Shorts still reuse their 4 Higgsfield images — more images per Short costs credits, ask Sam before changing.
- Never invent numbers. Never use real logos or people in image prompts.
- Real people/brands (STYLE.md "Real people and brands"): names OK in voiceover/captions/titles
  with sourced facts; never a character modeled on a real person's look; no fake quotes; hint
  with props/setting; no logos, uniforms or brand marks; don't copy other creators.
- Don't change the posting schedule, upload mode or voice without Sam asking.
- Keep everything inside the free tiers.

## Repeat check (Nov 4)
Run annotations list shots that still repeat. A photo Short needs about one picture per shot, or it can't meet Sam's no-repeat rule.
