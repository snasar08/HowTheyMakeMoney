# How They Make Money — notes for Claude

YouTube Shorts channel **How They Make Money** (@HowTheyMakeMoneyDaily). Each Short explains how
one company or industry makes its money, using researched figures, Higgsfield images, animated
charts, an AI voice and word-highlighted captions. Owner: Sam (snasar08). He wants it hands-off
and **free beyond his Higgsfield Pro plan** — never add a paid service or ask for a card.

## How it runs
- `content/scripts/NNN-slug.json` — the queue. `status: "ready"` → waiting; `"delivered"` → done.
- `.github/workflows/nightly.yml` — GitHub Actions (free tier, no GPU). **Slot-aware** (Oct 29):
  runs ~3 AM ET (fills today's 12:00/15:00/16:30/18:00/20:00 slots; Sam, Nov 12: **5 posts/day**, was 3 since Nov 3) + ~9:41 AM ET backup + a third run (cron 19:23 UTC, added Nov 9 after GitHub dropped one run and failed to start the other; it arrives in the evening and fills tomorrow early); each run renders only for OPEN slots
  in the next 36 h (`publish.taken_slots` from the delivered records; never a taken slot, max
  `MAX_PER_DAY`=5/day, a passed slot rolls to the next free one), so late/backup/manual runs
  never double-post. GitHub starts scheduled runs late (Oct 26–28: 5.5–6.5 h). Check Buffer:
  push branch `slot-audit` (report) / `slot-fix` (delete extras, scripts back to ready). Minutes: the repo is public, so standard GitHub runners are free and unlimited (6 h max per job, ~20 jobs at once); a run takes ~5–8 minutes.
- `pipeline/render.py` draws every frame with Pillow and pipes to ffmpeg (1080x1920, 30 fps).
- **Afterhour look (Nov 16, LIVE for every `format: "story"` Short; Sam: "mimic this exact style", ref @afterhourtheories
  Jensen Short studied frame by frame):** real-3D cel-shaded world in `toon/src/videos/afterhour/` (composition
  `AhShort`): `char.ts` white round-headed characters (10 expressions, poses, crown/hardhat+name/fedora/cap/hair,
  shades, chest text/number), `sets.ts` 21 dense sets (throne office diner lab stall field ring track graveyard
  boardroom street beach court pitch stage space garage classroom bathroom mansion showroom), `things3d.ts` 60 3D
  objects, `cards.ts` text pictures. `pipeline/toon.ah_shots` turns the normal per-sentence plan into shots (a new
  picture per sentence with a smooth camera push; cut when the line changes, ~2-3 s; Sam, Nov 16: re-angling one moment every ~1.3 s with blur cuts was "a headache"), `frames.mjs` renders AhShort when the plan carries `ah`. Story Shorts get
  it by default; any script can opt in with `"look": "afterhour"` or out with `"look": "toon"`; env TOON_LOOK=toon
  switches it off everywhere. Captions are his small white phrases; clean hard cuts (whip blur off, WHIPS=on brings it back). Test: toon-test branch.
  Local stills: `node scripts/stills.mjs AhShort <out> <frames> 0.5 <props.json>` (test modes: {"ah":{"test":"chars"|"sets"|"things"}}).
- **Toon look (Nov 15, LIVE since the Nov 15 evening merge; repo variable LOOK=blender switches back):** Sam: the Mr omi reference Shorts look "infinitely better";
  build off his MIT repo (mromidev/claude-animated-shorts). `toon/` = Remotion + three.js project: `src/videos/bridge`
  his source as-is, `src/videos/htmm` ours (plan-driven via input props `{plan}`: one shot per script scene, our hero
  outfit from the script `hero`, crowd, day -> golden -> night light arc, drawn props, and the **scene library**:
  `beat` = drive / queue / phone / clock / money / walk, from `visual.beat` or picked from the line's words by
  `pipeline/toon.beats_for`). `pipeline/toon.py plan` makes the plan from a script + the recorded LP plan, `plates`
  maps rendered frames to LP_PLATES names so render.py adds captions/numbers/music on top. Test: push branch
  `toon-test` (full Short on 12 machines, MP4 on release `toon-test`) or `toon-stills` (stills from toon/stills.txt).
  Software GL needs `gl=swangle`; the React EffectComposer draws nothing there, so Bridge.tsx uses postprocessing's
  own composer. Local: portable Node in the scratchpad, `GL=angle`.
- **Gemini TTS (Nov 13, night; switches on by itself when the `GEMINI_API_KEY` secret exists).** Sam: "this voice
  sucks", wanted a real search and a new angle. Public TTS arenas put Google Gemini TTS at or next to ElevenLabs
  at the top; open models (Qwen3, Chatterbox, Orpheus, Kokoro) rank below. `pipeline/gemini_tts.py` (stdlib REST,
  model `gemini-3.8-flash-tts`, a style direction in `STYLE`) voices each LINE in one pass (flows like a person
  reading, unlike our sentence-by-sentence Qwen), cached as `tts.line_path`; `voice_prepass.gemini_pass` checks
  every line with Whisper + `prosody.py`, retakes up to 3, and falls back to the Qwen voice for the whole Short if
  Gemini fails (quota/outage). Voice name: repo variable `GEMINI_VOICE`, else `assets/voice/gemini_voice.txt`,
  which `voice-gemini.yml` writes: every 2 h until it has run once with the key, 10 male voices read Short 074,
  get scored, `bench/pick_gemini.py` picks (95-160 Hz, 2.6-5.5 st, then UTMOS), clips on branch
  `voice-gemini-results-<run>`. Cost: 25 audio tokens/s at $9/1M (2026; $18 from 2027) = about 1 cent a Short,
  ~$1.60/month at 5/day; free tier may cover it (free-tier text is used by Google to improve products).
  Claude must never create, see or type the key: Sam makes it in AI Studio and adds the secret himself.
  **Pitch (Nov 14, Sam: "voice is a lot better", but "a tad too deep, not significantly"):** Umbriel is raised
  `GEMINI_PITCH_ST` = 1.5 semitones (Sam picked +1.5 over +1) in `tts.qwen` (ffmpeg asetrate + atempo: same speed, same word timings);
  samples `previews/voice/umbriel-up-1.mp3` / `-1.5.mp3`. Raise to 1.5 if he still finds it deep.
  **Odd-tone check (Nov 14, Sam: "the way it says 'just to help his family' gets me nervous"):** that line had
  dropped 2.9 st below the rest of the read. `voice_prepass.odd_lines` flags a line more than 2.3 st below / 3.5 st
  above the Short's median pitch; a line still failing after the whole-Short takes is re-recorded alone (up to 2
  per Short). Test on 074: 7/7 lines pass, clarity 98.6%.
  **Free tier only (Sam: "I don't want to pay").** The key is from AI Studio project "Game" (no billing; the
  "Default Gemini Project" is on a prepaid billing account with $0 credit, so its keys fail). Free limits per
  TTS model: 3 requests/min, 10/day, each model its own quota. So `_gemini_short` voices a WHOLE Short in ONE
  request and cuts it into lines with Whisper (`split_lines`), up to 2 takes; `gemini_tts.MODELS` falls back
  3.8 Flash -> 3.8 Flash-Lite -> 3.1 Flash -> 2.5 Flash when a day's quota is used. voice-gemini.yml no longer
  runs on a schedule (it would spend the daily quota).
