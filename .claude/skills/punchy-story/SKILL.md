---
name: punchy-story
description: Write or rewrite How They Make Money scripts so the story isn't bland. Use for every new script in the weekly batch and whenever a script scores under 80 on pipeline/story_score.py.
---

# Punchy story

Sam rated a test Short 6-7/10 and called the story a little bland (Nov 4 2026). Long lists of
numbers were the cause. Build each Short around one surprise.

1. **Find the one surprise.** Cut every fact that doesn't lead to it.
2. **Open on the number, in 12 words or fewer.** Say the most surprising figure or fact first, then twist it: "Closed every Sunday. Still, each Chick-fil-A makes 7.5 million dollars a year." No warm-up, and no question needed: viewers leave at 4-5 s, right after the first line (Nov 11 numbers).
   Line two is the payoff or a sharper twist ("That's the 2024 average. Per restaurant."), never setup.
3. **Flip every scene.** Set up, then turn: "Sounds huge, right?" / "Then look at data centers."
4. **Use 2-4 numbers.** Every one comes from the script's sources. Plain math from them is fine.
5. **Write fragments.** 3-8 words a line. Read it aloud.
6. **Aim for 22-28 s.** Five scenes is usually right. Only a real person or founder story may run longer.
7. **End on the flip, then a this-or-that.** Set `cta` and `cta_question`, such as "Coke or Pepsi?"

8. **Person stories win.** "From a Napkin Contract to $1.1 Billion" and "$2.077 Billion From 149 Shows" are the channel's fastest Shorts: a low start, a dated number, the number in the title.

Project rules still win: kid-safe, number-first hook (a question is optional), no invented numbers, no real logos or likenesses.

## Check it

```bash
python -m pipeline.story_score content/scripts/NNN-name.json
python -m pipeline.lint content/scripts/NNN-name.json
```

Rewrite anything under 80. The score checks structure only and can be gamed by sprinkling words like
"but", so don't write to it: real views in `analytics/insights.md` are the final test.
