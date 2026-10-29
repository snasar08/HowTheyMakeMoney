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
  (Public figures: see "Real people and brands" below.)
- Don't put real logos, trademarks or real people in image prompts. End every image prompt with
  "no text, no logos, no brand names".
- **3D characters (Sam, Oct 29):** at least 2 of the 4 images per Short show people as
  3D-rendered CGI characters: smooth, slightly stylized but realistic proportions, soft studio
  lighting, clean simple backgrounds, gentle depth of field — the look of a polished animated
  explainer. Not photos, not cartoons, not toys. Characters are made up: no real or famous
  people, no look-alikes, no kids shown alone, no logos or brand marks on clothes/products.
  Never name a creator or studio in a prompt; describe the style. Start such prompts with:
  "3D rendered CGI character scene, smooth stylized realistic characters, soft studio lighting,
  clean simple background, shallow depth of field, vertical:" and end with "no text, no logos,
  no brand names". Example: "... vertical: a smiling couple pushing an overflowing shopping cart
  past tall shelves of bulk boxes in a warehouse store, no text, no logos, no brand names".
  The other images (objects, places) may use the same 3D style so the Short looks consistent.

## Real people and brands (Sam, Oct 29 2026)
- Real names of people and companies are fine in the voiceover, captions and titles — with
  sourced facts only (net worth, salary, revenue, records). No rumors, no private life.
- Never model a character (image or 3D) on a real person's face, hair, body or signature look,
  and never use look-alikes. Characters are always generic made-up people.
- Never put words in a real person's mouth: no fake quotes, no "he said", no imagined thoughts.
  Only quote something they really said, with the source.
- Hint at who it is with props and setting instead: rocket + electric car for a tech
  billionaire, mountains of boxes for an online-store founder, giant checks for a giveaway
  YouTuber, a basketball court for an NBA star.
- No real logos, team uniforms, jerseys, product designs or brand marks anywhere.
- Don't copy another creator's look, characters, catchphrases or video concepts.

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
