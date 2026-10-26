# How They Make Money

Automatic YouTube Shorts for **@HowTheyMakeMoneyDaily**. Each Short explains how a company really
makes its money, in under a minute.

## What happens on its own
| When | What | Cost |
|---|---|---|
| Every Sunday | Claude researches and writes the next batch of scripts, makes the images with your Higgsfield plan, and saves them here | Higgsfield credits (~2 per Short) |
| Every morning (~6 AM) | GitHub builds 2 Shorts: voice, animated charts, captions, video | Free (GitHub Actions) |
| Every morning | Each finished Short shows up as a **Release** in this repo, with the title and description ready to copy | Free |

## Your part (about 2 minutes a day, for now)
1. Get the notification on your phone (GitHub app → this repo → **Watch → Custom → Releases**).
2. Open the release, download the MP4.
3. YouTube app → **+** → Upload → pick the video → paste the title and description.
   Set **Altered or synthetic content: Yes** (AI images and voice). Post at the suggested time.

Once YouTube approves the API audit, flip the repo variable `UPLOAD_MODE` to `youtube` and
videos upload and schedule themselves (see `pipeline/youtube_auth.py`).

## Controls (GitHub → Settings → Secrets and variables → Actions → Variables)
- `SHORTS_PER_RUN` — videos per day (default 2)
- `POST_SLOTS` — suggested posting times, e.g. `12:00,18:00`
- `KOKORO_VOICE` — narrator (`am_michael` default; try `am_fenrir`, `am_puck`, `af_heart`)
- `UPLOAD_MODE` — `release` (default) or `youtube`

Run it any time: **Actions → Make Shorts → Run workflow**.

## Files
- `content/scripts/` — the queue of Shorts (one JSON per video, with sources)
- `content/STYLE.md` — writing rules · `content/topics.md` — future topics
- `pipeline/` — renderer, voice, delivery
- `CLAUDE.md` — setup and weekly instructions for Claude
