// Nov 19 (Sam: "replicate almost exactly ... the look the movement"): the flat 2D film character.
// Style target = the Day One Films hero (breakdown: C:\Users\rsn\tools\dayone-breakdown\8atK0pF4oJY.md sections 2-3):
//  - head + torso are ONE cream egg (no neck, head ~1/3 of the height, head a little wider than the body),
//  - limbs are uniform rubber-hose tubes (~8.6% of the height) with round ends, no hands / feet,
//  - flat fill, ~3 px near-black outline (scale-relative), far limbs a shade darker,
//  - tiny dot eyes, under-eye bags, short bar brows, short line mouth; angry/effort = grit teeth,
//  - idle motion updates on threes (10 fps), action motion every frame (30 fps).
// Villain (look.monster): pure black humanoid, big round head, red rim glow, red slit eyes + thin red grin.
// Everything is SVG capsules/circles so it renders in a few ms per frame.
//
// Units: px at scale 1, origin = between the feet on the floor, y down (SVG).
import React from "react";

export type Expr = "neutral" | "smile" | "grin" | "sad" | "cry" | "angry" | "tired" | "shock" | "determined" | "scared" | "sleep";
/** band / headband: true or a colour = red headband with two tails; monster = black villain; ghost = tiny dim red outline only (defeated);
 *  size = monster height factor (default 1.4); grin:false = no red grin on the monster;
 *  blackHand = the pose "hand" (giant arm) stays a black glowing villain arm even for a monster look; otherwise the giant arm is always cream
 *  skin with an ink outline (the hero's hand), also for look.monster. */
export type Look = { skin?: string; band?: string | boolean; headband?: boolean; cap?: string; tie?: string; monster?: boolean; ghost?: boolean; size?: number; grin?: boolean; blackHand?: boolean };

/** a pose: angles in degrees, 0 = limb hanging straight down, + = towards the way he faces */
export type Pose = {
  hipY?: number;      // hip height above the floor (default 74 = standing)
  hipX?: number;
  lean?: number;      // torso angle from vertical, + = forward
  head?: number;      // head tilt (deg), + = forward/down
  headY?: number;     // extra head drop (slump)
  aF?: [number, number]; aB?: [number, number];   // arms front / back: [shoulder, elbow]
  lF?: [number, number]; lB?: [number, number];   // legs front / back: [hip, knee]
  rot?: number;       // whole body rotation (lying = 90)
  lift?: number;      // raise the whole body (lying on the floor: half the body thickness)
  hand?: boolean;     // villain's giant arm reaching in from the top-right corner (x,y = where the fist ends up when reach = 1)
  reach?: number;     // 0..1 how far the giant arm has come in
  slap?: { x: number; y: number; fist: boolean; glow: number };   // hand coming in from the bottom-right (alarm slap): fist tip offset from the anchor, closed fist, glow 0..1
  face?: number;      // extra tilt of the face (deg), e.g. push-ups: the face follows the body a bit
};

const LEG = [38, 36], ARM = [34, 34];
const SH = 64;          // shoulder distance from the hip along the torso
const HD = 44;          // shoulder -> head centre
const LIMB = 18;        // tube width (8.6% of ~215)
const LINE = 2.3;       // outline half-width each side (scale-relative, ~3 px at the ref's size)
export const OUTLINE = "#8f8c86";   // grey outline of the props / furniture (sets.tsx)
export const SKIN = "#DCD8CA", SKIN_FAR = "#b9b5a6", INK = "#101010", RED = "#EF4E3A";

