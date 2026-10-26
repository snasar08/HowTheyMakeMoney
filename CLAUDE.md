# How They Make Money — notes for Claude

YouTube Shorts channel **How They Make Money** (@HowTheyMakeMoneyDaily). Each Short explains how
one company or industry makes its money, using researched figures, Higgsfield images, animated
charts, an AI voice and word-highlighted captions. Owner: Sam (snasar08). He wants it hands-off
and **free beyond his Higgsfield Pro plan** — never add a paid service or ask for a card.

## How it runs
- `content/scripts/NNN-slug.json` — the queue. `status: "ready"` → waiting; `"delivered"` → done.
- `.github/workflows/nightly.yml` — GitHub Actions (free tier, no GPU) runs daily at ~6:17 AM ET,
  renders the next `SHORTS_PER_RUN` (default 2) ready scripts, delivers them, marks them delivered
  and commits. Budget: private repos get 2,000 free minutes/month; a run takes ~5–8 minutes.
- `pipeline/render.py` draws every frame with Pillow and pipes to ffmpeg (1080x1920, 30 fps).
- `pipeline/tts.py` — voice. Default Kokoro-82M (`am_fenrir`, speed 1.25 — Sam's pick Oct 26; earlier 1.35 was hard to follow; one Kokoro call per sentence, questions 7% slower + 0.5 s beat before the answer so they sound like questions), CPU. Optional Ming-3.0-tts.
- `pipeline/music.py` — background music synthesized in numpy (original, nothing to license),
  seeded per script, ducked under the voice. `MUSIC_GAIN` env var (default 0.12, 0 = off).
  Sam disliked the whoosh sound on cuts, so it was removed — don't add cut SFX back.
- Mid-video CTA (`CTA_LINE` in `render.py`): "Like if that surprised you. Subscribe… And comment
  which company we should break down next!" voiced as ONE clip after a 0.15 s beat — gluing it onto
  the scene's sentence garbled it, and long pauses between sentences sounded stilted. Animated
  LIKE / SUBSCRIBE→SUBSCRIBED / comment bubble pop in on their words. Keep prompts kid-safe
  (Shorts audience is young) — no per-company opinion questions.
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
   a note in the commit message. No real people or logos in prompts.
6. Validate every file parses as JSON and has 5–6 scenes, then commit and push to `main`.
7. Never leave a script with `status: "ready"` and missing image URLs — set `status: "draft"` if
   images couldn't be made, so the nightly run skips it.
8. On the first Saturday of the month (part 1 only), open a GitHub issue "Monthly report YYYY-MM":
   Shorts delivered last month (count `delivered` with dates), queue size, Higgsfield credits left,
   failures / `::warning` audio or Buffer issues from the last month's Actions runs, and anything
   that needs Sam.

## Rules
- Never invent numbers. Never use real logos or people in image prompts.
- Don't change the posting schedule, upload mode or voice without Sam asking.
- Keep everything inside the free tiers.
