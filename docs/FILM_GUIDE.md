# Film guide: lessons for our own Film2D films (structure, camera, text, sound)

All numbers measured on a 1280x720, 30 fps, 158 s test film. Use them as defaults, not laws.

## 1. Story arc (shape)
- Cold open on one quiet, relatable moment (bed, alarm). First 4 s are nearly silent: that quiet is the hook.
- Act 1, "the loop" (about 0-72 s, 45%): the same small failure repeated with a counter ticking up (alarm, snooze, skip, tomorrow). Each repeat is shorter than the last, so it feels like it speeds up.
- Act 2, "the turn" (72-122 s, 30%): the character finally moves (crawl, stairs, punches, gym). Montage of short effort shots, one idea per shot, a day counter jumping in big steps.
- Beat of silence/breath (122-125 s), then payoff (125-145 s): a hill, the summit, arms up, the inner voice is smaller or gone.
- Ending (145-158 s): black cards with the moral in two short lines, slow fade. Last frame is text only.
- The antagonist is the character's own inner voice (a tall dark monster copy). It only appears when he is weak (desk, couch, mirror) and gets smaller or absent in the effort shots.

## 2. Pacing and cut lengths
- Act 1: 3-5 s holds for the main scenes, then a fast burst of 0.35-1.25 s cuts for repeats (e.g. 11.5, 12.1, 12.5, 12.85 s).
- Montage: a new picture every 1.25 s (about 38 frames) with a day label per picture; never reuse a picture inside a short stretch.
- Payoff: back to 2-4 s holds so it reads as calm.
- Cuts land on exact frames. Our renderer put .0 and .5 cuts one frame late, so the generator pulls those one frame earlier (the `_sh` helper). Always check the 3 or 4 cuts you care most about against the planned frame count, and move the one that is off.
- Every shot has a slow push in or out (zoom 1.0 to 1.1 over the shot, ease linear). A fully locked camera reads as a slideshow.

## 3. Shot types and camera
- Wide establishing (room, street, stairs) 1.0-1.15 zoom; medium on the character 1.25-1.45; close-up 2.3-3.0 on face or bed for emotional beats.
- Bedroom shots: side/top-down on the bed, camera pushing from 1.25 to 2.3 on "snooze".
- Desk/couch/mirror: camera slightly high, character off-centre, the monster fills the empty half of the frame.
- Camera fields in the film JSON: `cam {from:[x,y,zoom], to:[x,y,zoom], ease}`; `SET_CAMS` in sets.tsx are the per-set defaults. Use `from`/`to` on every beat that is held longer than 1 s.
- Fade to black between acts (`fadeOut` frames), flash frames (`flash`) on punches and big events.

## 4. Character drawing and poses
- Flat colour, thick dark outline, round head, big simple eyes. Eyes: two dots on a front view, one shifted dot per side on profile.
- Round frontal face for lying in bed (head on a pillow): eyes at +/-12 px, no neck or body showing beyond the head, rotation cancelled so the face stays upright.
- Expressions we used: sleep, tired, shock, determined, sad. Switch expression at the beat where the story turns, not before.
- Pose library worth reusing: lie, bedge, slump, sofaphone, deskslump, desk, reach, crawl (prone, dragging one forearm, 80-87 s), pushup, run/walk/trudge, climb/stairs, punch (wind-up 10 f, extension 3 f, hold 4 f, return 12 f), raise (one arm up), point/summit, sad.
- Monster voice: same character in black, taller, with poses lurk (behind chair), peek (over couch), loom (leaning over), monster (standing, slight sway). Rises into frame from below the floor line over 0.6-1.0 s with an eased `to` move; never pops.
- Walk cycles: 20 frames with 2 % bob. Run: 12 frame stride.

## 5. Colours and lighting
- Each act has its own palette: cold blue-grey for the loop (bedroom night, desk lamp), warm orange overlay and glow for effort (gym), saturated sky and green hill for the payoff, pure black for cards.
- Light sources are drawn: fridge open = pale blue-grey inside glow with wide slanted door; alarm clock glows red; gym has a yellow spark and glow on every punch hit.
- Silhouette layers (city, hills) in two or three darker tones behind the character give depth cheaply.
- A warm overlay (`warm` in Film2D) rises with the montage; use it as the visual "things are getting better" meter.

