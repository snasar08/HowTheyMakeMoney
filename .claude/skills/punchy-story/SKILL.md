---
name: punchy-story
description: Write or rewrite How They Make Money scripts so the story isn't bland. Use for every new script in the weekly batch and whenever a script scores under 80 on pipeline/story_score.py.
---

# Punchy story

Sam rated a test Short 6-7/10 and called the story a little bland (Nov 4 2026). Long lists of
numbers were the cause. Build each Short around one surprise.

1. **Find the one surprise.** Cut every fact that doesn't lead to it.
2. **Hook in 12 words or fewer.** Put the viewer in it, then contradict: "You already paid for your iPhone. So why does Apple keep earning?"
3. **Flip every scene.** Set up, then turn: "Sounds huge, right?" / "Then look at data centers."
4. **Use 2-4 numbers.** Every one comes from the script's sources. Plain math from them is fine.
5. **Write fragments.** 3-8 words a line. Read it aloud.
6. **Aim for about 25-28 s.** Five scenes is usually right.
7. **End on the flip, then a this-or-that.** Set `cta` and `cta_question`, such as "Coke or Pepsi?"

Project rules still win: kid-safe, question hook, no invented numbers, no real logos or likenesses.

## Check it

```bash
python -m pipeline.story_score content/scripts/NNN-name.json
python -m pipeline.lint content/scripts/NNN-name.json
```

Rewrite anything under 80. The score checks structure only and can be gamed by sprinkling words like
"but", so don't write to it: real views in `analytics/insights.md` are the final test.
