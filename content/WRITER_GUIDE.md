# Writer guide (read this INSTEAD of CLAUDE.md, STYLE.md, REELS.md and the skills)

You write Shorts scripts for the channel How They Make Money: `content/scripts/NNN-slug.json`. Next id = highest
existing NNN + 1. The nightly job renders and posts `status: "ready"` scripts. Quality beats count: if ideas or time
run short, push fewer good scripts. Never pad.

## 1. What to write now
Formats allowed: `famous`, `whatif`, `story`. Do NOT write `how` or `careers` (paused by Sam: no views).
- Mix per part: about 2 in 3 `famous` athletes / big names, about 1 in 3 `story`, the odd `whatif`.
- `famous`: one real person's sourced, dated money or record story, second person or plain narration, a `hero`.
- `whatif`: an absurd scenario on ONE real number ("one cashier serves every McDonald's customer in a day").
- `story`, `story_mode` `history`: the real story of a big company or person, second person, every fact sourced.
- `story`, `story_mode` `plan`: a HYPOTHETICAL escalating plan ("You're Victor Wembanyama. You want to be the
  best ever. So you ... which leads to ... still not enough?"). Most `plan` Shorts: athletes, or big companies in a
  race (Meta, Amazon, Nvidia). Step one is real and sourced; every later step is clearly imagined with NO made-up
  statistics; the description says in plain words it is a made-up plan, not company news.
- Story length test this week: half the stories SHORT (25-35 s, 4-5 scenes, `"length_test": "short"`), half LONG
  (45-60 s, 6-9 scenes, `"length_test": "long"`). Other Shorts: 22-28 s (a real story may run longer).
- Pick topics with idea `score` 85+ (would a 13-18-year-old stop scrolling?). Sports, games, phones, food, sneakers,
  YouTubers rank high; hotels, B2B, office software rank low. Store it in `score`.
- Before writing: read `analytics/insights.md`, `content/angles.md` (a repeat company needs a clearly different
  angle, new figures, new hook), and the best examples: `119-plan-nike.json` (the owner's favourite), 118, 120, 123,
  124. After writing, add one line per script to `content/angles.md`: `NNN | company | angle | key figures`.

## 2. Narration: fast, pulling, drawable (read this twice)
Target sound: fast @afterhourtheories-style narration. Short full sentences, every line pulls into the next, every
noun is something the 3D video can show, one clear payoff, and an ending that loops into line 1.

What the data say (analytics/retention.md + insights.md, Nov 26, 90 Shorts): every Short stalls near 1000 views; the
biggest drop (-13 to -17 pts) is at 4-5 s, right as line 1 ends. Surprise/number hooks median 1020 / 270 views at 48 h,
question hooks 15. Number titles 1007, statement 33, question 18. Under 30 s: 781 views, 30-38 s: 15 (stories may run
longer, but only if every line pulls). Best 25%-watched: "His dad worked up to 4 jobs at once. Now he earns 100
million dollars a year." (118%), "A game company paid him 1 million dollars. To play its game." (112%). Worst: "Guess
how much ..." (69-83%), "What if Nike's best store isn't even a Nike store?" (63%), "How did [company] ...?" (39-85%).

The seven rules (pipeline/script_check.py scores them):
1. HOOK: line 1 is 9 words or fewer (about 3.5 s). WHO by name + ONE number + a contradiction or low start (paid to
   play, turned down, cut, zero offers, no license). A person with an odd concrete detail beats a company or a quiz.
   Never open with "Guess how much", "How did / Why does [company] ...", "What if X isn't X", "Did you know".
   A question is fine only if the number is in it and it is about a person. A year goes on a flip card, not in line 1.
2. OPEN LOOP: line 2 starts by 3.5 s with But / Now / Then / So or a question and opens a gap ("but that's not how he
   got rich"). Do not answer it before second 6. No setup, date talk or background before second 6.
3. PULL: every line ends leaning into the next (a "but", a question, an unfinished step). Every few lines flips the
   one before it. "Still not enough?" is the pull line of `plan` Shorts: use it, then give the bigger next step.
4. LINE SHAPE: 6-14 words, one picture per sentence, calm plain English, no hype words ("insane", "crazy"). Never two
   fragments of 4 words or fewer in a row ("That year?" / "By his own guess." read with a falling pitch and a 0.7 s gap,
   it sounds chopped). Never 15+ words: the splitter breaks it at commas and the toon count drifts.
5. DRAWABLE: every line names something that can be drawn: a person, a number, a shoe, a court, a burger, a contract, a
   brand. Abstract words (success, journey, legacy, dream, future, growth, strategy) give the picture nothing: swap them
   for the object or the act ("you sign the contract", not "you secure your future").
6. ONE PAYOFF: one number or twist the whole Short builds to, 2-4 numbers in total, each sourced, spelled for speech
   ("46.3 billion dollars", "57 percent"; $ is fine). Say the thing plainly so the voice can't blur it ("a rival game
   called Apex Legends", not "A rival to Fortnite"). Time words ("a year later") only when the dates say so.
7. LOOP ENDING: `loop` is the last spoken line and ends on a lead-in (colon or comma) that runs word for word into line 1
   ("So next time someone says you're too young, remember:" + "You're Coco Gauff ..."). Never just "So remember:".
Line one says WHO by name ("Ninja got paid 1 million dollars ..."), never only "him"/"he".

Bad line -> better line (all real lines from this repo; the numbers never change, only the wording):
| Bad (why) | Better |
|---|---|
| "You're Nvidia, and in one quarter you made 115.8 billion dollars." (12 words, hook late) | "You're Nvidia: 115.8 billion dollars in one quarter." |
| "You have to eat every Oreo made in a year: 40 billion." (12) | "You must eat 40 billion Oreos, a year's worth." |
| "Max Verstappen raced in Formula One at 17, without a road license." (12) | "Verstappen raced Formula One at 17, no road license." |
| "George Lucas took only 150,000 dollars ..." then "He later sold his company for 4.05 billion." (no gap) | same hook, then "But he later sold his company for 4.05 billion." |
| "You're Shai Gilgeous-Alexander. Picked 11th, traded twice, then you win MVP and the title in the same year." (3-word fragment, 15-word line) | "You're Shai Gilgeous-Alexander, the 11th pick. But you're traded twice. Then you win MVP and the title in one year." |
| "You are Ken Kutaragi, and your PlayStation sold over 102 million units." (12, filler "you are ... and") | "You're Ken Kutaragi: PlayStation sold over 102 million units." |
| "In April 2026, Kevin Durant's company bought a 515 acre amusement park." (date eats the hook) | "Kevin Durant's company bought a 515 acre amusement park." then the date in line 2 |
| loop "So remember:" (leads nowhere) | "So next time you ride a roller coaster, remember:" |
| "Guess how much ..." / "How did [company] ...?" | the number first: "A game company paid him 1 million dollars. To play its game." |
| "It's all about the journey and success." (nothing to draw) | "You sign the contract. You count the cash." |

Other fields:
- `cta` + `cta_question`: a this-or-that comment question ("Nike or Adidas?"). The last scene never says "Follow for
  more" (the CTA is added automatically).
- `first_comment` (Nov 22, pipeline/first_comment.py): one line, max 120 characters, creator voice, asks viewers
  something they want to answer, may add one emoji. Not a copy of `cta_question`: add a twist ("Nike or Adidas? Wrong
  answers only 👇"). Only numbers that are in the script; no links, @, # or new facts; kid-safe.
- Title: the number + the contradiction, 50 characters or fewer, at most 1 in 6 questions.
- Vary `hook_style` (question / number / whatif / challenge / surprise) and `title_style` (question / number /
  statement / whatif). No two Shorts in a row share format + theme + hook style.

## 3. How to WRITE a story Short (the moves)
- Second person, present tense, the whole way: "You are X, the [role], and you are the king of [world]." Identity and
  status in the first 2 sentences. No setup before it.
- ONE metaphor frames the story and pays off in the last line. Plant it in line 2-3, call back at the end.
- Short sentences: median 10 words, two in three under 12. Each sentence is ONE picture (the scenes are drawn from
  it). The splitter also breaks long sentences at commas, so keep them short.
- Turn words set the pace; every few lines starts with one: "Then," "But" "Suddenly," "Now," "Yet" "And if that
  wasn't enough," and the big pivot "But every king has a weakness." Plan Shorts end each step with "Still not
  enough?" then the next idea.
- Lists of names get one beat each, each drawn as its own character.
- Human quirks and concrete details right after the crown (sourced, specific, visual).
- History arc (45-60 s): crown (now) -> quirks -> humble start -> near-death -> a bet everyone mocked (year) -> the
  moment it paid off (year) -> total dominance -> a quip back to the humble start -> a surprising real connection
  -> the turn -> the fall, each line worse, ending on one hard number -> the last line closes the metaphor.
- Plan arc: real step one (sourced) -> each next step is CAUSED by the last and bigger -> a twist ending.
- Numbers are concrete and dated. One real, sourced quote at most. No made-up quotes, ever.

## 4. Per-sentence scenes (`toon`)
Every story scene (`visual.type: "lowpoly"`) carries `toon`: a list with exactly ONE dict per sentence of its
narration. Count with:
`python -c "from pipeline import tts; print(len(tts.sentences(tts.speakable('NARRATION'))))"`.
The picture must SHOW what the sentence says. Fields (all optional; use only these values):
- `place` (Nov 18: any 3D set by name): throne office diner lab stall field ring track graveyard boardroom street
  beach court pitch diamond gridiron tennis golf pool rink factory mountain farm store gym studio stage space garage classroom bathroom mansion showroom (old names still work: servers=lab,
  road=track, quay=beach, bridge=street). court = basketball; pitch = soccer; diamond = baseball; gridiron = American
  football (NFL, quarterback, touchdown, Super Bowl; sentence words pick it automatically); tennis = tennis court (Wimbledon, US Open, racket); golf = golf course (golf, the Masters, putt, fairway, PGA, birdie); rink = ice hockey rink (hockey, NHL, puck, Stanley Cup, Oilers, on the ice; red centre line, goal, boards and glass, crowd); pool = an empty swimming pool ("swimming pool", "pool"; tennis net, ladder, tiled walls); factory = factory floor (factory, assembly line, conveyor belt, robot arms; the `factory` OBJECT is a separate small model); mountain = rocky mountain with a mine entrance, cart tracks and gold veins (mountain, mine, miners, gold rush); farm = barn, tractor, crops, harvest; store = grocery store, cashier, bagger; gym = weights, workout, training centre; studio = animation / film studio, cartoons, animators (a RECORDING studio stays on stage); track = sprinting; ring =
  boxing/wrestling; garage = a humble start; throne = the crown moment; lab = AI / data centre; diner = food;
  boardroom/office = deals; mansion = wealth; stall/showroom = shops and products; classroom = school/childhood;
  stage = music/shows; graveyard ONLY for a real ending/death line. Check: `python -m pipeline.ah_table <file>`.
- `beat`: walk drive queue phone clock money logo sign. money = coin burst (use for dollars); logo / sign need
  `brand`; drive puts the hero on the road.
- `props` (max 2): car truck trophy cash boxes check rocket ball mic flag laptop burger controller.
- `things` (0-2 objects the sentence MENTIONS, shown big; Nov 18: any 3D object by name): shoe springshoe chip gpu
  cash cashstack coins goldbar trophy medal crown ring car sportscar bus truck rocket phone laptop tv monitor clock
  books letter newspaper briefcase shovel pickaxe box crate basketball football soccerball hoop mic headset controller burger
  pizza coffee plant robot drone satellite globe house factory stadium plane yacht chart arrowup arrowdown lightbulb
  lock key heart bomb fire camera chatbot glasses dumbbell hanger dome console golfball golfclub horse baseball guitar rollercoaster noodlecup (noodles, ramen, cup noodles) legobrick (lego, brick) eiffeltower (eiffel) giantshovel (a house-tall shovel; plain `shovel` stays the normal one) icepop (ice pop, popsicle, paleta) (roller coaster, amusement park, theme park) (+ old names sneakerbus idea poster). The renderer also adds models from the line's
  words (max 2). Use `things` not `props` for a football (props "ball" draws a basketball); "football" is the American ball, soccer = "soccerball" (balls on the pitch set become one automatically).
- `mood`: happy laugh shock nervous proud stern scheme relief dazed sad calm excited. Match the line (shock at a
  big number, sad at a setback, laugh at a win).
- `action` (the pose; otherwise picked from the line's verbs): stand sit cheer wave point walk dig shrug jump dunk
  run dribble shoot throw type eat talk phone count dance fistpump fall facepalm think sleep.
- `crowd` 0-300 (fans, customers). `view`: ms (default), face, cu, ws, wide, low. Use `face` on punchlines (a face
  filling the frame).
- `brand`: `{name, bg, fg, icon}` (icon: swoosh star rocket bolt chip globe car brain bird sun play cart robot burger
  letter). Real brand colours, plain lettering.
- `card`: `{text, kind, sub, fg, bg}` kind = sign (a big sign, slogans) | screen (money that changes) | flip (years)
  | paper (headline) | tomb (an ending) | white (plain word). `hide: true` shows only the card.
- `who`: a different character for that line (e.g. Michael Jordan in a kit with number 23). Set the hero in
  `hero` (below).

- Acts (Nov 16, Sam: "he hasn't played basketball"): when a line DOES something, the renderer plays a real mini-scene
  around the hero (the ball goes through the hoop, a shot gets swatted, the burger gets eaten, the contract gets signed)
  and picks it from the line's verbs (`pipeline/ah_actions.pick_act`); nothing to set. So write action lines in concrete
  verbs ("you shoot from half court", "you block everything", "you sign Jordan", "you count the cash", "you code the
  app") and put the related object in `things` (pizza fries icecream donut soda coffee burger pick the food act) (burger, car, chart / arrowup, box / shoe, laptop, cash, trophy) so the
  act fires and has its prop. Do not force `action` on such a line: the act's own pose wins. Kinds: sports = dribble
  shoot dunk block pass layup kick punch sprint trophy_lift, plus qb_throw touchdown bat_swing pitch (baseball only)
  tennis_serve golf_swing goal_celebrate race_car sprint_finish lift_weights; daily = eat (burger, sandwich, any food) eat_pizza eat_fries eat_icecream eat_donut drink (coffee, tea) drink_soda (soda, cola, milkshake) phone_call type_laptop
  count_cash sign_contract drive_car throw_cash present_chart unbox; business = handshake_deal ("strike a deal",
  "partner with", "merge") ring_bell (IPO, "goes public") ribbon_cut ("opens its first store") stack_gold card_swipe
  cash_register stock_up stock_crash vault hire; creator = gaming streaming sing_stage guitar film_camera rocket_launch
  build_tools ("builds a shoe", "in a garage") code_screens ("you code the app") robot_build post_video ("goes viral").
  Each act moves the shot to its own place (court / pitch / ring / track / field / boardroom / stage / stall / lab ...) and
  uses a wide view for sports, driving, charts, stock moves and rockets. Buying something big ("you buy it for 309 million")
  is shown as signing the paper. Vague lines
  ("it grows", "you win") get no act on purpose; "Nobody can score on you" = block, "your teammates get wide open" = pass.

Rules of thumb (the checker enforces most of them):
- A year or a money figure said in the line is SHOWN: a `card` (flip for years, screen for money) or a money beat.
- A company or brand named for the first time pops its `brand` sign or a `card`.
- Every sentence looks different from the one before: change place, view, beat or pose. Same beat twice in a row,
  more than 2 clocks or 1 phone per Short, money in space, an empty place, a sign the line does not mention are BAD.
- Give at least 30% of sentences a `thing` or `card`; never 4 sentences in a row with nothing to look at.
- A twist or punchline scene (but / suddenly / still / yet / until / ends in ? or !) has a `view: "face"` line.
- Athletes play in their sport's place (court, pitch). Mood follows the line.
- Invented things (a plan step's new product: robotic dunk shoes, sneaker bus, an AI referee) must exist as 3D
  objects. If there is no object, name the closest one in `things` and list the invention in your report.
  Do not use an object name that does not exist: the checker prints "missing object".

## 5. Facts and sources
- Every number comes from a page you opened (company filings and investor pages first, then Wikipedia or reputable
  news). List each in `sources` ({title, url}) and in the description. Say the year ("in 2025"). Say "about" for
  estimates. Never invent a number. No stock predictions or investment advice. Not financial advice line in the
  description.
- Your sandbox can search but cannot open pages: use the GitHub fetcher. Copy this block:
```bash
B=research/$(date -u +%Y%m%d-%H%M)        # if that push is refused, use claude/research-<same>
git switch -c "$B" origin/main
mkdir -p research && printf '%s\n' URL1 URL2 ... > research/requests.txt   # up to ~60 URLs
git add research/requests.txt && git commit -m "Source request" && git push -u origin "$B"
# wait ~2 min, then poll until research/index.json appears (it lists ok/error per URL)
for i in $(seq 1 20); do git pull -q origin "$B"; [ -f research/index.json ] && break; sleep 30; done
```
  Read `research/pages/*.txt` (first lines give URL/FINAL_URL). Need more URLs? Append to requests.txt, push again,
  poll again (already-fetched URLs are skipped). Then `git switch main` and write scripts there. Never merge the
  research branch into main.
- Works from GitHub: company investor-relations sites and their PDFs (investor.apple.com, stock.walmart.com ...),
  Wikipedia, `api.bls.gov`. Blocked: sec.gov, data.sec.gov, bls.gov pages, some IR sites, nasdaq.com. Use the
  company's own press release or annual report PDF instead of EDGAR.
- Big current news about a famous company is allowed when sourced from a page you opened, framed carefully: no
  unproven accusations, no private people.

## 6. Real people and brands
- Names are fine in the voiceover, captions and titles with sourced facts. No rumours, no private life, no fake
  quotes, no imagined thoughts for real people.
- In toon Shorts the cartoon may look like the person through `hero` (hair style and colour, beard, glasses,
  headband, skin, height). Athletes get `number` (jersey in team colours with the real number). Everyone else gets a
  signature outfit (`outfit` tee/suit/hoodie/kit/dress, `chest` text, `tie`).
- Brand names and code-drawn signs in real brand colours with plain lettering are OK. NEVER copied logo art, crests,
  team badges, sponsor marks or real jersey designs.
- Kid-safe: viewers skew 13-18. No mocking people who failed, nothing violent or adult.
- Do not copy another creator's lines, characters or concepts.

## 7. JSON shape
Top level (all required unless noted): `id` (string "NNN"), `slug`, `company`, `format`, `story_mode`
(`history`|`plan`, story only), `visual_style: "lowpoly"`, `hook_style`, `title_style`, `theme` (dark_neon /
bold_bright / clean_navy; rotate), `status: "ready"`, `score`, `title`, `name_card`, `name_sub`, `description`
(story + "Sources:" list + the cited facts + "#shorts #topic #howtheymakemoney"; a `plan` says it is made up),
`tags`, `images: {}`, `loop`, `cta`, `cta_question`, `first_comment`, `hero`, `scenes` (5-9), `sources`, `length_test` (story only),
`look: "afterhour"` (story only).
`hero`: `{skin hex, hair short|buzz|bald|quiff|long|bangs|ponytail|bun|afro|curly|mohawk, hair_color, beard
none|stubble|full|goatee|mustache, outfit tee|kit|suit|hoodie|dress, shirt, pants, shoes, chest, trim, number,
extras [glasses|cap|headband], height}` (hex colours without #).
Each scene: `narration`, `visual` (`type: "lowpoly"`, `set` city|court|pitch|office|stage|..., `action`, `crowd`,
`props`), `toon` (one dict per sentence).

Worked example: read `content/scripts/119-plan-nike.json` (the owner's favourite). What it does right: scene 1 has three
sentences and three toon dicts; the first has the big number as a `screen` card plus the brand sign, the year is a
`flip` card, the twist is a `face` close-up. Every year said has a flip card, every money line a screen card or money
beat. A repeated `thing` changes mood and `view` so the picture still changes. `who` swaps the character for the Jordan
lines (kit + real number 23, no logo art). `brand` appears when Nike is named or renamed.

## 8. Quality gate (run in this order, fix, then commit and push after EVERY finished script)
```bash
python -m pipeline.lint content/scripts/NNN-slug.json          # 0 errors, fix most warnings
python -m pipeline.story_score content/scripts/NNN-slug.json   # 80+ (rewrite anything under)
python -m pipeline.scene_check content/scripts/NNN-slug.json   # 0 errors, scene score 85+
python -m pipeline.script_check content/scripts/NNN-slug.json  # craft score 75+ (rule 2 hook, loop, drawable lines)
python -m pipeline.toon_director content/scripts/NNN-slug.json # prints the scene it will draw for each sentence: read it
```
- scene_check ERRORs must be fixed (wrong toon count, unknown value, missing object, a number or brand not shown).
  WARNs: fix the ones that name a real problem (repeat, mention not shown, empty run); "objects to build" lists what
  to hand to the object builder.
- A script passes only with sources opened, lint 0 errors, story score 80+, script_check 75+ (rewrite the flagged lines, never the facts), scene_check 0 errors, one `toon` dict
  per sentence. Then set `status: "ready"` and push to `main`. Otherwise leave `status: "draft"`.
- Start each part by reading `git log` and finishing anything half done (an open research branch, a draft missing a
  check). Fix any `status: "needs_fix"` script first (its reasons are in `needs_fix`), then set it back to `ready`.
- Count `ready` scripts first: if 75 or more are ready, write nothing. A part writes `min(10, 75 - ready)`.

## 9. Never
- Never invent numbers, quotes or facts. Never state a made-up step as news.
- Never copy logo art, crests or real jersey designs; never put a real person's face or look-alike in an image
  prompt (toon Shorts need no images at all).
- Never leave `status: "ready"` on a script that fails a check.
- Never change posting schedule, upload mode, voice, or a paused format without Sam.
- Keep everything inside free tiers; never add a paid service.

## 10. `pov` Shorts ("POV: you do an everyday money thing")
Format `pov` (Nov 23): follow what happens to ONE ordinary money action, step by step through a cartoon town, with the math built up on screen. 45-60 s, 5-6 scenes; the toon rules of section 4 apply (one dict per sentence, no commas inside long sentences, no "U.S." with periods: the splitter breaks on both).
- Beats: hook (line 1 <= 9 words, a surprising number or contradiction about the action, no question) -> the action (you tap / pick up / pay) -> journey (the money or data travels to whoever gets paid) -> math stack (2-3 operations) -> scale up (per day / year / country) -> relatable units -> a light kid-safe joke that loops back to line 1 (`loop` leads word for word into it). Line 2 starts with But / Then.
- Top level: `"format": "pov"`, `"pov": "POV: you ..."` (<= 40 chars), `"hook_rules": "nov23"`, `visual_style: "lowpoly"`, `look: "afterhour"`.
- Per sentence (all optional): `"math": [{"op": "", "value": "$5.00", "label": "your coffee"}, {"op": "x", "value": "2.5%", "label": "swipe fee"}, {"op": "=", "value": "12.5c", "label": "to the card network", "result": true}]` (cards ADD to those already shown; `"math": []` clears, so put the clear on the sentence before a fresh stack; labels <= 22 chars); `"units": {"thing": "bathtub|lightbulb|house|coin|cup|phone|truck|ticket", "count": N, "fill": true, "label": "114 billion pennies"}` (`count` = how many objects are DRAWN: an integer 1-20, it is never the real number; the optional `label` (<= 24 chars) is the real figure in the narration's exact words, shown as a yellow card above the row; every number in a label must also be in the narration and the sources, never invented); `"journey": "<object> to <place>"`.
- Sourcing: every number on screen and in the voice comes from a page you opened and lists in `sources`; the math must be right and written out in the description under "Our math:"; say "about" for rounded results; a made-up example amount ("say your coffee costs 5 dollars") is fine only if the description says it is made up and the math uses the real rule (a fee formula), not an average that would not fit it.
- Companies follow section 6 (names and colour signs only); a repeat company needs a new angle in `content/angles.md`.
- Gate: lint, scene_check, toon_director as in section 8. story_score has a pov branch (story length 42-62 s read 1.2x faster, up to 14 numbers); it still judges hook, turn, pace and ending like any Short.
