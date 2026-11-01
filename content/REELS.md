# Reels Sam likes — what they do (analyzed Nov 1 2026)

Sam saved 4 reels he likes. Learn the *techniques*; never copy their stories, characters, lines or
look. (One was a "what if [dictator] woke up in 2026" — the structure is useful, the subject is not
kid-safe and never OK for this channel.)

| reel | length | words/s | cuts | style |
|---|---|---|---|---|
| Job-hunt advice, person + robot mascot | 69 s | 3.0 | slow camera, UI pops | cozy 3D room |
| Casino story, "you" are the gambler | 47 s | 3.2 | 18 | flat 2D cartoon |
| "What if X woke up in 2026" time-jumps | 57 s | 2.5 | 10 | blocky low-poly 3D |
| Graduate + robot mascot, job tool | 45 s | 1.9 | 11 | blocky low-poly 3D, close-ups |

## What they all do
1. **Short fragments, not sentences.** 3–7 words a line: "Zero offers." "Mostly C's." "200?" A
   question, then a two-word answer. Fewer words per second than ours (1.9–3.2 vs ~4.8 syllables/s).
2. **A twist or punchline every 3–5 s.** "Netflix already has a Netflix." "Mine has dark mode."
   "So does Netflix." Each line flips the one before.
3. **A running counter on screen.** "TIME SINCE HE WOKE UP: 10 MINUTES", "$2,001 + HOUSE" dropping
   to "$0". Viewers stay to see where the number ends. → we now have `hud` (see below).
4. **Time-jump / step structure.** "One minute… ten minutes… one hour… one week", or "Step one…".
   Each jump escalates. Perfect for `whatif`.
5. **Things you can read on screen.** Text-message phones, app windows, step cards, price chips.
6. **Close-up reactions.** The character's face changes on the punchline; the camera pushes in.
7. **A specific comment question, not "subscribe".** "Maya or the gum guy? Comment who's in."
   "What should his punishment be? Wrong answers only." A this-or-that choice gets comments.
8. **Second person / a character.** "You pick black." or a naive character asking a mascot. The
   viewer is inside the story instead of being lectured.
9. **Captions:** 1–3 words, bottom-center, one key word in color. (We already do this.)
10. **Length 45–69 s** for stories; the dialogue never stalls, so long still holds.

## How to use it in our scripts
- Write lines as fragments; set up → flip. Read each line aloud: if it's over ~10 words, cut it.
- `whatif`: use time-jumps or a counter ("1 second… 1 hour… 1 year") with a real, sourced number
  driving each jump. `famous` / `careers`: "you" framing ("You just signed your first NFL contract.").
- Add a counter whenever a number changes over the Short:
  `"hud_label": "MONEY LEFT"` at the top of the script, and `"hud": "$2,001"` in a scene's `visual`
  (it carries over until another scene changes it, and pops when it does).
- End with a this-or-that comment question tied to the topic: set `"cta"` (spoken) and
  `"cta_question"` (the on-screen bubble), e.g. `"cta": "Pilot or NBA player? Comment which job
  you'd pick."`, `"cta_question": "Pilot or NBA player?"`. Still kid-safe, still no "Follow for more".
- Length may run to ~55 s when the story keeps moving (lint now warns above 55 s).
- Every number is still sourced; the counter shows only real figures or plain math from them.
