# How They Make Money — notes for Claude

YouTube Shorts channel **How They Make Money** (@HowTheyMakeMoneyDaily). Each Short explains how
one company or industry makes its money, using researched figures, Higgsfield images, animated
charts, an AI voice and word-highlighted captions. Owner: Sam (snasar08). He wants it hands-off
and **free beyond his Higgsfield Pro plan** — never add a paid service or ask for a card.

## How it runs
- `content/scripts/NNN-slug.json` — the queue. `status: "ready"` → waiting; `"delivered"` → done.
- `.github/workflows/nightly.yml` — GitHub Actions (free tier, no GPU). **Slot-aware** (Oct 29):
  runs ~9:23 PM ET (fills tomorrow) + ~9:41 AM ET backup; each run renders only for OPEN slots
  in the next 36 h (`publish.taken_slots` from the delivered records; never a taken slot, max
  `MAX_PER_DAY`=2/day, a passed slot rolls to the next free one), so late/backup/manual runs
  never double-post. GitHub starts scheduled runs late (Oct 26–28: 5.5–6.5 h). Check Buffer:
  push branch `slot-audit` (report) / `slot-fix` (delete extras, scripts back to ready). Budget: private repos get 2,000 free minutes/month; a run takes ~5–8 minutes.
- `pipeline/render.py` draws every frame with Pillow and pipes to ffmpeg (1080x1920, 30 fps).
- `pipeline/tts.py` — voice. Default Kokoro-82M (`am_fenrir`, speed 1.25 — Sam's pick Oct 26; earlier 1.35 was hard to follow; one Kokoro call per sentence, questions 7% slower + 0.5 s beat before the answer so they sound like questions), CPU. Optional Ming-3.0-tts.
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
  says whether the key works. Never change post times, posts/day, voice or upload mode for this.
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
- Shots change every ~1.4 s (max 2 s, Sam wants something new at least every 2 s).
- **3D charts (since Oct 29 2026):** `pipeline/gl3d.py` (moderngl engine; Mesa llvmpipe via EGL on
  GitHub, ~0.1 s/frame) + `pipeline/scene3d.py` (bars from a floor, coin/cash stacks with a counting
  number, pie slice-out, globe, extruded text) + a 3D card swing on cuts. All GL calls go through
  `run3d` (one GL thread). Off switch: repo variable `RENDER_3D=off` → old 2D charts; automatic
  2D fallback if GL fails. A Short renders in ~1.5–2.5 min on the runner. `globe` visual type:
  `{"type": "globe", "points": [{"lat": .., "lon": ..}], "label": ".."}` (real coordinates only).
  Test: push branch `3d-e2e` (real voice, checks, gate, Buffer dry run; results on
  `3d-e2e-results`). Benchmarks: `bench3d.yml` on `3d-upgrade`.
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
Posting uses 14 Shorts/week (2/day). Goal: build a buffer, capped so credits aren't wasted.
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
   in a row (by posting order) share format + theme + hook style; vary length (25–45 s), hook
   style and title style. Every script sets `format`, `visual_style` (`charts3d` — `lowpoly` only
   after Sam approves it), `hook_style` (question / number / whatif / challenge / surprise),
   `title_style` (question / number / statement / whatif). Real people: STYLE.md
   "Real people and brands".
   **Before writing, read `analytics/insights.md`** (updated by stats.yml before Saturday).
2. Read `content/STYLE.md`, `content/angles.md` and a few existing scripts. Topics: household-name
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
   (fix every error, most warnings), then commit and push to `main`.
7. Never leave a script with `status: "ready"` and missing image URLs — set `status: "draft"` if
   images couldn't be made, so the nightly run skips it.
8. On the first Saturday of the month (part 1 only), open a GitHub issue "Monthly report YYYY-MM":
   Shorts delivered last month (count `delivered` with dates), queue size, Higgsfield credits left,
   failures / `::warning` audio or Buffer issues from the last month's Actions runs, a short
   **insights summary** (top/bottom 3 Shorts, which formats/hooks/titles/lengths lead, and whether
   each is a finding or an early signal — copy from `analytics/insights.md`), and anything that
   needs Sam.

## Rules
- Never invent numbers. Never use real logos or people in image prompts.
- Real people/brands (STYLE.md "Real people and brands"): names OK in voiceover/captions/titles
  with sourced facts; never a character modeled on a real person's look; no fake quotes; hint
  with props/setting; no logos, uniforms or brand marks; don't copy other creators.
- Don't change the posting schedule, upload mode or voice without Sam asking.
- Keep everything inside the free tiers.
