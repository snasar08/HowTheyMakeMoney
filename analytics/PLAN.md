# What to measure once views come in

Data we already collect for free: `content/performance.json` (weekly, public stats: views, likes,
comments per Short, via `stats.yml` + the `YT_API_KEY` secret). Each row is matched to its script,
so every number below can be joined with the script's fields (`score`, theme, hook text, length,
visual types, 3D on/off).

## The questions, in order
1. **Do hooks hold?** Best signal without logins: views per Short in its first 7 days (Shorts
   are pushed to a test audience first; a weak first 2 seconds = few views). With an Analytics
   login later: "Viewed vs swiped away" and average % viewed.
2. **Is `score` predictive?** Rank correlation between our virality `score` and 7-day views. If
   it's weak after ~20 Shorts, re-weight the writer's scoring (topic vs hook vs number).
3. **3D vs 2D charts.** Once the 3D version is live, compare 7-day views and like rate for the
   2 weeks before vs after (same posting slots). Small sample; treat as a direction, not proof.
4. **Length.** Bucket by rendered seconds (≤30, 30–38, 38–45). Shorts that finish get looped
   and replayed, so shorter often wins; keep the bucket with the best views/like rate.
5. **Topic family.** Food, tech/phones, gaming, sports/careers, retail, finance: views by family
   → the writer's topic mix.
6. **Comments.** Comment rate (comments/views) tests the end CTA. Read comments for brand
   requests and add them to `content/topics.md`.

## Monthly report (the Saturday writer already opens one)
Add: top 3 / bottom 3 Shorts by 7-day views with their hook lines, score vs views, and one
change to try next month.

## Later, only if Sam wants (needs one Google sign-in)
YouTube Analytics API via the existing OAuth client: retention curve per Short, swipe-away rate,
traffic source. That's the real hook metric; public stats are a proxy.
