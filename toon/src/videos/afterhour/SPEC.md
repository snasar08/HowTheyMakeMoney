# Afterhour look: real-3D characters and dense sets (Nov 16)

Goal: a new Remotion composition `AhShort` (1080x1920, 30 fps) that looks like a cel-shaded 3D cartoon:
white round-headed characters with thick dark outlines, rich low-poly sets, warm/neon lighting, soft shadows,
background blur on close-ups. Everything is built in code with three.js (no downloaded models), deterministic
(same frame -> same image; seeded random only, never Math.random / Date).

Files (each owned by one worker; do not edit the others):
- `char.ts`  (character worker)  -> `makeChar(look: Look): Char`
- `sets.ts`  (sets worker)       -> `makeSet(name: SetName): SetObj`
- `Ah.tsx`, `plan.ts` (lead)     -> composition, cameras, post (bloom, DOF, tone), plan from inputProps
- `common.ts` (lead, read-only for workers): `toonMat(color, opts)`, `outline(mesh, width)`, `seeded(seed)`.

## Shared style rules
- Materials: `THREE.MeshToonMaterial` with a 3-step gradient map (from `common.ts`), or `MeshStandardMaterial`
  for metal/gold. Emissive colours for neon/screens (bloom picks up emissive > 1 via `emissiveIntensity` 2-3).
- Outlines: inverted hull (`outline()` from common.ts): a BackSide black clone scaled up, on characters and big props.
- Units: metres. Ground at y = 0. Characters ~1.9 m tall, facing +z. Sets: the "hero spot" is the origin;
  the camera looks at it from +z (in front). Put backdrop/walls at negative z, open space toward +z.
- Shadows: meshes set `castShadow` / `receiveShadow` sensibly. Lights belong to the set (`SetObj.lights`).

