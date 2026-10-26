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

## Facts (non-negotiable)
- Every number must come from a source you actually opened: company filings (SEC 10-K/10-Q/8-K,
  annual reports, earnings releases) first, then reputable reporting. List them in `sources`.
- Use the most recent full-year figures available. Say the year ("in 2025", "fiscal 2026").
- If a figure is an estimate or rounded, say "about" / "roughly".
- No predictions about stock prices, no investment advice, no claims about private people.
- Don't put real logos, trademarks or real people in image prompts. End every image prompt with
  "no text, no logos, no brand names".

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