const rad = (d: number) => (d * Math.PI) / 180;
const S = Math.sin, C = Math.cos;
const tw = (t: number, p: number, ph = 0) => S((t / p + ph) * 2 * Math.PI);
const q10 = (t: number) => Math.floor(t * 10 + 1e-6) / 10;   // idle motion updates on threes (10 fps)
const sm = (x: number) => x * x * (3 - 2 * x);
const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/** a pose for name at time t (seconds, looping motions) */
export const pose = (name: string, t: number, punchPeriod = 1.25): Pose => {
  const ti = q10(t), b = tw(ti, 3.2) * 1.2;   // breathing, on threes
  switch (name) {
    case "walk": {   // 20 frame cycle, 2% bob
      const p = 20 / 30, s = tw(t, p), c = tw(t, p, 0.25);
      return { hipY: 72 + Math.abs(c) * 4, lean: 4, lF: [s * 28, -Math.max(0, c) * 38], lB: [-s * 28, -Math.max(0, -c) * 38], aF: [-s * 24, 16], aB: [s * 24, 16], head: 2 };
    }
    case "trudge": {
      const p = 1.4, s = tw(t, p), c = tw(t, p, 0.25);
      return { hipY: 72, lean: 12, head: 14, headY: 4, lF: [s * 16, -Math.max(0, c) * 24], lB: [-s * 16, -Math.max(0, -c) * 24], aF: [-s * 8, 6], aB: [s * 8, 6] };
    }
    case "run": {    // side view, forward lean, 12 frame stride (ref), in place
      const p = 0.4, s = tw(t, p), c = tw(t, p, 0.25);
      return { hipY: 68 + Math.abs(c) * 5, lean: 16, lF: [s * 50, -(18 + Math.max(0, c) * 72)], lB: [-s * 50, -(18 + Math.max(0, -c) * 72)], aF: [-s * 55, 92], aB: [s * 55, 92], head: 2 };
    }
    case "sit":
      return { hipY: 44 + b * 0.3, lean: 4, lF: [82, -82], lB: [78, -78], aF: [22, 34], aB: [16, 34], head: 4 };
    case "bedge":   // on the edge of the bed, hands on knees, head a little down
      return { hipY: 44 + b * 0.3, lean: 10, head: 10, lF: [82, -82], lB: [78, -78], aF: [38, 30], aB: [30, 30] };
    case "slump":   // sitting on the edge, head hanging
      return { hipY: 44, lean: 22, head: 26, headY: 6, lF: [78, -78], lB: [72, -72], aF: [30, 40], aB: [26, 40] };
    case "hug": case "fetal":    // on the floor, knees up, arms round them, head down
      return { hipY: 17 + b * 0.2, lean: 30, head: 24, headY: 2, lF: [128, -152], lB: [122, -148], aF: [20, 100], aB: [8, 100] };
    case "lie":     // on his back (in bed): the bed draws the blanket over him
      return { rot: -90, hipY: 100, lean: 0, aF: [6, 0], aB: [-6, 0], lF: [0, 0], lB: [0, 0], head: -6 + b };
    case "floor":   // face down on the floor, worn out
      return { rot: 86, lift: 24, hipY: 74, head: -40, aF: [150, 20], aB: [-10, 0], lF: [4, 0], lB: [-4, 6] };
    case "phone":
      return { hipY: 74, lean: 6 + b * 0.3, head: 14, lF: [2, 0], lB: [-2, 0], aF: [80, 90], aB: [10, 20] };
    case "phonesit": case "sofaphone":   // slouched back on the couch, legs forward, phone by his face
      return { hipY: 35 + b * 0.3, lean: -14, head: 20, lF: [64, -6], lB: [58, -4], aF: [80, 92], aB: [24, 40] };
    case "desk":    // sitting at a desk, writing
      return { hipY: 44, lean: 18, head: 16, lF: [84, -84], lB: [80, -80], aF: [70 + tw(ti, 0.5) * 6, 40], aB: [60, 40] };
    case "sleepdesk": case "deskslump":   // face down on the desk, one arm reaching forward
      return { hipY: 44 + b * 0.2, lean: 60, head: 22, headY: 4, lF: [84, -84], lB: [80, -80], aF: [96, -6], aB: [60, 40] };
    case "punch": {   // wind-up 10 f, extension 3 f, hold 4 f, return 12 f, then guard (one bar = 2.5 s in the ref; default 1.25 s,
      // per beat arg.punch = period in seconds, e.g. 2.5; the motion itself always takes 28.5 f, the rest of the period is the guard)
      const f = (t % Math.max(0.95, punchPeriod)) * 30;
      const wind = f < 10 ? sm(f / 10) : f < 12.5 ? 1 - sm((f - 10) / 2.5) : 0;
      const ext = f >= 10 && f < 12.5 ? sm((f - 10) / 2.5) : f < 16.5 && f >= 12.5 ? 1 : f >= 16.5 && f < 28.5 ? 1 - sm((f - 16.5) / 12) : 0;
      const hit = ext;
      return { hipY: 68 + hit * 2, lean: 10 + hit * 8 - wind * 4, head: 4, lF: [30, -30 - hit * 8], lB: [-24, 8], aF: [38 + hit * 58 - wind * 10, 128 - hit * 128 + wind * 12], aB: [34, 122 + wind * 10] };
    }
    case "pushup": case "crawl": {
      const k = (tw(t, 1.1) + 1) / 2;
      return { rot: 64 - k * 6, hipY: 74, lean: -3, head: 6, face: 26, aF: [64 - k * 6, 0], aB: [60 - k * 6, 0], lF: [0, 0], lB: [0, 0] };
    }
    case "climb": case "stairs": {   // 19 frame cycle = one step
      const p = 19 / 30, s = tw(t, p), c = tw(t, p, 0.25);
      return { hipY: 64 + Math.abs(c) * 4, lean: 22, lF: [34 + s * 30, -(30 + Math.max(0, c) * 34)], lB: [34 - s * 30, -(30 + Math.max(0, -c) * 34)], aF: [-s * 40 + 20, 70], aB: [s * 40 + 20, 70], head: 0 };
    }
    case "cheer":
      return { hipY: 74 + Math.abs(tw(t, 0.6)) * 8, lean: -4, aF: [170 + tw(t, 0.6) * 8, -10], aB: [-170 - tw(t, 0.6) * 8, 10], lF: [6, 0], lB: [-6, 0], head: -8 };
    case "point": case "summit":   // standing tall, one arm straight out in front
      return { hipY: 74 + b * 0.3, lean: 2, head: -2, aF: [92 + b, 0], aB: [-6, 10], lF: [4, 0], lB: [-6, 0] };
    case "facepalm":
      return { hipY: 74, lean: 10, head: 20, headY: 3, aF: [80, 120], aB: [8, 10], lF: [2, 0], lB: [-2, 0] };
    case "shoot": {   // basketball jump shot loop: dip, rise, release
      const u = (t % 1.6) / 1.6, up = u < 0.3 ? -u / 0.3 : u < 0.55 ? (u - 0.3) / 0.25 : 1 - (u - 0.55) / 0.45;
      const dip = Math.max(0, -up), air = Math.max(0, up);
      return { hipY: 74 - dip * 12 + air * 18, lean: -2, lF: [dip * 34, -dip * 60], lB: [dip * 28, -dip * 52], aF: [96 + air * 60, 20 - air * 30], aB: [88 + air * 56, 24 - air * 30], head: -10 - air * 6 };
    }
    case "dribble": {
      const k = tw(t, 0.45);
      return { hipY: 66, lean: 14, lF: [26, -34], lB: [-20, -6], aF: [24 + k * 12, 18 - k * 10], aB: [-14, 28], head: 0 };
    }
    case "count":   // counting money in his hands
      return { hipY: 74, lean: 8, head: 18, aF: [58, 84 + tw(ti, 0.35) * 8], aB: [48, 92], lF: [2, 0], lB: [-2, 0] };
    case "kneel":
      return { hipY: 40, lean: 14, head: 16, lF: [90, -90], lB: [0, -100], aF: [30, 20], aB: [20, 20] };
    case "reach":   // reaching out to an alarm clock / shelf in front of him
      return { hipY: 74, lean: 20, aF: [100, 0], aB: [20, 10], lF: [10, 0], lB: [-10, 0] };
    case "stretch":
      return { hipY: 74, lean: -6, aF: [175, 0], aB: [-175, 0], lF: [4, 0], lB: [-4, 0], head: -10 };
    case "sad": case "standsad":   // standing, head hung, arms limp
      return { hipY: 74 + b * 0.3, lean: 6, head: 20 + b, headY: 3, lF: [3, 0], lB: [-3, 0], aF: [4, 12], aB: [-3, 10] };
    case "monster":   // the inner voice: tall, still, slight sway
      return { hipY: 74, lean: 4 + tw(ti, 2.6) * 3, head: 6, aF: [20 + tw(ti, 2.1) * 6, 20], aB: [-12, 20], lF: [4, 0], lB: [-4, 0] };
    case "loom":      // monster leaning over him, arms out
      return { hipY: 74, lean: 18, head: 14, aF: [96 + tw(t, 1.7) * 10, 30], aB: [70, 40], lF: [8, 0], lB: [-8, 0] };
    case "peek":      // monster peeking over a sofa / chair back, one hand up
      return { hipY: 62, lean: 20, head: 10, aF: [150 + tw(ti, 1.3) * 12, 40], aB: [20, 30], lF: [6, 0], lB: [-6, 0] };
    case "lurk":      // monster standing behind him, hand on the chair
      return { hipY: 74, lean: 12, head: 8, aF: [70, 10], aB: [-6, 20], lF: [6, 0], lB: [-6, 0] };
    case "slap": {   // alarm slap (ref 63-66 s): the open hand sweeps in from the right to hover over the clock (0.6 s), bobs, closes into a glowing fist at ~2.05 s, leaves by 2.9 s
      const e = (u: number) => 1 - (1 - cl(u)) ** 2, hov = t >= 0.6 && t < 2.0 ? 9 * S((t - 0.6) * 11) : 0;
      let x = 485 * (1 - e(t / 0.6)), y = 180 * (1 - e(t / 0.6)) + hov;
      if (t >= 2.3) { const u = cl((t - 2.3) / 0.55); x = 535 * u * u; y = 190 * u * u; }
      return { hand: true, reach: 1, slap: { x, y, fist: t >= 2.0, glow: t >= 2.0 && t < 2.35 ? 1 - (t - 2.0) / 0.35 : 0 } };
    }
    case "hand": {    // giant arm reaching in from the top-right corner (x,y = fist at full reach)
      const r = 0.55 + 0.45 * sm((tw(t, 3.4) + 1) / 2);
      return { hand: true, reach: r };
    }
    default:          // stand
      return { hipY: 74 + b * 0.5, lean: 1, head: 2 + b, lF: [3, 0], lB: [-3, 0], aF: [6 + b, 8], aB: [-6, 8] };
  }
};