## char.ts contract
```ts
export type Expr = "smile" | "grin" | "smug" | "laugh" | "shock" | "sad" | "angry" | "wink" | "neutral" | "scream";
export type Look = { body: string; legs?: string; skin?: string; hat?: "none"|"crown"|"hardhat"|"fedora"|"cap"|"hair";
  hatColor?: string; hatText?: string; hair?: string; glasses?: "none"|"round"|"shades"; tie?: string; text?: string; halo?: boolean };
export type Pose = "stand" | "sit" | "cheer" | "wave" | "point" | "walk" | "dig" | "shrug";
export type Char = { root: THREE.Group; set(t: number, pose: Pose, expr: Expr, blink?: boolean): void };
```
Proportions (from the reference): head = sphere r 0.42, white (#f7f7f7) with outline 0.02-0.03; head centre y ~1.55;
body = capsule r 0.26, length 0.35, centre y ~0.95, in `body` colour (dark jackets common); legs = two thin
black cylinders r 0.045, 0.55 long, small rounded feet; arms = thin black cylinders r 0.04 from shoulders with ball
hands r 0.07, posed by `Pose` (cheer = both arms up, wave = one arm waving with t, dig = shovel motion, walk = leg
swing with t, sit = legs forward bent 90 deg, hips at y 0.55). Subtle idle breathing/bob with t.
Face: drawn on a CanvasTexture mapped onto a front patch of the head sphere: big simple eyes (black dots or
outlined white eyes), eyebrows, mouth shapes per `Expr` (smug = one-sided smirk + half-lidded eyes, shock =
round open mouth + raised brows + a blue sweat drop, laugh = open D mouth + closed happy eyes, scream = huge
open mouth). Cache one texture per expression. Accessories as real 3D: crown (gold ring + 6 spikes + red/blue
jewel spheres, metallic), hardhat (half sphere + brim, `hatColor`, white label band with `hatText` in bold black
letters across the front), fedora, cap, simple hair cap; glasses "shades" = two dark rounded lenses + bridge.
`text` = short word printed on the chest (e.g. "FBI"). `halo` = glowing yellow torus above the head.

## sets.ts contract
```ts
export type SetName = "throne" | "office" | "diner" | "lab" | "stall" | "field" | "ring" | "track" | "graveyard" | "boardroom" | "street" | "beach";
export type SetObj = { root: THREE.Group; lights: THREE.Light[]; fog?: THREE.Fog; bg: string; spots: Record<string, [number, number, number]> };
```
`spots`: named positions (e.g. `seat` on the throne, `counter`, `desk`, `side`) that the lead places characters at.
Each set dense and art-directed, roughly what a viewer sees in a 9:16 frame from 2-12 m in front of the origin:
- throne: dark purple hall; a big throne made of stacked black GPU boxes with glowing green slits and round fan
  discs, a glowing gold orb on top, a seat at `seat` (~0.55 m high); neon-green trim; pillars; a black banner board
  high on the back wall (blank, lead adds text); heaps of gold coins (instanced cylinders) on the floor; a red rug.
- office: teal walls, grey tiled floor, desks with monitors (emissive screens), office chairs, filing cabinets,
  a cork board with paper notes, a wall clock, plants, ceiling light panels, big window wall at the back.
- diner: retro diner, red booths, white tables, yellow/red sign board (blank), pendant lamps, tiled floor, window.
- lab: teal lab, white counters, screens on the wall, shelves of bottles, a big blank sign board.
- stall: a wooden market stall with striped awning, shelves of products (black boxes with green slits),
  a counter in front of `counter`, a cash register, a lantern; purple ground outside.
- field: purple night ground with gold nuggets and rocks, wooden lantern posts, cliffs behind, a moon.
- ring: boxing ring (posts, ropes red/white/green) under spotlights, dark arena with rows of tiny crowd blobs.
- track: race track asphalt with white lines, kerbs red/white, grandstand with crowd blobs, finish gantry.
- graveyard: purple dusk, a dead tree, grass tufts, a tombstone at `stone` (blank face; lead adds text), dirt mound.
- boardroom: long wooden table with chairs, teal walls, a screen on the wall, glass wall.
- street: night city street, buildings with lit windows, lamp posts, a pavement.
- beach: sand, sea, red beach umbrella, cooler, sky with sun.
Blank signs/screens: expose them as `spots` too (e.g. `banner`, `screen`) so the lead can place text cards there.

## Acts (Nov 16, Sam: "he hasn't played basketball": actions must really happen, with the ball/hoop/opponent, not mimed)
A shot may carry `act: { kind: string; at?: [x,y,z] }`. An act is a tiny scripted scene around the hero for that shot.

```ts
// toon/src/videos/afterhour/acts/types.ts (owned by worker A)
export type ActCtx = { root: THREE.Group; hero: Char; heroAt: [number, number, number]; set: SetName;
  spots: Record<string, [number, number, number]>; seed: number };
export type ActRun = { tick(t: number): Pose | void };          // t = seconds into the shot; may override the hero pose per frame
export type ActDef = { pose: Pose; view?: string; build(ctx: ActCtx): ActRun };
```
- `Char.hand(side: "l" | "r"): THREE.Object3D` (worker A adds to char.ts): the hand mesh, so props can be parented to it
  or placed at its world position (`getWorldPosition`).
- Registry `acts/index.ts` (worker A) merges `SPORTS` from `acts/sports.ts` (A) and `DAILY` from `acts/daily.ts` (C).
- Ah.tsx (A) builds the act once per shot (cache like `build()`), calls `tick(tl)` every frame, uses its pose override,
  and uses `def.view` (usually "wide") unless the shot has an explicit `cam`.
- Everything deterministic (t and seed only), cel style (toonMat + outline), objects big enough to read on a phone.
Kinds: sports (A) dribble, shoot, dunk, block, pass, layup, kick, punch, sprint, trophy_lift;
daily (C) eat, drink, phone_call, type_laptop, count_cash, sign_contract, drive_car, throw_cash, present_chart, unbox.
Pipeline (worker B): `pipeline/ah_actions.pick_act(line, things, place, ...)` -> kind or None; `toon.ah_shots` writes `act`.

## Eating (Nov 16, Sam: "I want to see a mouth open ... make it look like he's eating")
- New face expressions in char.ts (worker G): "bite" (mouth WIDE open, round, teeth top and bottom, eyes happy-squint),
  "chew_a" / "chew_b" (mouth closed and wavy, both cheeks puffed out; a and b alternate fast so the jaw reads as chewing),
  "gulp" (mouth closed small, eyes wide, a little throat bump), "yum" (eyes closed happy, tongue licking the lips),
  "sip" (lips pursed small "o" for a straw/cup). Optional 3D cheek bulges shown for chew_a/b. Add them to the Expr type.
- `Char.mouth(): THREE.Vector3` (worker G): world position of the mouth centre (front of the head, ~0.12 below head centre),
  so food can be brought exactly to it.
- Bitten food (worker H, acts/daily.ts eat + drink): food is brought to `mouth()`, the face goes "bite" ~0.15 s BEFORE
  contact, the food goes slightly INTO the mouth, comes away with a visible bite missing (a semicircle notch: swap to a
  pre-built bitten model or hide wedge pieces), crumbs fly, then chew_a/chew_b alternate ~6 Hz for ~0.6 s, then gulp/yum.
  2 bites per act. Expressions are returned from tick via ActPose.expr.
- More foods (worker I, new file acts/food.ts exporting FOOD): eat_pizza (slice, cheese stretches on the bite),
  eat_fries (one fry at a time), eat_icecream (lick), eat_donut, drink_soda (straw sip, cheeks hollow), each with real bite
  states using the same expressions and `mouth()`.

## Act quality bar (Nov 16, Sam after the eating faces: "it should be like that for everything")
Every act, existing or new, must meet the eating standard:
1. CONTACT: the object really touches its target (food inside the open mouth, ball through the net, pen on paper leaving ink,
   hammer on the board, hand on the bell rope, card on the reader). No hovering, no miming.
2. FACE IN SYNC: the expression changes with the action's phases via ActPose.expr: anticipation (eager/focus) -> the action
   (bite / shout / effort / wince) -> the result (smug / yum / shock / laugh). New faces for this: "effort" (gritted teeth,
   squeezed eyes), "shout" (huge open yell), "focus" (tongue out the side, narrowed eyes).
3. BEFORE -> AFTER is visible: a bite missing, a signature on the page, the net swishing, a taller gold stack, cut ribbon halves,
   a broken tape, a chart that ends higher. The viewer sees what changed.
4. Readable on a phone from the act's camera; the hero's face visible in 3/4 front most frames; one hoop/ball/prop, never a duplicate.
