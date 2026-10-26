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
- `pipeline/tts.py` — voice. Default Kokoro-82M (`am_michael`), CPU. Optional Ming-3.0-tts.
- `pipeline/publish.py` — `UPLOAD_MODE` repo variable:
  - `release` (default): MP4 attached to a GitHub Release with title/description to paste. Sam
    uploads from the YouTube app. Required until YouTube approves the API audit, because uploads
    from unaudited API projects are locked to private.
  - `youtube`: direct scheduled upload via the YouTube Data API (`publishAt`, private until then,
    `containsSyntheticMedia: true`). Needs `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`
    secrets (see `pipeline/youtube_auth.py`).

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

## Weekly script batch (scheduled task, Sundays)
Goal: keep at least 14 `ready` scripts in the queue.
1. Count ready scripts. Write enough new ones to bring the queue to 21 (max 14 per run).
2. Read `content/STYLE.md` and a few existing scripts. Pick topics from `content/topics.md` not
   already in `content/scripts/` (check `company`/`slug`). Move used topics to the Used list.
3. Research each with web search. Use only figures from sources you opened (filings first).
   Put every source in `sources` and in the description (see existing scripts' format).
4. Next ids continue from the highest existing `NNN`. Same JSON shape as existing scripts.
5. Images: Higgsfield connector, `generate_image_batch`, model `gpt_image_2_5`,
   `aspect_ratio: "9:16"`, `quality: "medium"`, `resolution: "2k"`, `use_unlim: false`
   (1 credit each). Pro plan allows only **4 images at a time** — submit groups of 4, wait with
   `jobs_wait`, then the next 4. Put each `result_url` into `images.hook.url` / `images.mid.url`.
   Check `balance` first; if under 60 credits, write the scripts but stop before images and leave
   a note in the commit message.
6. Validate every file parses as JSON and has 5–6 scenes, then commit and push to `main`.

## Rules
- Never invent numbers. Never use real logos or people in image prompts.
- Don't change the posting schedule, upload mode or voice without Sam asking.
- Keep everything inside the free tiers.