type Pt = { x: number; y: number };

/** the skeleton of a pose: hip, shoulder, head centre */
const geo = (p: Pose, dir: number) => {
  const hx = p.hipX ?? 0, hy = -(p.hipY ?? 74), lean = p.lean ?? 0;
  const sh: Pt = { x: hx + S(rad(lean)) * SH * dir, y: hy - C(rad(lean)) * SH };
  const ha = rad(lean + (p.head ?? 0) * 0.8);
  const hc: Pt = { x: sh.x + S(ha) * HD * dir, y: sh.y - C(ha) * HD + (p.headY ?? 0) };
  return { hx, hy, sh, hc, hang: lean + (p.head ?? 0) * 0.8 };
};

/** rubber hose: the elbow / knee is a smooth bend (rounded corner), not a hinge */
const hose = (x: number, y: number, a0: number, a1: number, L: number[], dir: number) => {
  const x1 = x + S(rad(a0)) * L[0] * dir, y1 = y + C(rad(a0)) * L[0];
  const x2 = x1 + S(rad(a0 + a1)) * L[1] * dir, y2 = y1 + C(rad(a0 + a1)) * L[1];
  const k = Math.min(0.5, 0.2 + Math.abs(a1) / 260);
  const ax = x1 + (x - x1) * k, ay = y1 + (y - y1) * k, bx = x1 + (x2 - x1) * k, by = y1 + (y2 - y1) * k;
  return `M ${x} ${y} L ${ax} ${ay} Q ${x1} ${y1} ${bx} ${by} L ${x2} ${y2}`;
};

