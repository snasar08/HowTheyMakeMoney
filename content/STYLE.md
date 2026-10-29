# How They Make Money — script rules

Every Short answers one question: **how does this company (or industry) actually make its money?**

## Format
- 5–6 scenes, 70–115 words total (about 28–45 seconds of narration).
- Scene 1 is the hook: a surprising claim in one or two short sentences, on the `hook` image.
- One idea per scene. Short sentences. Calm, confident, plain English — no hype words
  ("insane", "crazy", "you won't believe").
- Spell numbers the way they should be spoken: "4.5 billion dollars", "57 percent".
- Last scene ends with: " Follow for more."
- Use each visual type at most twice per Short, and vary the order from Short to Short so
  videos don't feel templated.

## Topics (who we cover)
- **Household names only** — companies nearly everyone has heard of and uses or sees.
- **Jobs and careers people are curious about** — how YouTubers, streamers, pilots, NBA players,
  real estate agents, dentists, Uber drivers, etc. make money. Use industry/official data
  (BLS, league CBAs, platform payout docs), never one real person's private finances.
- Viewers skew young: keep every hook, CTA and comment prompt kid-safe.

## Repeats (YouTube demonetizes repetitive content)
- A company may come back only with a **clearly different angle and new information**: a new
  hook, new B-roll prompts/images, and a different scene structure (different visual-type order
  and different key figures). Never a near-copy of an earlier script.
- Before writing, read `content/angles.md`. After writing, add one line per new script:
  `NNN | company | angle in one sentence | key figures used`.

## Facts (non-negotiable)
- Every number must come from a source you actually opened: company filings (SEC 10-K/10-Q/8-K,
  annual reports, earnings releases) first, then reputable reporting. List them in `sources`.
- Use the most recent full-year figures available. Say the year ("in 2025", "fiscal 2026").
- If a figure is an estimate or rounded, say "about" / "roughly".
- No predictions about stock prices, no investment advice, no claims about private people.
- Don't put real logos, trademarks or real people in image prompts. End every image prompt with
  "no text, no logos, no brand names".
- **Show people (Sam, Oct 29):** at least 2 of the 4 images per Short should have realistic,
  made-up people doing the thing the Short is about (shoppers pushing a cart, a cashier, a
  family at the movies, a driver, a gamer). Photo-real, natural, candid, never 3D/cartoon
  figures. Not real or famous people, no celebrity look-alikes, no kids shown alone, no
  uniforms or name tags with brand marks. Adults or families; faces fine but not close-up
  portraits. Example: "Cinematic candid photo, vertical: a young couple laughing while pushing
  an overflowing shopping cart down a huge warehouse aisle, warm light, shallow depth of field,
  photorealistic, generic store, no text, no logos, no brand names".

## Themes
- `dark_neon` — finance, fintech, tech platforms, crypto, banks.
- `bold_bright` — consumer brands, food, retail, entertainment.
- `clean_navy` — big corporates, airlines, media, B2B.
Rotate so the same theme doesn't run more than 3 Shorts in a row.

## Visual types (see existing scripts for exact JSON)
- `image` — `{"type":"image","image":"hook"|"mid","overlay":"BIG TEXT","overlay_sub":"small text"}`
- `stat` — `{"type":"stat","value":45.6,"prefix":"$","suffix":"B","decimals":1,"label":"..."}`
- `bars` — `{"type":"bars","items":[{"label":"...","value":5.9},...],"prefix":"$","suffix":"B","title":"..."}` (2–3 items)
- `donut` — `{"type":"donut","value":57,"label":"..."}` (a percentage 0–100)
- `text` — `{"type":"text","text":"Big line.","sub":"Accent line."}`

Overlay text: 1–3 words, ALL CAPS. Labels: under 50 characters.
