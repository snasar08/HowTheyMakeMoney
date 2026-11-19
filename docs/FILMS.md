# Long-form films

Our own flat 2D animated films (16:9, ~2-4 min, silent, synthesized score), one every 3 days.
Rendered by the `Film2D` composition (`toon/src/videos/film2d/`) via `pipeline/film2d.py` + `pipeline/score2d.py`.

Guide for writing films: [FILM_GUIDE.md](FILM_GUIDE.md).

## Queue
`content/films2d/NNN-slug.json` (top level only). Extra top-level keys next to the beats:
`"status"`: `draft` | `ready` | `delivered`, `"title"`, `"description"`, `"tags"`; the workflow adds `"posted_at"`, `"release"`, `"youtube"` on delivery.
- Next film = lowest id with status `ready`. Ids **900 and up are internal and skipped forever** (hard-coded in `pipeline/films.py`).
- Subfolders (e.g. `content/films2d/test/`) are never queued. `test/tiny.json` is the 5 s pipeline test.
- Film format: see the docstring of `pipeline/film2d.py` and the header of `Film2D.tsx`. Check with `python -m pipeline.film2d table FILE` and `python -m pipeline.film2d audio FILE out.wav`.

## Cadence
`.github/workflows/films.yml` runs daily 13:00 UTC. Step "due?" (`python -m pipeline.films due`): due when no film was ever delivered, or the
last `posted_at` is >= 3 New York calendar days before today. Then it renders the next ready film on 20 machines, stitches the MP4, takes a
1280x720 thumbnail (frame at ~35 %), runs `pipeline.scenesheet` (warn only; artifact `film-scenesheet`), creates GitHub release `film-NNN`
(MP4 + thumbnail, title/description/tags in the body), and commits `status: delivered` + `posted_at` to main.
Publish time = 17:00 America/New_York on the due day (a late manual run gets now + 15 min).

## FILM_UPLOAD (repo variable, default `release`)
- `release`: the release is the result; Sam uploads the MP4 + thumbnail to YouTube by hand.
- `youtube`: also uploads via `pipeline/yt_upload.py` (`upload_film`): long-form (no #shorts), category 1 Film & Animation, not made for kids,
  `containsSyntheticMedia` true, private + `publishAt` 17:00 ET, thumbnail set (failure tolerated). Needs the YTC_* secrets (same as comments).
  Any failure prints `::warning::` and never fails the job; the release already exists.

## Dry run / testing
- Actions -> Films -> Run workflow with `dry` = true (optionally `file` = `content/films2d/test/tiny.json`), or push branch `films-dry`.
  Renders into prerelease `films-dry`; no upload, nothing marked delivered. `force` ignores the 3-day cadence.
- `python -m unittest tests.test_films` checks the due logic, the 900+ guard, publish time and the upload body.
