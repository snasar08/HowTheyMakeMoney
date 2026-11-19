// Nov 19 (Sam: "replicate almost exactly ... the look the movement"): the flat 2D film character.
// A soft cream bean with thick rounded limbs and a thin grey hand-drawn outline, seen side-on.
// Our own rig and proportions; drawn as SVG capsules so it renders in a few ms per frame.
//
// Units: px at scale 1, origin = between the feet on the floor, y down (SVG).
import React from "react";

export type Expr = "neutral" | "smile" | "grin" | "sad" | "cry" | "angry" | "tired" | "shock" | "determined" | "scared" | "sleep";
export type Look = { skin?: string; band?: string; cap?: string; tie?: string; monster?: boolean };

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
};

const LEG = [40, 38], ARM = [32, 30], TORSO = 66, HEAD_R = 40, LIMB_W = 22, BODY_W = 50;
export const OUTLINE = "#8f8c86";

const rad = (d: number) => (d * Math.PI) / 180;
const S = Math.sin, C = Math.cos;
const tw = (t: number, p: number, ph = 0) => S((t / p + ph) * 2 * Math.PI);

/** a pose for name at time t (seconds, looping motions) */
export const pose = (name: string, t: number): Pose => {
  const b = tw(t, 3.2) * 1.2;   // breathing
  switch (name) {
    case "walk": {
      const p = 1.0, s = tw(t, p), s2 = tw(t, p, 0.5);
      return { hipY: 74 + Math.abs(tw(t, p / 2)) * 3, lean: 4, lF: [s * 26, Math.max(0, -s) * 30], lB: [-s * 26, Math.max(0, s) * 30], aF: [-s * 22, 14], aB: [s * 22, 14], head: 2 };
    }
    case "trudge": {
      const p = 1.4, s = tw(t, p);
      return { hipY: 72, lean: 12, head: 14, headY: 4, lF: [s * 16, Math.max(0, -s) * 20], lB: [-s * 16, Math.max(0, s) * 20], aF: [-s * 8, 6], aB: [s * 8, 6] };
    }
    case "run": {
      const p = 0.62, s = tw(t, p);
      return { hipY: 70 + Math.abs(tw(t, p / 2)) * 6, lean: 16, lF: [s * 42, 20 + Math.max(0, -s) * 60], lB: [-s * 42, 20 + Math.max(0, s) * 60], aF: [-s * 50, 80], aB: [s * 50, 80], head: 4 };
    }
    case "sit":
      return { hipY: 44 + b * 0.3, lean: 4, lF: [80, -80], lB: [76, -76], aF: [20, 30], aB: [16, 30], head: 4 };
    case "slump":   // sitting on the edge, head hanging
      return { hipY: 44, lean: 22, head: 26, headY: 6, lF: [78, -78], lB: [72, -72], aF: [30, 40], aB: [26, 40] };
    case "hug":     // sitting on the floor hugging his knees
      return { hipY: 16, lean: 18, head: 20, headY: 4, lF: [130, -150], lB: [124, -146], aF: [70, 40], aB: [64, 40] };
    case "lie":     // on his back (in bed): the bed draws the blanket over him
      return { rot: -90, hipY: 74, lean: 0, aF: [6, 0], aB: [-6, 0], lF: [0, 0], lB: [0, 0], head: -6 + b };
    case "floor":   // face down on the floor, worn out
      return { rot: 86, lift: 24, hipY: 74, head: -40, aF: [150, 20], aB: [-10, 0], lF: [4, 0], lB: [-4, 6] };
    case "phone":
      return { hipY: 74, lean: 6 + b * 0.3, head: 14, lF: [2, 0], lB: [-2, 0], aF: [70, 110], aB: [10, 20] };
    case "phonesit":
      return { hipY: 44, lean: 10, head: 16, lF: [80, -80], lB: [76, -76], aF: [62, 116], aB: [24, 30] };
    case "desk":    // sitting at a desk, writing
      return { hipY: 44, lean: 18, head: 16, lF: [84, -84], lB: [80, -80], aF: [70 + tw(t, 0.5) * 6, 40], aB: [60, 40] };
    case "sleepdesk":
      return { hipY: 44, lean: 52, head: 40, lF: [84, -84], lB: [80, -80], aF: [96, 50], aB: [90, 50] };
    case "punch": {
      const p = 0.7, k = Math.max(0, tw(t, p)) ** 0.6, k2 = Math.max(0, -tw(t, p)) ** 0.6;
      return { hipY: 70, lean: 10, lF: [26, -10], lB: [-22, 10], aF: [80 + k * 10, 90 - k * 90], aB: [60 + k2 * 30, 100 - k2 * 100], head: 4 };
    }
    case "pushup": {
      const k = (tw(t, 1.1) + 1) / 2;
      return { rot: 76, lift: 46, hipY: 74, head: -60, aF: [90 - k * 30, -60 + k * 60], aB: [86 - k * 30, -60 + k * 60], lF: [0, 0], lB: [0, 0], hipX: 0 };
    }
    case "climb": {
      const p = 0.9, s = tw(t, p);
      return { hipY: 66, lean: 22, lF: [30 + s * 30, 40 + Math.max(0, s) * 40], lB: [10 - s * 30, 40 + Math.max(0, -s) * 40], aF: [-s * 40 + 20, 70], aB: [s * 40 + 20, 70], head: 0 };
    }
    case "cheer":
      return { hipY: 74 + Math.abs(tw(t, 0.6)) * 8, lean: -4, aF: [170 + tw(t, 0.6) * 8, -10], aB: [-170 - tw(t, 0.6) * 8, 10], lF: [6, 0], lB: [-6, 0], head: -8 };
    case "point":
      return { hipY: 74, lean: 2, aF: [96, 0], aB: [6, 10], lF: [4, 0], lB: [-4, 0] };
    case "facepalm":
      return { hipY: 74, lean: 10, head: 20, headY: 3, aF: [80, 120], aB: [8, 10], lF: [2, 0], lB: [-2, 0] };
    case "shoot": {   // basketball jump shot loop: dip, rise, release
      const u = (t % 1.6) / 1.6, up = u < 0.3 ? -u / 0.3 : u < 0.55 ? (u - 0.3) / 0.25 : 1 - (u - 0.55) / 0.45;
      const air = Math.max(0, up) * 18;
      return { hipY: 74 - Math.max(0, -up) * 10 + air, lean: -2, lF: [Math.max(0, -up) * 30, -Math.max(0, -up) * 50], lB: [Math.max(0, -up) * 26, -Math.max(0, -up) * 46], aF: [100 + Math.max(0, up) * 60, -60 + Math.max(0, up) * 50], aB: [90 + Math.max(0, up) * 60, -60 + Math.max(0, up) * 50], head: -10 };
    }
    case "dribble":
      return { hipY: 68, lean: 14, lF: [24, -20], lB: [-20, 10], aF: [30 + tw(t, 0.45) * 14, 30], aB: [-10, 20], head: 0 };
    case "count":   // counting money in his hands
      return { hipY: 74, lean: 8, head: 18, aF: [60, 70 + tw(t, 0.35) * 10], aB: [50, 80], lF: [2, 0], lB: [-2, 0] };
    case "kneel":
      return { hipY: 40, lean: 14, head: 16, lF: [90, -90], lB: [0, -100], aF: [30, 20], aB: [20, 20] };
    case "reach":   // reaching out to an alarm clock / shelf in front of him
      return { hipY: 74, lean: 20, aF: [100, 0], aB: [20, 10], lF: [10, 0], lB: [-10, 0] };
    case "stretch":
      return { hipY: 74, lean: -6, aF: [175, 0], aB: [-175, 0], lF: [4, 0], lB: [-4, 0], head: -10 };
    case "monster":   // the inner voice: tall, still, slight sway
      return { hipY: 74, lean: 4 + tw(t, 2.6) * 3, head: 6, aF: [20 + tw(t, 2.1) * 6, 20], aB: [-12, 20], lF: [4, 0], lB: [-4, 0] };
    case "loom":      // monster leaning over him, arms out
      return { hipY: 74, lean: 18, head: 14, aF: [96 + tw(t, 1.7) * 10, 30], aB: [70, 40], lF: [8, 0], lB: [-8, 0] };
    default:          // stand
      return { hipY: 74 + b * 0.5, lean: 1, head: 2 + b, lF: [3, 0], lB: [-3, 0], aF: [6 + b, 8], aB: [-6, 8] };
  }
};