/** hand position of the front arm (to attach phones, money, balls) */
export const handOf = (p: Pose, dir: number) => {
  const g = geo(p, dir), [a0, a1] = p.aF ?? [0, 0];
  const x1 = g.sh.x + S(rad(a0)) * ARM[0] * dir, y1 = g.sh.y + C(rad(a0)) * ARM[0];
  return { x: x1 + S(rad(a0 + a1)) * ARM[1] * dir, y: y1 + C(rad(a0 + a1)) * ARM[1] };
};

/** centre of the head in the character's own frame (x,y px relative to the feet, rotation of a lying pose applied; scale 1) */
export const headOf = (p: Pose, dir: number) => {
  const g = geo(p, dir), r = rad((p.rot ?? 0) * dir), c = Math.cos(r), s = Math.sin(r);
  return { x: g.hc.x * c - g.hc.y * s, y: g.hc.x * s + g.hc.y * c - (p.lift ?? 0) };
};

const WHITE = "#f4f2ea";

const Face: React.FC<{ e: Expr; f: number; t: number; band: boolean; mon?: boolean; grin?: boolean }> = ({ e, f, t, band, mon, grin = true }) => {
  if (mon) {   // two red slit eyes (scowl) + a thin red grin
    return <g stroke="#ff3a2a" strokeLinecap="round" fill="none">
      <path d={`M ${f * 6} -9 L ${f * 19} -2`} strokeWidth={4} />
      <path d={`M ${f * 26} -2 L ${f * 38} -9`} strokeWidth={4} />
      {grin && e !== "sad" ? <path d={`M ${f * 8} 14 Q ${f * 24} 28 ${f * 38} 12`} strokeWidth={2.6} /> : null}
    </g>;
  }
  const blink = (t % 4.3) > 4.2 && e !== "angry" && e !== "determined";
  const ex = [f * 9, f * 25], ey = 1, mx = f * 17, my = 16;
  const grit = e === "angry" || e === "determined";
  const closed = e === "sleep" || blink;
  const lidded = e === "tired" || e === "sad" || e === "cry";
  const big = e === "shock" || e === "scared";
  const sw = { stroke: INK, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const eye = (x: number, i: number) => {
    if (closed) return <path key={i} d={`M ${x - 5} ${ey - 1} q 5 4.5 10 0`} strokeWidth={2.2} {...sw} />;
    if (big) return <g key={i}><circle cx={x} cy={ey} r={5.5} fill="#fff" stroke={INK} strokeWidth={1.6} /><circle cx={x + f * 0.6} cy={ey} r={1.9} fill={INK} /></g>;
    if (grit) return <g key={i}><circle cx={x} cy={ey + 1.5} r={2.6} fill={INK} /><path d={`M ${x - 5} ${ey + 4.5} q 5 2 10 0`} strokeWidth={1.2} {...sw} /></g>;
    return <g key={i}>
      <circle cx={x} cy={ey + (lidded ? 1.4 : 0)} r={2.9} fill={INK} />
      {lidded && <path d={`M ${x - 5.5} ${ey - 0.6} L ${x + 5.5} ${ey - 0.6}`} strokeWidth={2.2} {...sw} />}
      <path d={`M ${x - 4.5} ${ey + 5.5} q 4.5 3.2 9 0`} strokeWidth={1.2} {...sw} />
    </g>;
  };
  const brow = (x: number, i: number) => {
    const w = 5.5, y = -9;
    if (e === "sad" || e === "cry" || e === "tired" || e === "scared") return <path key={"b" + i} d={`M ${x - w * f} ${y + 1.5} L ${x + w * f} ${y - 1.5}`} strokeWidth={2.6} {...sw} />;
    if (e === "shock") return <path key={"b" + i} d={`M ${x - w * f} ${y - 5} q ${w * f} -4 ${2 * w * f} 0`} strokeWidth={2.4} {...sw} />;
    return <path key={"b" + i} d={`M ${x - w * f} ${y} L ${x + w * f} ${y}`} strokeWidth={2.6} {...sw} />;
  };
  // brows: for the angry look both brows slant down towards the front (the ref hero faces the way the nose points): inner end low
  const brows = ex.map((x, i) => {
    const w = 5.5;
    if (grit) {
      // near eye (i=0, towards the back of the head) slants down towards the front, far eye mirrored: both dip towards the middle
      const a = i === 0 ? [x - w * f, -12.5, x + w * f, -6.5] : [x - w * f, -6.5, x + w * f, -12.5];
      return <path key={"b" + i} d={`M ${a[0]} ${a[1]} L ${a[2]} ${a[3]}`} strokeWidth={3.6} {...sw} />;
    }
    return brow(x, i);
  });
  const mouths: Record<Expr, React.ReactNode> = {
    neutral: <path d={`M ${mx - 5} ${my} L ${mx + 5} ${my}`} strokeWidth={2.2} {...sw} />,
    smile: <path d={`M ${mx - 6} ${my - 1} q 6 5 12 0`} strokeWidth={2.2} {...sw} />,
    grin: <g><path d={`M ${mx - 8} ${my - 3} q 8 12 16 0 z`} fill={WHITE} stroke={INK} strokeWidth={2} strokeLinejoin="round" /><path d={`M ${mx - 6} ${my + 0.5} L ${mx + 6} ${my + 0.5}`} stroke={INK} strokeWidth={1} /></g>,
    sad: <path d={`M ${mx - 5} ${my + 2} q 2.5 -3 5 0 q 2.5 -3 5 0`} strokeWidth={2} {...sw} />,
    cry: <path d={`M ${mx - 6} ${my + 3} q 6 -6 12 0`} strokeWidth={2.2} {...sw} />,
    angry: null, determined: null,
    tired: <path d={`M ${mx - 5} ${my + 1} q 2.5 -2 5 0 q 2.5 2 5 0`} strokeWidth={2} {...sw} />,
    shock: <ellipse cx={mx} cy={my + 1} rx={3.6} ry={4.8} fill="#2a1a1a" stroke={INK} strokeWidth={1.8} />,
    scared: <path d={`M ${mx - 6} ${my + 1} q 2 -3 4 0 q 2 3 4 0 q 2 -3 4 0`} strokeWidth={2} {...sw} />,
    sleep: <path d={`M ${mx - 4} ${my} q 4 2.5 8 0`} strokeWidth={2} {...sw} />,
  };
  const tw0 = 21, th0 = 11, tx = mx - (tw0 / 2) * 1, ty = my - 5;
  const teeth = <g>
    <rect x={tx} y={ty} width={tw0} height={th0} rx={3} fill={WHITE} stroke={INK} strokeWidth={2} />
    <path d={`M ${tx + 5.2} ${ty + 0.5} v ${th0 - 1} M ${tx + 10.5} ${ty + 0.5} v ${th0 - 1} M ${tx + 15.8} ${ty + 0.5} v ${th0 - 1} M ${tx + 1} ${ty + th0 / 2} h ${tw0 - 2}`} stroke={INK} strokeWidth={1.1} />
  </g>;
  return <g>
    {ex.map((x, i) => eye(x, i))}
    {brows}
    {grit ? teeth : mouths[e]}
    {grit && !band ? <path d={`M ${f * 14} -20 l ${f * 4} 3 M ${f * 14} -17 l ${f * 4} -3 M ${f * 24} -19 l ${f * 3} 2`} stroke={INK} strokeWidth={1.4} strokeLinecap="round" /> : null}
    {e === "cry" && <path d={`M ${ex[0] - 1} ${ey + 8} q -3 8 0 12 q 3 -4 0 -12`} fill="#8fd0ff" opacity={0.95} />}
    {e === "scared" && <path d={`M ${-f * 18} -16 q -4 7 0 10 q 4 -3 0 -10`} fill="#9fd4ff" opacity={0.9} />}
  </g>;
};

/** soft red rim glow around the villain (additive look): bright 1-2 px edge, exponential falloff */
const MonDefs: React.FC = () => (
  <defs>
    <filter id="rigMonGlow" x="-90%" y="-60%" width="280%" height="220%" colorInterpolationFilters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="d" />
      <feFlood floodColor="#E0402E" floodOpacity="0.7" result="c1" /><feComposite in="c1" in2="d" operator="in" result="rim" />
      <feGaussianBlur in="d" stdDeviation="5" result="b1" /><feFlood floodColor="#E03020" floodOpacity="0.6" result="c2" /><feComposite in="c2" in2="b1" operator="in" result="g1" />
      <feGaussianBlur in="d" stdDeviation="16" result="b2" /><feFlood floodColor="#B01810" floodOpacity="0.5" result="c3" /><feComposite in="c3" in2="b2" operator="in" result="g2" />
      <feGaussianBlur in="d" stdDeviation="42" result="b3" /><feFlood floodColor="#701008" floodOpacity="0.55" result="c4" /><feComposite in="c4" in2="b3" operator="in" result="g3" />
      <feMerge><feMergeNode in="g3" /><feMergeNode in="g2" /><feMergeNode in="g1" /><feMergeNode in="rim" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
);

/** the character: x/y = feet on the floor, dir = 1 faces right */
export const Guy: React.FC<{ p: Pose; e: Expr; dir?: number; t: number; look?: Look; scale?: number; x?: number; y?: number; dim?: number }> = ({ p, e, dir = 1, t, look = {}, scale = 1, x = 0, y = 0, dim = 0 }) => {
  const mon = !!look.monster || !!look.ghost, ghost = !!look.ghost;
  const sc = scale * (mon ? look.size ?? 1.1 : 1);
  const skin = mon ? (ghost ? "#0b0b0b" : "#040404") : look.skin ?? SKIN;
  const far = mon ? skin : SKIN_FAR;
  const line = mon ? (ghost ? "#8a2a22" : "#040404") : INK;
  const lw = ghost ? 1.6 : LINE;
  const filt = mon && !ghost ? "url(#rigMonGlow)" : undefined;
  const wrap = (kids: React.ReactNode, plain = false) => <g transform={`translate(${x} ${y - (p.lift ?? 0) * scale}) scale(${sc}) rotate(${(p.rot ?? 0) * dir})`} filter={plain ? undefined : filt} opacity={(1 - dim) * (ghost ? 0.75 : 1)}>{mon && !ghost && !plain ? <MonDefs /> : null}{kids}</g>;

  if (p.hand) {   // the giant arm: from off the top-right corner down to the fist at (0,0) when reach = 1
    const r = p.reach ?? 1, sl = p.slap, off = sl ? { x: (sl.x + 800) * dir, y: sl.y + 500 } : { x: 560 * dir, y: -700 };
    const tip = sl ? { x: sl.x * dir, y: sl.y } : { x: (1 - r) * 120 * dir, y: -(1 - r) * 260 };
    const el = sl ? { x: (off.x + tip.x) / 2, y: (off.y + tip.y) / 2 } : { x: (off.x + tip.x) / 2 - 90 * dir, y: (off.y + tip.y) / 2 + 40 };
    const arm = `M ${off.x} ${off.y} Q ${el.x} ${el.y} ${tip.x} ${tip.y}`;
    // cream arm + fist with an ink outline (look.blackHand keeps the old black glowing villain arm)
    const black = mon && !!look.blackHand, hs = black ? skin : look.skin ?? SKIN, hl = black ? line : INK, ow = black ? 0 : 3.4, fing = (sl?.fist ? [] : [-34, -12, 12, 34]).map((o, i) => ({ cx: tip.x - 4 * dir + o * dir * 0.3, cy: tip.y + 40 + (i % 2) * 6 }));
    return wrap(<g>
      {sl && sl.glow > 0 && <circle cx={tip.x} cy={tip.y} r={150} fill="url(#g-ffd27a)" opacity={sl.glow} />}
      <path d={arm} stroke={hl} strokeWidth={86 + ow * 2} strokeLinecap="round" fill="none" />
      <ellipse cx={tip.x} cy={tip.y} rx={58 + ow} ry={50 + ow} fill={hl} />
      {fing.map((q, i) => <ellipse key={"o" + i} cx={q.cx} cy={q.cy} rx={13 + ow} ry={22 + ow} fill={hl} />)}
      <path d={arm} stroke={hs} strokeWidth={86} strokeLinecap="round" fill="none" />
      <ellipse cx={tip.x} cy={tip.y} rx={58} ry={50} fill={hs} />
      {fing.map((q, i) => <ellipse key={"f" + i} cx={q.cx} cy={q.cy} rx={13} ry={22} fill={hs} stroke={ow ? hl : undefined} strokeWidth={ow ? 2.2 : 0} />)}
      {sl?.fist && <path d={`M ${tip.x - 34 * dir} ${tip.y - 12} l ${30 * dir} 4 M ${tip.x - 34 * dir} ${tip.y + 6} l ${30 * dir} 4 M ${tip.x - 30 * dir} ${tip.y + 24} l ${26 * dir} 3`} stroke={hl} strokeWidth={3} fill="none" strokeLinecap="round" />}
      {ow > 0 && <path d={`M ${tip.x - 40 * dir} ${tip.y + 34} q ${34 * dir} 10 ${80 * dir} 0`} stroke={hl} strokeWidth={2} fill="none" opacity={0.5} />}
    </g>, !black);
  }

  const g = geo(p, dir);
  const lF = p.lF ?? [0, 0], lB = p.lB ?? [0, 0], aF = p.aF ?? [0, 0], aB = p.aB ?? [0, 0];
  const lw2 = mon ? 15 : LIMB, aw = mon ? 13 : LIMB - 1;
  const tube = (d: string, w: number, fill: string, key: string) => <g key={key}>
    <path d={d} stroke={line} strokeWidth={w + lw * 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d={d} stroke={fill} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </g>;
  // the egg: a chain of circles from the hip up to the neck, then the head
  const R0 = mon ? 21 : 26, R1 = mon ? 23 : 28, RN = mon ? 20 : 31, hrx = mon ? 33 : 36, hry = mon ? 32 : 33;   // villain: slimmer body, round head (ref)
  const ux = S(rad(p.lean ?? 0)) * dir, uy = -C(rad(p.lean ?? 0));
  const base: Pt = { x: g.hx + ux * 14, y: g.hy + uy * 14 };
  const circles: { x: number; y: number; r: number }[] = [];
  const nb = 9, nn = 6;
  for (let i = 0; i <= nb; i++) { const k = i / nb; circles.push({ x: base.x + (g.sh.x - base.x) * k, y: base.y + (g.sh.y - base.y) * k, r: R0 + (R1 - R0) * k }); }
  for (let i = 1; i <= nn; i++) { const k = i / nn; circles.push({ x: g.sh.x + (g.hc.x - g.sh.x) * k, y: g.sh.y + (g.hc.y - g.sh.y) * k, r: R1 + (RN - R1) * sm(k) }); }
  const hangDeg = g.hang * dir;
  const egg = <g key="egg">
    {circles.map((c, i) => <circle key={"o" + i} cx={c.x} cy={c.y} r={c.r + lw} fill={line} />)}
    <ellipse cx={g.hc.x} cy={g.hc.y} rx={hrx + lw} ry={hry + lw} fill={line} transform={`rotate(${hangDeg} ${g.hc.x} ${g.hc.y})`} />
    {circles.map((c, i) => <circle key={"f" + i} cx={c.x} cy={c.y} r={c.r} fill={skin} />)}
    <ellipse cx={g.hc.x} cy={g.hc.y} rx={hrx} ry={hry} fill={skin} transform={`rotate(${hangDeg} ${g.hc.x} ${g.hc.y})`} />
  </g>;
  const lying = Math.abs(p.rot ?? 0) > 45 ? p.rot ?? 0 : 0;
  const faceRot = (g.hang - lying + (p.face ?? 0)) * dir;
  const band = !mon && (!!look.headband || !!look.band);
  const bandCol = typeof look.band === "string" ? look.band : RED;
  const fl = Math.sin(t * 9) * 3, fl2 = Math.sin(t * 9 + 1.7) * 3;
  const head = <g key="head" transform={`translate(${g.hc.x} ${g.hc.y}) rotate(${faceRot})`}>
    {band && <g>
      <path d={`M ${-dir * 32} -13 q ${-dir * 14} ${-1 + fl} ${-dir * 28} ${4 + fl2} M ${-dir * 32} -17 q ${-dir * 12} ${-5 + fl2} ${-dir * 24} ${-9 + fl}`} stroke={INK} strokeWidth={9} strokeLinecap="round" fill="none" />
      <path d={`M ${-dir * 32} -13 q ${-dir * 14} ${-1 + fl} ${-dir * 28} ${4 + fl2} M ${-dir * 32} -17 q ${-dir * 12} ${-5 + fl2} ${-dir * 24} ${-9 + fl}`} stroke={bandCol} strokeWidth={5.5} strokeLinecap="round" fill="none" />
      <path d={`M ${-dir * 34} -13 Q 0 -25 ${dir * 33} -13`} stroke={bandCol} strokeWidth={10.5} fill="none" />
    </g>}
    {look.cap && !mon && <path d={`M ${-32} -12 A 33 28 0 0 1 32 -12 Z M ${dir * 10} -12 l ${dir * 30} 2`} fill={look.cap} stroke={look.cap} strokeWidth={6} strokeLinecap="round" />}
    {!ghost && <Face e={e} f={dir} t={t} band={band} mon={mon} grin={look.grin !== false} />}
  </g>;
  const farLeg = tube(hose(g.hx, g.hy, lB[0], lB[1], LEG, dir), lw2, far, "lb");
  const farArm = tube(hose(g.sh.x, g.sh.y + 2, aB[0], aB[1], ARM, dir), aw, far, "ab");
  const nearLeg = tube(hose(g.hx, g.hy, lF[0], lF[1], LEG, dir), lw2, skin, "lf");
  const nearArm = tube(hose(g.sh.x, g.sh.y + 2, aF[0], aF[1], ARM, dir), aw, skin, "af");
  return wrap(<>
    {farLeg}{farArm}{egg}{nearLeg}{head}
    {look.tie && !mon && <path d={`M ${g.sh.x - ux * 6 + dir * 8} ${g.sh.y - uy * 6} l -4 8 l 4 20 l 4 -20 z`} fill={look.tie} stroke={INK} strokeWidth={1.2} />}
    {nearArm}
  </>);
};