- **Voice now (Nov 13, evening): `narrator4` + a voice test with retakes.** Sam: #4 (narrator3) "is fine, just sounds
  so monotone ... it needs to sound like you were reading it ... a test, and if it fails it redoes the voice until it
  passes". narrator4 = "anchor-lively": the same anchor design with a lively instruction and an excited reference
  read (the clone copies the reference's melody), median ~145-153 Hz (mid), fewest flat lines of the candidates.
  `pipeline/prosody.py` (numpy pitch tracker, checked on a ±3 st test tone) tests every sentence: pitch movement
  2.6-5.5 st (below = monotone, above = sing-song), median 90-175 Hz, pace; `voice_prepass` re-records any line that
  fails it or Whisper's clarity check, up to 6 takes (40 min cap), keeps the best, and posts a `voice test` notice
  ("12/13 lines pass"). Full test (074): 12/13 passed (the miss was Whisper hearing "Bucks'"), clarity 98.6%, 31.1 s.
- **Voice now (Nov 13, later): `narrator3`, mid-level.** Sam: narrator2 was "too deep, find a mid level". narrator3 =
  the "deep-anchor" design (calm, clear, authoritative but kind): median 121 Hz (a normal adult male speaking
  pitch; old 239-253, narrator2 89), 4.4 st movement, UTMOS 4.52, same-voice 0.822. Sam is ranking numbered
  clips in `previews/voice/` (01-11: mid designs, trend styles other faceless channels use, Qwen's built-in
  Ryan/Aiden, the old voice); switch to his #1 by copying its `.ref.wav/.ref.txt` from branch
  `voice-deep-results-2` or `-3` to `assets/voice/narratorN` (cv-* voices have no ref: make one with
  CustomVoice first). ElevenLabs (what most channels use) is paid; OpenAudio/Fish S1-mini is non-commercial.
- **Voice changed Nov 13 (deeper):** people Sam showed the Shorts to called the voice irritating and "out of
  tune" and asked for a deeper voice that explains better. Measured: the old `narrator` clone sat at a median
  239 Hz with 5 st swings (high and sing-song for a man). The channel now clones `assets/voice/narrator2.wav`
  ("deep-teacher": adult man, deep baritone, calm teacher explaining, steady pitch; median 89 Hz, 3.6 st, UTMOS
  4.48, same-voice 0.855) and plays it at `QWEN_SPEED` 1.1 (same pitch, ffmpeg atempo in `tts.qwen`) because it
  reads ~15% slower. Test again with branch `voice-deep` (`bench/voice_deep.py`: add a design line, results on
  `voice-deep-results-<run>`, clips in `previews/voice/`); full Short with branch `voice-e2e`. To go back: set
  `QWEN_VOICE: narrator` in nightly.yml. The rest of this bullet is the Nov 3 history.
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
  `loop` line ("So next time you …, remember:") which leads straight back into the opening
  line, so the replay is seamless. No "Follow for more". Keep prompts kid-safe.
- First frame shows the hook overlay fully (no pop-in); thin progress bar along the top edge.
- **Eyes (Nov 13, Sam: "give it eyes"):** `pipeline/eyes.py` runs after every render: the cover + a 12-frame
  sheet + title + narration go to Gemini Flash-Lite (free tier, same `GEMINI_API_KEY`, ~500 requests/day, one per
  Short), which returns a 1-10 score, the problems a viewer would see and the best fix. Printed as `eyes`
  notices/warnings in the run and saved in the script's `delivered.eyes`. (Until Nov 15 warn-only.) Read these after a run to decide what to improve. **Full-frame check (Nov 15, Sam approved):** by default eyes sends EVERY frame at 30 fps (numbered sheets of 100) plus a machine scan (blank frames, longest frozen stretch) and checks the scenery against the narration; a Short is HELD (`needs_fix`, the next ready Short takes the slot) on score <= 3, a reviewer `hold` (a serious defect a viewer can't miss) or a picture frozen > 4 s. `EYES=warn` = warn only, `EYES_FRAMES=12` = the old 12-frame sample.
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
  says whether the key works. **Health check (Nov 8):** `pipeline/health.py` runs after stats and writes `analytics/health.md` (each Short from the last 7 days: views, views/h, likes, comments, thumbnail status). Nightly saves each Short's frame 0 to `analytics/covers/<id>.jpg`; health downloads YouTube's public thumbnail and marks it MISSING, "our cover" (fingerprint match >= 90%) or "other frame", with a ::warning for problems. **Retention (Nov 9):** `pipeline/retention.py` (after health) reads the YouTube Analytics API with the owner sign-in (secrets `YTA_CLIENT_ID`/`YTA_CLIENT_SECRET`/`YTA_REFRESH_TOKEN`, made once with `pipeline/analytics_auth.py`; channel account = nightlightbeanie, read-only; Google app "Claude" in project My First Project, published) and writes `analytics/retention.md`: average % watched, share still watching at 25/50/75/end, and the steepest drop in seconds, for Shorts from the last 14 days. Skips quietly without the secrets. First read (Nov 9): every Short loses the most viewers at ~4–5 s (right after the opening line); the editorial PlayStation Short held 83% average vs 40–58% for chart Shorts. To check analytics, read `analytics/health.md` (or run `python -m pipeline.health` locally after pulling). **Numbers right now (Nov 13, Sam asked):** `python -m pipeline.now` asks GitHub for a fresh pull (push to `stats-run`, never a force push), waits ~1-3 min, pulls and prints every Short of the last 7 days fastest first with the change since the last pull; when Sam says "how are the Shorts doing", run it and answer from the table. Never change post times, posts/day, voice or upload mode for this.