const limb = (x: number, y: number, a0: number, a1: number, L: number[], dir: number) => {
  // + angle = forward = +x when facing right; 0 = straight down
  const x1 = x + S(rad(a0)) * L[0] * dir, y1 = y + C(rad(a0)) * L[0];
  const x2 = x1 + S(rad(a0 + a1)) * L[1] * dir, y2 = y1 + C(rad(a0 + a1)) * L[1];
  return `M ${x} ${y} L ${x1} ${y1} L ${x2} ${y2}`;
};

/** hand position of the front arm (to attach phones, money, balls) */
export const handOf = (p: Pose, dir: number) => {
  const hx = (p.hipX ?? 0), hy = -(p.hipY ?? 74), lean = rad(p.lean ?? 0);
  const sx = hx + S(lean) * (TORSO - 8) * dir, sy = hy - C(lean) * (TORSO - 8);
  const [a0, a1] = p.aF ?? [0, 0];
  const x1 = sx + S(rad(a0)) * ARM[0] * dir, y1 = sy + C(rad(a0)) * ARM[0];
  return { x: x1 + S(rad(a0 + a1)) * ARM[1] * dir, y: y1 + C(rad(a0 + a1)) * ARM[1] };
};

const Face: React.FC<{ e: Expr; dir: number; t: number; monster?: boolean }> = ({ e, dir, t, monster }) => {
  const ex = 13 * dir, blink = (t % 4.3) > 4.18;
  if (monster) {   // two red slits
    return <g>
      <path d={`M ${ex - 16} -6 L ${ex - 2} -1`} stroke="#ff2a1a" strokeWidth={5} strokeLinecap="round" />
      <path d={`M ${ex + 4} -1 L ${ex + 18} -6`} stroke="#ff2a1a" strokeWidth={5} strokeLinecap="round" />
    </g>;
  }
  const eyeY = -4, ink = "#1c1b1a", eyes = [ex - 11, ex + 11];
  const lid = e === "tired" || e === "sleep" ? 1 : 0;
  const eye = (x: number, k: number) => blink || e === "sleep"
    ? <path key={k} d={`M ${x - 5} ${eyeY} q 5 4 10 0`} stroke={ink} strokeWidth={2.6} fill="none" strokeLinecap="round" />
    : <g key={k}>
      <ellipse cx={x} cy={eyeY} rx={e === "shock" || e === "scared" ? 6.5 : 5} ry={e === "shock" || e === "scared" ? 7.5 : 6} fill={ink} />
      <circle cx={x + 1.6} cy={eyeY - 2} r={1.6} fill="#fff" opacity={0.85} />
      {lid ? <path d={`M ${x - 7} ${eyeY - 1} L ${x + 7} ${eyeY - 1}`} stroke={ink} strokeWidth={2.4} strokeLinecap="round" /> : null}
    </g>;
  const brow = (x: number, side: number) => {
    const w = 8;
    if (e === "angry" || e === "determined") return `M ${x - w} ${eyeY - 14 - side * 3} L ${x + w} ${eyeY - 14 + side * 3}`;
    if (e === "sad" || e === "cry" || e === "scared" || e === "tired") return `M ${x - w} ${eyeY - 12 + side * 3} L ${x + w} ${eyeY - 12 - side * 3}`;
    if (e === "shock") return `M ${x - w} ${eyeY - 17} q ${w} -4 ${2 * w} 0`;
    return null;
  };
  const mouth = {
    neutral: `M ${ex - 7} 18 L ${ex + 7} 18`,
    smile: `M ${ex - 8} 15 q 8 7 16 0`,
    grin: `M ${ex - 10} 13 q 10 14 20 0 z`,
    sad: `M ${ex - 8} 20 q 8 -7 16 0`,
    cry: `M ${ex - 9} 21 q 9 -9 18 0`,
    angry: `M ${ex - 9} 19 q 4 -3 9 -1 q 5 -2 9 1`,
    determined: `M ${ex - 8} 18 L ${ex + 8} 17`,
    tired: `M ${ex - 6} 19 q 6 -2 12 0`,
    shock: `M ${ex - 5} 16 a 5 7 0 1 0 10 0 a 5 7 0 1 0 -10 0`,
    scared: `M ${ex - 8} 19 q 2 -3 4 0 q 2 3 4 0 q 2 -3 4 0 q 2 3 4 0`,
    sleep: `M ${ex - 5} 17 q 5 3 10 0`,
  }[e];
  return <g>
    {eyes.map((x, i) => eye(x, i))}
    {eyes.map((x, i) => { const d = brow(x, i ? -dir : dir); return d ? <path key={"b" + i} d={d} stroke={ink} strokeWidth={3} strokeLinecap="round" /> : null; })}
    <path d={mouth} stroke={ink} strokeWidth={2.8} fill={e === "grin" ? "#3a2020" : e === "shock" ? "#2a1a1a" : "none"} strokeLinecap="round" strokeLinejoin="round" />
    {e === "cry" && <path d={`M ${ex - 11} ${eyeY + 8} q -3 8 0 12 q 3 -4 0 -12`} fill="#8fd0ff" opacity={0.95} />}
    {(e === "tired" || e === "scared") && <path d={`M ${-ex * 1.6} -26 q -4 7 0 10 q 4 -3 0 -10`} fill="#9fd4ff" opacity={0.9} />}
  </g>;
};

