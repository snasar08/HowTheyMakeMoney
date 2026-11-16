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