- `pipeline/audio_check.py` runs after every render: one-breath runs (>6 s), syllables/s per
  scene, swallowed words, silent CTA beat, clipping. Prints `::warning`s; `AUDIO_CHECK=strict`
  blocks delivery.
- `pipeline/clarity_check.py` runs Whisper (`base.en`, CPU) on the final mix and compares it
  with the script: clarity % plus each word it couldn't hear (min 95%, `CLARITY_MIN`). Sam said
  some words weren't clear. Found and fixed: Kokoro swallowed weak first syllables ("Across" →
  "cross"; fixed by a leading "..." in `tts.kokoro`) and music masked line openings (duck now
  starts 0.2 s early). If a line keeps failing, reword it — don't slow the voice.
- **Hooks (changed Nov 11 from the numbers; Sam: hooks matter most):** every Short opens on its most
  surprising number or fact: spoken in the first sentence (12 words or fewer), on the overlay in second 1,
  and in the title. A question is allowed but no longer required (old rule: question line + question title).
  Line two is the payoff or a sharper twist, never setup. Why: of 42 Shorts, question hooks had a median 4
  views at 48 h (number 112, surprise 280), question titles 4 (number 30); every Short loses the most
  viewers at 4–5 s, right after the opening line (and the voice adds a 0.5 s pause after a question);
  under 30 s got a median 26 vs 3 for 30–38 s. What took off Nov 9–11: person stories with a number in the
  title, under 30 s ("From a Napkin Contract to $1.1 Billion" 1254, "$2.077 Billion From 149 Shows" 902 in
  23 h, "From $6,000 to $780,000: MLB's Lowest Pay" 462 in 20 h). The question that did work is "How much
  of YOUR [thing you buy] ..." (Uber 1020, Chipotle 963). Aim for topics/hooks that score ~90/100.
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
  **Nov 10 rebuild (Sam: "the low poly has no background", "the editing sucks"):** every set has a real sky (gradient, sun/moon, clouds, stars), far scenery and full dressing (stadium stands all round, floodlights, shop fronts, lamps, trees, walls, screens); shots always frame the hero against the set (`lowpoly.pick_shot`: hero / front / low / close / orbit / side / wide / back / crane; the old top-down shot is gone; no close-up while a big number is up); a punch-in lands every cut; falls play once; the cover shows name banner + title + hero (the banner used to hide the title). In Blender the people are welded, smooth-shaded and subdivided (`BL_SMOOTH`, default `180s1`), hero extras ride on bones in both renderers, colored screens glow without washing out, indoor sets use weaker light (`key_e`/`amb_e`). Quick check without voice: `python -m pipeline.lp_look <script> out.jpg [plan_dir] [beats]` (local GL sheet; with a plan_dir it records those frames for Blender), `python -m pipeline.preview` works for low-poly too. With the look fixed, `run.LOWPOLY_GAP` = 2 (Nov 10), then **1 on Nov 13** (every other post may be animated): animated person stories were getting 10-100x the views of chart Shorts (Curry 638 in 6 h, LeBron 1,067 in 11 h, Jordan 1,161 vs 4-40 for charts). The weekly batch writes animated `famous` stories for about half of each part. Popular Shorts use hand-made smooth 3D (Blender + paid add-ons or paid AI video); we match the smooth figures, lighting, depth of field and camera work for free, not hand animation or realistic faces. **People pack (Nov 11, Sam said to download the better free models):** the low-poly people are now Quaternius "Ultimate Modular Men/Women" (CC0, `assets/characters/people/`, credits in `assets/characters/CREDITS.md`): 8 men + 6 women with modelled faces, hair, beards and clothes, one shared 62-bone rig and 24 clips, four swappable parts (head / body / legs / feet), every surface a named flat-color material. `pipeline/people.py` (GL) and `pipeline/blender_lp.py` build a look from a string `P:head,body,legs,feet;Material=hex;slot.Material=-` (`lp_hero.look_name`). `lp_hero.look(hero)` maps the same script `hero` fields to parts (hair -> which head; bald/buzz hide the hair; a full beard with short/long/curly hair uses the bearded head; outfit -> body and legs; all colors recolored), `lp_hero.accessories` adds only what the heads lack (beards on other heads, buzz cut, glasses, cap, headband, long hair for women), `lp_hero.crowd_looks()` is the 16-person crowd mix. A full beard on a bald or buzz-cut head uses the bearded head with only the beard part of its hair piece kept (`bRRGGBB` color value, `lp_hero.BEARD_CUT`); stubble is not drawn (blocks read as a neck brace); the script `hero` now wins over an old per-scene `kit`. Spiky hair (`lp_hero.SPIKY`) is creased and flat-shaded in Blender so subdivision does not melt it. A block mouth was tried and dropped (sank into the face or looked stern). Blender gotcha: the importer leaves an action playing on each armature, so a render re-poses it; `blender_lp.model` clears animation data and never trusts a pose across frames. Clip names are the pack's (`lowpoly.CLIP`: cheer = wave, work = interact, idle = idle_neutral). Blender names actions `<Clip>_CharacterArmature` (`blender_lp._clip_key`). Ruled out: Quaternius Universal Base Characters (free version is underwear-only bodies), Kenney Mini Characters (blockier). Families (first letter of the model name; parts only mix inside one, the exports have different bind poses): `m_` men, `v_` women (casual, formal dress, suit, worker: the author's own glTF files from his Google Drive, repacked as GLB), `w_` two more women from poly.pizza (adventurer, punk). More models (witch, sci-fi, soldier, medieval, king...) are in the same Drive folders if a script needs them. The old single figure is only used by `pipeline/scenes_chars.py`. Renderer choice (GitHub, 1080x1920):
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
- **Thumbnails (Nov 15):** YouTube used a frame ~40% into each Short as the thumbnail (22 of 22 in health.md were
  "other frame"). Buffer refuses a custom image (`thumbnailUrl`: "social networks do not accept custom video
  thumbnail images") but takes `metadata.thumbnailOffset` (ms) on the video, so `publish.post_input` sends
  `THUMB_OFFSET_MS` = 40 (frame 1 = the title cover). Check health.md after new posts.
- **Pace (Nov 15, Sam: the Nike story was "very very slow"; his reference: @afterhourtheories "Jensen Huang's Affair
  Rocks NVIDIA", 2.5 min, 55K likes, a new view every ~1.3 s):** the Gemini read is sped up with atempo (same voice
  and pitch): `VOICE_SPEED_STORY` 1.2 for story Shorts, `VOICE_SPEED` 1.1 for the rest (`tts.VOICE_SPEED_FOR`, set per
  Short in render.py); toon story cuts every ~40 frames; animated Shorts show the sentence being said as white text
  near the top (`render._subline`, `SUBLINE=off` hides it) on top of the big one-word caption, like the reference.
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

## Weekly script batch (cloud routines, Saturdays — FOUR parts since Nov 15: 11:00, 1:30, 4:00, 6:30 PM ET)
**Chain (Sam approved Nov 15 2026: "11 AM until finished", "what if I hit usage"):** each part writes up to
`min(10, 75 - ready)` scripts and **commits + pushes after EVERY finished script**, so a part cut off by the usage
limit loses at most the script in progress; the next part starts by reading `git log` and finishing anything left
half-done (an open research branch, a draft missing checks). Up to 40 a week, same quality gate. Monthly report
in part 1. Where the older text below says "part 1 / part 2" or `min(20, ...)`, the 4-part chain wins.
Posting uses **35 Shorts/week (5/day since Nov 12; Sam: "up to 5 posts a day ... have the Saturday
research more ... maintain quality too")**. Goal: build a buffer, capped so credits aren't wasted.
1. Count `ready` scripts. **If 75 or more are ready, write nothing** (still do step 8). Otherwise
   write `min(20, 75 - ready)` new scripts in this part (part 1 ~12:30 ET, part 2 ~4:30 PM ET,
   so up to 40/week). **Quality comes before the count:** every script still needs opened sources,
   idea score 85+, lint 0 errors and story score 80+. If time or good ideas run short, stop and
   push fewer good scripts; never pad the batch. To keep Higgsfield credits flat while writing more,
   at least half of each part is animated (`lowpoly`; Nov 13: mostly `famous` person stories with a `hero`, like 073-077, the channel's best performers by far) or `editorial`
   (free Commons photos): neither needs Higgsfield images.
   First, fix any `status: "needs_fix"` scripts (reasons are in `needs_fix`; e.g. reword lines
   with unclear words, shorten long sentences), then set them back to `ready` and drop the field.
   If `content/performance.json` exists, read it: lean toward the topics and hook styles of the
   most-viewed Shorts and away from the least-viewed.
   **Score gate (Sam wants ~90/100 virality):** give every idea a `score` 0–100 (would a
   13–18-year-old stop scrolling? topic they use/love × surprising number said first) and
   only write ideas scoring **85+**. Gaming, phones, apps teens use, food/snacks, sneakers,
   sports, YouTubers/streamers rank high; hotels, B2B, software for offices rank low. Store the
   number in the script's `score` field (the nightly run posts the highest first).
   Every script also needs (Nov 11 rules, see "Hooks" above): the surprising number or fact as the
   first sentence (12 words or fewer), on the overlay and in the title; line two = the payoff or a
   sharper twist, never setup; and a `loop` field — one short line spoken last ("So next time you …,
   remember:") that leads back into the opening line. A question opening is optional; if used, put
   the number in it ("How much of your 34 dollar order ..."). The last scene must not say "Follow for more" (the CTA is
   added automatically).
   **Story format (Nov 15, Sam; toon look only):** `format: "story"`, `visual_style: "lowpoly"`, 5-9 scenes, may run
   ~45-65 s, told sentence by sentence like the reference "You're Elon Musk..." Short. Two modes (`story_mode`):
   - `history`: the real story of a big company/person, second person ("You quit a Wall Street job to sell books
     online. It's 1994."), every fact sourced (118 Bezos, 119 Nike).
   - `plan`: a HYPOTHETICAL escalating master plan, Sam's words: "Nike wants to take over the shoe game, so they
     sign athletes, they take over, then fans want dunks, so robotic dunk shoes, then everyone's dunking, so...
     just like the Elon video, the next idea, the next idea", feasible-sounding, each step caused by the last,
     getting bigger, ending on a twist (120 Nike; AI race: 121 Zuckerberg, 122 Bezos, 123 Nvidia). Real numbers only if sourced; imagined steps carry no fake
     statistics; the description says plainly it is a made-up plan, not company news.
   Any big company everyone knows. When a company/product appears or is created, its logo pops up (code-drawn:
   `brand` {name, bg, fg, icon}; brand names on screen are allowed since Nov 15, plain lettering, no copied logo art).
   **Per-sentence scenes (all toon Shorts):** each scene may carry `toon`: one dict per sentence (same count as the
   sentences in its narration) with `place` (street bridge quay road court pitch stage office servers space garage), `beat`
   (walk drive queue phone clock money logo sign), `props` (car truck trophy cash boxes check rocket ball mic flag
   laptop burger controller), `things` (0-2 drawn objects the sentence MENTIONS, shown big: shoe springshoe sneakerbus
   bus glasses robot chip drone plant satellite chatbot ring stadium factory snack hanger dome dumbbell tv books ereader
   medal crown; `pipeline/toon.things_for` also adds them from the line's words; Sam, Nov 15: "if it's mentioned in
   the video, it should make the scenery"), `mood` (happy laugh shock nervous proud stern scheme relief dazed sad calm excited),
   `action`, `crowd`, `brand`. Without it, `pipeline/toon_director.py` asks Gemini to pick them. The picture must
   show what the sentence says (Sam: "the scenes are the most important part"). Famous people: set `hero` fields
   so the cartoon looks like them (hair style/colour, beard, glasses, headband, skin) and `number` for athletes
   (jersey in team colours with their number; no team logo art); everyone else a signature outfit (`outfit`
   tee/suit/hoodie/kit/dress, `chest` text, `tie`).
   **STORY SHORTS AND SCENES (Sam, Nov 15 2026; the routines follow this, it overrides their older 'no logos/likenesses/jerseys' line for toon Shorts):**
   - Write about a third of this part as `format: "story"` Shorts: `history` (the real story of a big company or person in second person: "You quit Wall Street to sell books online. It's 1994.") and `plan` (a HYPOTHETICAL escalating master plan, Sam's words: "Nike wants to take over the shoe game, so ... so ... then ... still not enough?"). Athletes go viral for this channel, so most `plan` Shorts should be athletes ("You're Victor Wembanyama. You want to be the best ever. So you do X, which leads to Y, which leads to Z") and big companies in a race (the AI race: Meta, Amazon, Nvidia). Patterns: 118-127. Big current news about a famous company is allowed when sourced from a news page you opened, framed carefully (no unproven accusations, no names of private people).
   - In a `plan`, step one is real and sourced; every later step is clearly imagined, carries no made-up statistics, and the description says in plain words it is a made-up, hypothetical plan, not news.
   - Every story/toon scene carries `toon`: ONE dict per sentence of its narration (count them; the sentence splitter also splits long sentences at commas, so keep sentences short). Pick place / beat / props / mood / brand so the picture SHOWS what the sentence says.
   - GOOD scenes: the picture matches the sentence (rides = drive on the road, money = cash stacks, years = clock, an app = phone, a company named or founded = its logo or sign with real brand colours, fans = crowd/queue, an athlete = court or pitch); every sentence looks different from the one before; the hero looks like the real person (hair, beard, skin, glasses) and athletes wear their real number in team colours; moods follow the line (shock at a big number, sad at a setback, laugh at a win).
   - BAD scenes: a random street during a money or time line; the same beat twice in a row; more than 2 clocks or 1 phone per Short; money in space; an empty place with nothing happening; a famous person with the wrong hair or skin; made-up facts; a logo or sign the line does not mention.
   - Brand names and code-drawn logos (`brand` {name, bg, fg, icon}) are allowed on screen in toon Shorts; never copied logo art, crests or real jersey designs.
   **How to WRITE a story Short (Nov 16, Sam: "learn his script writing"; from a frame-by-frame + word-timed study of
   @afterhourtheories "Jensen Huang's Affair Rocks NVIDIA", 2.5 min, 55K likes; learn the moves, never copy his lines):**
   - Second person, present tense, the whole way: "You are X, the [role], and you are the king of [world]." Identity +
     status in the first 2 sentences, no setup before it.
   - One METAPHOR frames the whole story and pays off in the last line (his: everyone digs for gold, you sell the
     shovels ... you were digging your own grave). Plant it in line 2-3, call back to it at the end.
   - Short sentences: median 10 words, about 2 in 3 under 12 words; each sentence is ONE picture (the scenes are drawn
     from it). Speech runs about 2.8 words/s with almost no pauses.
   - Turn words do the pacing; every few lines starts with one: "Then," "But" "Then, one day," "Suddenly," "Now,"
     "Yet" "And if that wasn't enough," and the big pivot "But every king has a weakness."
   - Lists of names get one beat each ("Google, Meta, OpenAI, Microsoft, Elon Musk: they're all ..."), each drawn
     as its own character.
   - Human quirks + concrete details right after the crown (same jacket everywhere, a logo tattoo when the stock hit
     $100, employees driving supercars): sourced facts, specific and visual.
   - Arc: crown (now) -> quirks -> humble start (a real early job) -> near-death (almost bankrupt) -> a bet everyone
     mocked (with its year) -> the moment it paid off (with its year) -> total dominance ("whoever wins pays you") ->
     a callback quip to the humble start ("not bad for a dishwasher") -> a surprising real connection -> the turn
     ("but every king has a weakness") -> the fall, each line worse than the last, ending on one hard number -> the
     final line closes the metaphor.
   - Numbers are concrete and dated ($5 trillion, $100, 2006, 2012, 33 years, $200 billion), every one sourced.
   - One real, sourced quote at most, mid-way, from the person (no made-up quotes).
   - History Shorts may use this full arc at 45-60 s; plan Shorts use the same voice and turn words for their chain.
   - Scenery for this style (each sentence one picture): every named company/person as its own character (a hard hat
     or shirt with the name), dates as big signs or flip cards, money as screens that change, years as a spinning
     clock, news as a headline, the ending as a strong image (a grave, an empty throne). Use `toon` dict `card`
     {text, kind: sign|screen|paper|flip|tomb|white, sub, to, at} for the text pictures and `view: "face"` for
     punchlines (a face filling the frame).
   **New objects (Sam, Nov 16: "in the hypothetical where you create something new it should be a new object"):**
   real, everyday things come from the prop library (60 code-built objects in `toon/src/videos/afterhour/things3d.ts`
   + the free CC0 model packs in `toon/public/models/index.json`); a word with no match shows a white word sign.
   But anything a script INVENTS (a `plan` step's new product: robotic dunk shoes, a sneaker bus, a GPU throne, an AI
   referee robot) must be BUILT as its own new 3D object so the viewer sees the idea, not a sign. In the LAST part of
   the Saturday chain only, after the scripts are pushed:
   1. List the invented items in this week's scripts that have no object yet (and any real thing a script needs that
      the library lacks); pick the up to 3 that matter most (on screen longest, central to the story).
   2. Build each in `things3d.ts` in the same style (toonMat 3-step cel shading, `outline()` on main parts, chunky
      readable shapes, bright colours, a small `tick` motion, deterministic). Mix existing pieces where it helps
      (springshoe = shoe + springs). Add the name to `ThingName`, the test list in Ah.tsx and `pipeline/toon.AH_THING`
      (the words that trigger it), and set that script's `toon` `things` to it.
   3. TEST before main: push to a branch `things-test/<date>` with `toon/things_test.json` showing the new objects
      (workflow `things-test.yml` renders stills and type-checks), wait for it, pull the stills and LOOK at every one.
      Fix and re-push until each is instantly recognisable and matches the look. If it still fails, or the check
      fails, do NOT merge: leave the branch, note it in the commit/report, and the script keeps its word sign.
   4. Only then merge to main. Never push an untested things3d.ts to main: a broken file breaks every render that night.
   **Story/plan Shorts post automatically (Sam approved, Nov 15 2026: "Post automatically").** Story `history` and
   `plan` scripts the routines write go in as `status: "ready"` like any other script once they pass every check
   (sources opened, lint 0 errors, story score 80+, one `toon` dict per sentence); no separate approval needed.
   **Formats now (Sam, Nov 15 2026): `famous`, `whatif`, `story` (history + plan) only.** Sam dropped `how` and
   `careers` after the numbers (median 21 and 18 views at 48 h vs 781 for famous; 40 chart Shorts median 15). Their
   ready scripts were set back to `draft` with a `paused` note; do not write new ones, do not set them ready. With
   no chart Shorts, Higgsfield images are no longer needed (toon Shorts are drawn in code, editorial uses free
   Commons photos). Most Shorts: famous athletes / big names; ~1/3 story (company history, company or athlete
   master plans); some what-ifs on one real number. Everything below about rotating 4 formats is history.
   **Mix and hooks (Sam approved the next-step plan, Nov 15 2026):** about 2 in 3 scripts are `famous` athletes /
   big names (median ~900 views vs ~18 for the rest), about 1 in 3 `story` (history + plan), plus the odd what-if.
   Story length test for the week of Nov 16: write half the story scripts SHORT (25-35 s, 4-5 scenes, tag
   `"length_test": "short"`) and half LONG (45-60 s, `"length_test": "long"`); after a week keep the winner
   (`analytics/insights.md`). Every Short: a surprise number in line one, a number title, under ~30 s when the
   story allows, and a second line that hits hard (every Short loses the most viewers at 4-5 s).
   **Formats (Sam, Oct 29 2026) — rotate 4:** `format` = `how` (how X makes money), `whatif`
   (absurd scenario on ONE real stat, e.g. "What if one person delivered every Amazon package in
   a day?"), `careers` (how pilots/streamers/NBA players make money), `famous` (a famous person's
   real, dated net worth/earnings). Ideas + sources: `content/topics.md` "Formats". Mix per batch:
   start ~25% each, then follow `analytics/insights.md` (more of what wins, fewer losers) but keep
   ~20% experimental and NEVER drop a format entirely without asking Sam. Variety: no two Shorts
   in a row (by posting order) share format + theme + hook style; length **22–28 s** for standard Shorts (lint warns over 30 s; only a real story, `famous` or editorial, may run longer, Nov 11), vary hook
   style and title style. **Title test (Oct 30):** rotate `title_style` evenly (question / number /
   statement / whatif) until each has ≥ 10 posted Shorts in `analytics/insights.md`; after that,
   ~60% the winning style, the rest spread over the others so the test keeps running. (Nov 11:
   question titles are done, 23 posted and weakest, so at most 1 in 6 and only the "how much of
   your ..." kind; number leads; statement 8 and whatif 5 still need Shorts to finish the test.)
   **Mix (Nov 11):** each batch part writes at least 4 person stories (`famous`, or a founder /
   "almost went bankrupt" `how`) with a "From X to $Y" or plain-number title, because those are
   what took off; the queue had only one `famous` script left on Nov 11. Every script sets `format`, `visual_style` (`charts3d` for most; `lowpoly` for about half (Nov 13; was 2 in 5, and 1 in 3 on Nov 10; famous scripts set `hero`, see 051/061/073) — see existing 030/031 for the lowpoly scene JSON), `hook_style` (question / number / whatif / challenge / surprise),
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
- **Check every frame at 30 fps (Sam, Nov 15: "a must ... make this a rule").** Before calling any test video good,
  or sending it to Sam, run `python -m pipeline.allframes video.mp4 outdir` (all frames at 30 fps, numbered, 100 per
  sheet, plus a scan for blank/flash frames) and Read EVERY sheet in order. A 12-frame sample is not a check. What
  to look for: each sentence's picture shows what it says; a new view every 1.5-2 s (no 3 s+ holds); nothing cut off
  at the frame edge (logos, signs, phones); cars actually moving; money that reads as money; no empty or dark scenes.
- **No picture repeats within a Short (Sam, Nov 3).** Editorial Shorts take each photo once (`editorial.pictures` + photo slots in `render.plan`); give them 8–12+ Commons photos. Image-style (`charts3d`) Shorts still reuse their 4 Higgsfield images — more images per Short costs credits, ask Sam before changing.
- Never invent numbers. Never use real logos or people in image prompts.
- Real people/brands (STYLE.md "Real people and brands"): names OK in voiceover/captions/titles
  with sourced facts; never a character modeled on a real person's look; no fake quotes; hint
  with props/setting; no logos, uniforms or brand marks; don't copy other creators.
- Don't change the posting schedule, upload mode or voice without Sam asking.
- Keep everything inside the free tiers.

## Repeat check (Nov 4)
Run annotations list shots that still repeat. A photo Short needs about one picture per shot, or it can't meet Sam's no-repeat rule.