/** the character: x/y = feet on the floor, dir = 1 faces right */
export const Guy: React.FC<{ p: Pose; e: Expr; dir?: number; t: number; look?: Look; scale?: number; x?: number; y?: number; dim?: number }> = ({ p, e, dir = 1, t, look = {}, scale = 1, x = 0, y = 0, dim = 0 }) => {
  const mon = !!look.monster;
  const skin = mon ? "#050505" : look.skin ?? "#ddd6c6";
  const shade = mon ? "#050505" : "#bdb5a3";
  const line = mon ? "#ff3020" : OUTLINE;
  const hx = p.hipX ?? 0, hy = -(p.hipY ?? 74), lean = rad(p.lean ?? 0);
  const sx = hx + S(lean) * (TORSO - 8) * dir, sy = hy - C(lean) * (TORSO - 8);
  const nx = hx + S(lean) * (TORSO + 22) * dir, ny = hy - C(lean) * (TORSO + 22) + (p.headY ?? 0);
  const lF = p.lF ?? [0, 0], lB = p.lB ?? [0, 0], aF = p.aF ?? [0, 0], aB = p.aB ?? [0, 0];
  const cap = (d: string, w: number, fill: string, key: string) => <g key={key}>
    <path d={d} stroke={line} strokeWidth={w + 4.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d={d} stroke={fill} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </g>;
  const body = `M ${hx} ${hy} L ${sx} ${sy}`;
  const headT = `translate(${nx} ${ny - HEAD_R + 14}) rotate(${(p.head ?? 0) * dir})`;
  const glow = mon ? "url(#monGlow)" : undefined;
  return (
    <g transform={`translate(${x} ${y - (p.lift ?? 0) * scale}) scale(${scale}) rotate(${(p.rot ?? 0) * dir})`} filter={glow} opacity={1 - dim}>
      {cap(limb(hx, hy, lB[0], lB[1], LEG, dir), LIMB_W, shade, "lb")}
      {cap(limb(sx, sy, aB[0], aB[1], ARM, dir), LIMB_W - 3, shade, "ab")}
      {cap(body, BODY_W, skin, "body")}
      {cap(limb(hx, hy, lF[0], lF[1], LEG, dir), LIMB_W, skin, "lf")}
      <g transform={headT}>
        <circle r={HEAD_R} fill={skin} stroke={line} strokeWidth={2.2} />
        {!mon && <path d={`M ${-HEAD_R * 0.75 * dir} ${HEAD_R * 0.35} a ${HEAD_R} ${HEAD_R} 0 0 0 ${HEAD_R * 1.2 * dir} ${HEAD_R * 0.55}`} stroke="#c9c1af" strokeWidth={7} fill="none" opacity={0.55} />}
        {look.band && <path d={`M ${-HEAD_R} -14 Q 0 -22 ${HEAD_R} -14`} stroke={look.band} strokeWidth={8} fill="none" strokeLinecap="round" />}
        {look.band && <path d={`M ${-HEAD_R * dir} -14 l ${-14 * dir} 6 M ${-HEAD_R * dir} -14 l ${-16 * dir} -2`} stroke={look.band} strokeWidth={5} strokeLinecap="round" />}
        {look.cap && <path d={`M ${-HEAD_R + 2} -12 A ${HEAD_R - 2} ${HEAD_R - 4} 0 0 1 ${HEAD_R - 2} -12 Z M ${HEAD_R * 0.3 * dir} -12 l ${30 * dir} 2`} fill={look.cap} stroke={look.cap} strokeWidth={6} strokeLinecap="round" />}
        <Face e={e} dir={dir} t={t} monster={mon} />
      </g>
      {look.tie && <path d={`M ${sx} ${sy + 6} l -4 10 l 4 22 l 4 -22 z`} fill={look.tie} transform={`translate(${6 * dir} 0)`} />}
      {cap(limb(sx, sy, aF[0], aF[1], ARM, dir), LIMB_W - 3, skin, "af")}
    </g>
  );
};