## 6. Text on screen
- Two kinds: (a) spoken-thought lines typed in white at about 17 characters per second, size 34-60, centred upper third; (b) big red bold lines at size >= 60 (up to 118) that appear whole for the harsh voice.
- The line starts after the cut, not on it: delay 0.3-0.5 s so the picture registers first. Do not let text show at the exact frame the picture is still empty; if in doubt delay it.
- A text lasts 0.8-3 s and ends on or just before the next cut.
- Cards: black background, 1 or 2 white lines per card, 2-4 s each, fade in/out. The last card is a command.
- Fields: `say:[R(text, start, end, at=[x,y], size, cps)]`; W for white; red = bold voice.

## 7. Day counters
- A small label at the lower-left of every montage picture ("DAY 12"). Values jump in uneven steps (1, 47, 121, 260, 365) so time feels like it flies.
- Keep the same font and position all film; only the number changes. Ending on a full year at wide zoom 1.8 is the strongest version.
- Field: `day:"DAY 260"` per beat; `dayLabel` in Film2D draws it.

## 8. Music structure (score2d sections)
- drone 0-72 s: low pad plus sub, slow tick (clock). Level quiet at 0-4 s (almost nothing), growing slightly. Brighter upper chord voices (audio_hi) come in at 4.5 s and are held until 38 s, then fade to 0.35 and lower.
- tick/pulse 96 bpm: appears as the loop speeds up (about 60-72 s).
- montage 72-122 s: kick plus bass sub, chord pad, hats; this is the loudest part. The mid band (250-1000 Hz) must stay about 12-15 dB below the lowest band or it sounds muddy: keep the upper-register chord voices almost off (audio_hi near 0.01) here.
- brief drone breath 122-124.5 s, then finale 124.5-145.2 s: pad plus melody, no sub, hi voices at about 0.7.
- title 145-158 s: warm pad, quiet events, fade to black over the last 2.5 s (cubed cosine).
- Sync to cuts: hits land on the cut or on the punch frame; give the extra bright clicks through `audio_onsets` so each important cut has a transient.

## 9. Sound effects
- Alarm: repeating two-tone beep, hand slap with a thump when snoozed. Heartbeat/tick under tension. Punch: thud plus a short bright click at the impact frame. Footsteps in the run/stairs sections. Short whoosh on camera pushes.
- Keep SFX lower than the music pad except on punches and slaps; those are the accents the ear tracks.

## 10. Feature and JSON map
| Need | Where |
|---|---|
| Beats / cuts | `add(t, set=..., chars=[...], cam=..., say=[...], day=...)` in the generator, written to content/films2d/*.json, converted by `python -m pipeline.film2d plan` |
| Set (room) | `set`: bedroom, desk, couch, street, gym, fridge, mirror, stairs, hill; `arg` for per-set state (clock time, fridge open, mirror crack) |
| Character | `{look, x, y, pose, expr, dir, scale, to, ease}` |
| Props | `things:[{name:"phone", hand:0}]` |
| Camera | `cam`, `SET_CAMS` |
| Transitions | `fade`, `fadeOut`, `flash` |
| Text | `say` with R/W helpers; cards as `black` beats |
| Level curve | `audio_trim [[t,dB],...]` (freeze it as JSON, never derive it from a file that gets overwritten) |
| Brightness | `audio_bright`, `audio_hi`, `audio_air`, `audio_onsets` |
| Music section map | score2d tags drone/tick/pulse96/montage/slam/finale/title and `LEVEL` dict |

## 11. Workflow lessons
- Compare against a target per second (RMS, spectral centroid, octave bands), not only by ear: the mud was found by ablating one component at a time, not by guessing.
- Keep stills quick (about 2-3 min) for picture changes, the full render (6-8 min) only once per round.
- Before blaming "wrong content" at a cut, check for a one-frame lag.
- Freeze any derived curve in a JSON file; do not rebuild it from a moving measurement.
