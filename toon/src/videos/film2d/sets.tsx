// Nov 19: places and things for the flat 2D films.
// Doodle language: dark fills (#101012-#202026) with a thin ~2 px lighter-grey outline (#4a4d5c), one thin grey floor line,
// near-black stage (#0B0B0B, drawn by Film2D), light only where the story needs it: the moon wedge, a lamp cone, a phone,
// street-lamp bloom, a spotlight cone with dust, a red glowing bag, one warm sunrise at the end.
// World units = px of a 1280x720 frame at camera zoom 1; the floor is at y = FLOOR. The hero is ~190 px tall.
// Set args (Shot2.arg, numbers only; every one optional, existing films keep their look):
//   couch:    lamp = 1 lamp lit (warm glow) | nolamp = 1 no floor lamp at all
//   mirror:   crack 0..1 | tint 0..1 reflection tint inside the glass (default 0) | tintHue degrees (default 210 = cool blue; 20 = warm)
//   stairs:   the steps are drawn bumpy / hand-wobbled (deterministic, no arg)
//   fridge:   open 0..1 = door ajar, light spilling out (default 0) | x = fridge centre (default 760)
//   calendar: start = weekday of day 1 (0..4, default 2) | cross = N days crossed off with a red X (default 0) | crossDt = seconds between
//             the X marks drawing in (default 0 = all drawn at once) | crossT0 = seconds before the first X (default 0) | today = day
//             number circled in red (0 = none) | days = days in the month (default 31)
//             paper = 1: the reference look: cream paper page, red header band, plain 7 x 5 grid, no numbers / weekday letters, thin red X, no floor
//   bedroom / bedroomdawn: nsExt = px the nightstand grows to the left (the clock moves with it, room for a jar beside the clock; default 0)
//   (grades "sunset" / "rain" and the embers / burst / punch args are documented in Film2D.tsx)
// SET_CAMS = the default framing per set (wide shots: hero ~43% of the picture height, floor at ~y 515) and the slow
// push-in in %/s (Film2D uses it when a beat has no "cam").
import React from "react";

export const FLOOR = 560;
const INK = "#4a4d5c", INK2 = "#6b6f82";
const L = { stroke: INK, strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const F1 = "#101012", F2 = "#17171b", F3 = "#202026";
const HAND = "'Comic Neue', 'Comic Sans MS', cursive";
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const wrap = (v: number, m: number) => ((v % m) + m) % m;

/** default camera per set: [cx, cy, zoom] and push-in %/s (negative = pull out) */
export const SET_CAMS: Record<string, { c: [number, number, number]; push: number }> = {
  bedroom: { c: [655, 445, 1.35], push: 1.2 },
  bedroomdawn: { c: [655, 445, 1.35], push: 0 },
  couch: { c: [697, 448, 1.15], push: 1.0 },
  desk: { c: [690, 422, 1.1], push: 1.0 },
  street: { c: [686, 429, 1.15], push: 0.4 },
  mirror: { c: [650, 421, 1.4], push: 1.0 },
  gym: { c: [642, 435, 1.2], push: 0 },
  stairs: { c: [760, 330, 1.2], push: 0 },
  hill: { c: [640, 446, 0.7], push: -0.6 },
  fridge: { c: [700, 420, 1.15], push: 0.3 },
  calendar: { c: [640, 292, 1.4], push: 0.5 },
  court: { c: [860, 445, 1.35], push: 0.6 },
  store: { c: [640, 445, 1.35], push: 0.6 },
  office: { c: [640, 445, 1.35], push: 0.6 },
  spot: { c: [640, 441, 1.4], push: 0.2 },
  void: { c: [640, 445, 1.35], push: 0 },
  black: { c: [640, 445, 1.35], push: 0 },
};

/** soft light pool: a radial gradient blob (lamp, phone, moon) */
export const Glow: React.FC<{ x: number; y: number; r: number; c: string; o?: number }> = ({ x, y, r, c, o = 0.5 }) => (
  <circle cx={x} cy={y} r={r} fill={`url(#g-${c.replace("#", "")})`} opacity={o} />
);
export const GLOW_COLORS = ["ffb35a", "ffffff", "7aa8ff", "ff3a2a", "ff6ad5", "9cff9c", "ffd27a", "e8b180", "ef4e3a", "f0d040"];

/** spotlight cone from the top edge with floating dust motes */
export const Spot: React.FC<{ x: number; w?: number; t?: number; o?: number }> = ({ x, w = 150, t = 0, o = 1 }) => (
  <g opacity={o}>
    <g filter="url(#soft8)"><path d={`M ${x - 10} 215 L ${x + 10} 215 L ${x + w} ${FLOOR} L ${x - w} ${FLOOR} Z`} fill="url(#coneW)" /></g>
    <ellipse cx={x} cy={FLOOR} rx={w * 0.9} ry={11} fill="#fff" opacity={0.1} filter="url(#soft8)" />
    {Array.from({ length: 18 }, (_, i) => {
      const yy = 250 + wrap(rnd(i * 3) * 310 + t * (5 + rnd(i) * 9), 310);
      const half = 10 + (w - 10) * ((yy - 215) / (FLOOR - 215));
      const xx = x + (rnd(i * 7) - 0.5) * 2 * half * 0.85 + Math.sin(t * 0.7 + i) * 6;
      return <circle key={i} cx={xx} cy={yy} r={0.9 + rnd(i * 5) * 1.5} fill="#fff" opacity={0.22 + rnd(i * 11) * 0.3} />;
    })}
  </g>
);

const Floor: React.FC<{ x0?: number; x1?: number }> = ({ x0 = -2200, x1 = 3600 }) => <path d={`M ${x0} ${FLOOR} L ${x1} ${FLOOR}`} stroke="#4d4e56" strokeWidth={2} strokeLinecap="round" opacity={0.9} />;

/** long soft diagonal light wedge from a window to the floor */
const Wedge: React.FC<{ x: number; y: number; w: number; col?: string; o?: number }> = ({ x, y, w, col = "#fff", o = 1 }) => {
  const b = y + w, drop = FLOOR - b;
  return <g opacity={o} filter="url(#soft6)"><path d={`M ${x} ${b} L ${x + w} ${b} L ${x + w - drop * 0.95} ${FLOOR} L ${x - drop * 1.3} ${FLOOR} Z`} fill={col} fillOpacity={0.075} /></g>;
};

/** 4-pane window with a moon (or a dawn gradient) */
const Window: React.FC<{ x: number; y: number; w?: number; dawn?: number; moon?: boolean; sky?: string }> = ({ x, y, w = 140, dawn, moon = true, sky = "#10131f" }) => (
  <g>
    <rect x={x} y={y} width={w} height={w} rx={9} fill={dawn !== undefined ? "url(#winDawn)" : sky} stroke={INK2} strokeWidth={3} strokeLinejoin="round" />
    {dawn !== undefined && <rect x={x} y={y} width={w} height={w} rx={9} fill="#0b0b0b" opacity={0.55 * (1 - Math.min(1, dawn))} />}
    {moon && dawn === undefined && <><circle cx={x + w * 0.68} cy={y + w * 0.28} r={w * 0.115} fill="#e8e6df" /><Glow x={x + w * 0.68} y={y + w * 0.28} r={w * 0.42} c="#ffffff" o={0.22} /></>}
    <path d={`M ${x + w / 2} ${y} L ${x + w / 2} ${y + w} M ${x} ${y + w / 2} L ${x + w} ${y + w / 2}`} stroke={INK2} strokeWidth={2.6} strokeLinecap="round" />
  </g>
);

/** 7-segment digits centred on (0,0) */
const SEG: Record<string, string> = { "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg", "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg" };
const SevenSeg: React.FC<{ text: string }> = ({ text }) => {
  const dw = 13, dh = 24, gap = 6, hx = dw / 2, hy = dh / 2;
  const seg: Record<string, string> = {
    a: `M ${-hx + 2} ${-hy} L ${hx - 2} ${-hy}`, b: `M ${hx} ${-hy + 2} L ${hx} -2`, c: `M ${hx} 2 L ${hx} ${hy - 2}`, d: `M ${-hx + 2} ${hy} L ${hx - 2} ${hy}`,
    e: `M ${-hx} 2 L ${-hx} ${hy - 2}`, f: `M ${-hx} ${-hy + 2} L ${-hx} -2`, g: `M ${-hx + 2} 0 L ${hx - 2} 0`,
  };
  const wid = (ch: string) => (ch === ":" ? 6 : dw);
  const total = text.split("").reduce((a, ch) => a + wid(ch) + gap, -gap);
  let x = -total / 2;
  return <g stroke="#ff3a2a" strokeWidth={3} strokeLinecap="round" fill="none" filter="url(#redGlow)">
    {text.split("").map((ch, i) => {
      const cx = x + wid(ch) / 2; x += wid(ch) + gap;
      return <g key={i} transform={`translate(${cx} 0)`}>
        {ch === ":" ? <><circle cx={0} cy={-5} r={1.8} fill="#ff3a2a" stroke="none" /><circle cx={0} cy={5} r={1.8} fill="#ff3a2a" stroke="none" /></>
          : (SEG[ch] ?? "").split("").map((k) => <path key={k} d={seg[k]} />)}
      </g>;
    })}
  </g>;
};

/** the red 7-segment clock */
export const Alarm: React.FC<{ x: number; y: number; s?: number; text?: string; ring?: number }> = ({ x, y, s = 1, text = "5:00", ring = 0 }) => {
  const sh = ring ? Math.sin(ring * 60) * 3 : 0;
  return (
    <g transform={`translate(${x + sh} ${y}) scale(${s})`}>
      <rect x={-50} y={-26} width={100} height={44} rx={10} fill="#0f0f12" stroke={INK2} strokeWidth={2.4} />
      <rect x={-17} y={-34} width={34} height={9} rx={4.5} fill="#2a2b32" stroke={INK2} strokeWidth={1.6} /><text x={0} y={-27} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={5.5} fill="#8a8d98">SNOOZE</text>
      <g transform="translate(0 -4)" opacity={ring ? (Math.floor(ring / 0.15) % 2 ? 0.45 : 1) : 1}><SevenSeg text={text} /></g>
      {ring ? <g stroke="#ff4a3a" strokeWidth={2} strokeLinecap="round" opacity={Math.floor(ring / 0.15) % 2 ? 0.35 : 1}>
        <path d="M -76 -36 l 7 9 M -68 -36 l 7 9 M -60 -36 l 7 9 M 76 -36 l -7 9 M 68 -36 l -7 9 M 60 -36 l -7 9" />
      </g> : null}
    </g>
  );
};

export const Phone: React.FC<{ x: number; y: number; s?: number; c?: string; text?: string; rot?: number }> = ({ x, y, s = 1, c = "7aa8ff", text, rot = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <Glow x={0} y={0} r={90} c={"#" + c} o={0.5} />
    <rect x={-9} y={-16} width={18} height={32} rx={4} fill={"#" + c} opacity={0.9} stroke="#dfe8ff" strokeWidth={1.2} />
    {text && <text x={0} y={-24} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={14} fill="#fff">{text}</text>}
  </g>
);

const Bed: React.FC<{ x: number; occupied?: boolean }> = ({ x }) => (
  <g>
    <rect x={x} y={FLOOR - 104} width={22} height={104} rx={10} fill={F2} {...L} />
    <rect x={x + 24} y={FLOOR - 72} width={420} height={17} rx={6} fill={F3} {...L} />
    <rect x={x + 24} y={FLOOR - 55} width={420} height={9} rx={3} fill={F1} {...L} />
    <path d={`M ${x + 34} ${FLOOR - 46} L ${x + 34} ${FLOOR} M ${x + 434} ${FLOOR - 46} L ${x + 434} ${FLOOR}`} {...L} strokeWidth={4} />
    <rect x={x + 28} y={FLOOR - 90} width={76} height={20} rx={10} fill="#2a2b32" {...L} />
  </g>
);
/** the blanket goes over whoever lies in the bed */
export const Blanket: React.FC<{ x: number; heave?: number; x0?: number }> = ({ x, heave = 0, x0 }) => {
  // x0 = where the blanket's left edge should sit (so the sleeper's face stays clear on the pillow); the shape is squeezed to fit the bed
  const k = x0 === undefined ? 1 : Math.max(0.5, Math.min(1, (x + 432 - x0) / 320));
  const tr = x0 === undefined ? undefined : `translate(${x0} 0) scale(${k} 1) translate(${-(x + 112)} 0)`;
  return (
  <g transform={tr}>
    <path d={`M ${x + 112} ${FLOOR - 66} C ${x + 106} ${FLOOR - 124 - heave}, ${x + 150} ${FLOOR - 134 - heave}, ${x + 210} ${FLOOR - 131 - heave} C ${x + 280} ${FLOOR - 126 - heave}, ${x + 350} ${FLOOR - 136 - heave}, ${x + 400} ${FLOOR - 124} Q ${x + 436} ${FLOOR - 118} ${x + 432} ${FLOOR - 62} Z`} fill="#1a2036" stroke="#3b4366" strokeWidth={2.2} strokeLinejoin="round" />
    <path d={`M ${x + 150} ${FLOOR - 120} q 30 26 14 56 M ${x + 300} ${FLOOR - 124} q 20 30 4 60`} stroke="#2b3354" strokeWidth={1.6} fill="none" strokeLinecap="round" />
  </g>
  );
};
const Nightstand: React.FC<{ x: number; w?: number }> = ({ x, w = 88 }) => (
  <g><rect x={x} y={FLOOR - 78} width={w} height={78} rx={11} fill={F2} {...L} /><path d={`M ${x + 6} ${FLOOR - 52} L ${x + w - 6} ${FLOOR - 52}`} {...L} strokeWidth={1.6} opacity={0.7} /><circle cx={x + w / 2} cy={FLOOR - 64} r={3} fill={INK2} /></g>
);
const Couch: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <rect x={x - 160} y={FLOOR - 138} width={320} height={88} rx={26} fill="#15151a" {...L} />
    <rect x={x - 192} y={FLOOR - 96} width={52} height={92} rx={22} fill="#1b1b21" {...L} />
    <rect x={x + 140} y={FLOOR - 96} width={52} height={92} rx={22} fill="#1b1b21" {...L} />
    <rect x={x - 146} y={FLOOR - 80} width={292} height={46} rx={14} fill="#1a1a20" {...L} />
    <path d={`M ${x - 140} ${FLOOR - 4} L ${x - 140} ${FLOOR} M ${x + 140} ${FLOOR - 4} L ${x + 140} ${FLOOR}`} {...L} strokeWidth={5} />
  </g>
);
const FloorLamp: React.FC<{ x: number; on?: boolean }> = ({ x, on = false }) => (
  <g>
    {on && <Glow x={x} y={FLOOR - 190} r={240} c="#ffb35a" o={0.34} />}
    <path d={`M ${x} ${FLOOR - 190} L ${x} ${FLOOR} M ${x - 24} ${FLOOR} L ${x + 24} ${FLOOR}`} {...L} strokeWidth={3} />
    <path d={`M ${x - 26} ${FLOOR - 188} L ${x - 14} ${FLOOR - 214} L ${x + 14} ${FLOOR - 214} L ${x + 26} ${FLOOR - 188} Z`} fill={on ? "#e9b56a" : F3} {...L} />
  </g>
);
/** a desk lamp on top of the book stack, warm cone onto the desk */
const DeskLamp: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g>
    <Glow x={x - 100} y={y + 20} r={250} c="#ffb35a" o={0.42} />
    <path d={`M ${x - 18} ${y - 52} L ${x - 190} ${y + 40} L ${x - 20} ${y + 40} Z`} fill="url(#coneWarm)" filter="url(#soft6)" />
    <path d={`M ${x + 4} ${y} L ${x + 8} ${y - 44} L ${x - 10} ${y - 70}`} {...L} strokeWidth={3} fill="none" />
    <path d={`M ${x - 24} ${y - 78} L ${x + 6} ${y - 64} L ${x - 6} ${y - 46} L ${x - 30} ${y - 58} Z`} fill="#5a5d68" {...L} />
    <ellipse cx={x + 6} cy={y} rx={16} ry={4} fill={F3} {...L} />
  </g>
);
const BookStack: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g>
    <rect x={x - 42} y={y - 14} width={86} height={14} rx={3} fill="#a8352d" {...L} strokeWidth={1.8} />
    <rect x={x - 38} y={y - 28} width={78} height={14} rx={3} fill="#2f5aa8" {...L} strokeWidth={1.8} />
    <rect x={x - 44} y={y - 42} width={84} height={14} rx={3} fill="#c9a43a" {...L} strokeWidth={1.8} />
  </g>
);
const Desk: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <rect x={x - 230} y={FLOOR - 112} width={460} height={16} rx={5} fill={F3} {...L} />
    <path d={`M ${x - 214} ${FLOOR - 96} L ${x - 214} ${FLOOR} M ${x + 214} ${FLOOR - 96} L ${x + 214} ${FLOOR}`} {...L} strokeWidth={5} />
  </g>
);
const Chair: React.FC<{ x: number; dir?: number }> = ({ x, dir = 1 }) => (
  <g><rect x={x - 30} y={FLOOR - 50} width={60} height={10} rx={4} fill={F3} {...L} /><path d={`M ${x - 24} ${FLOOR - 40} L ${x - 24} ${FLOOR} M ${x + 24} ${FLOOR - 40} L ${x + 24} ${FLOOR} M ${x - 28 * dir} ${FLOOR - 50} L ${x - 30 * dir} ${FLOOR - 132}`} {...L} strokeWidth={4} /></g>
);
const WallClock: React.FC<{ x: number; y: number; t: number }> = ({ x, y, t }) => {
  const a = t * 1.6;
  return <g>
    <circle cx={x} cy={y} r={32} fill="#0f0f12" stroke="#b9bbc6" strokeWidth={2.6} />
    <path d={`M ${x} ${y - 27} l 0 6 M ${x + 27} ${y} l -6 0 M ${x} ${y + 27} l 0 -6 M ${x - 27} ${y} l 6 0`} stroke="#8a8d9a" strokeWidth={2} strokeLinecap="round" />
    <path d={`M ${x} ${y} L ${x + 12} ${y + 10}`} stroke="#e8e6df" strokeWidth={3.4} strokeLinecap="round" />
    <path d={`M ${x} ${y} L ${x + Math.sin(a) * 22} ${y - Math.cos(a) * 22}`} stroke="#e8e6df" strokeWidth={2.4} strokeLinecap="round" />
  </g>;
};
/** oval mirror on a pedestal; whatever stands at x (the villain) shows inside; crack = 0..1 */
const Mirror: React.FC<{ x: number; crack?: number; tint?: number; hue?: number }> = ({ x, crack = 0, tint = 0, hue = 210 }) => {
  const cy = FLOOR - 188, cx2 = x + 4, cyc = cy + 22;
  const rays = [[-80, -78], [78, -62], [-70, 84], [70, 96], [8, -150], [-30, 150], [60, 6]];
  return (
    <g>
      <ellipse cx={x} cy={cy} rx={90} ry={128} fill="#0a0a0d" stroke="#8a8d9a" strokeWidth={4} />
      {tint > 0 && <ellipse cx={x} cy={cy} rx={86} ry={124} fill={`hsl(${hue} 55% 42%)`} opacity={0.32 * Math.min(1, tint)} />}
      <ellipse cx={x} cy={cy} rx={79} ry={117} fill="none" stroke="#2c2e38" strokeWidth={1.6} />
      <path d={`M ${x - 62} ${cy - 66} q 4 -34 34 -52`} stroke="#fff" strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.12} />
      <rect x={x - 96} y={FLOOR - 56} width={192} height={18} rx={9} fill={F3} {...L} />
      <rect x={x - 70} y={FLOOR - 38} width={140} height={38} rx={10} fill={F2} {...L} />
      {crack > 0 && <g stroke="#e6e4de" strokeLinecap="round" fill="none" opacity={crack}>
        {rays.map(([dx, dy], i) => <path key={i} d={`M ${cx2} ${cyc} l ${dx * 0.35} ${dy * 0.3} l ${dx * 0.25 * (i % 2 ? 1 : -0.6)} ${dy * 0.3} l ${dx * 0.4} ${dy * 0.4}`} strokeWidth={i % 3 === 0 ? 2.2 : 1.4} />)}
        <path d={`M ${cx2 - 30} ${cyc - 20} l 14 18 l -6 20 M ${cx2 + 34} ${cyc + 10} l -16 -10 l 6 -22`} strokeWidth={1.2} />
      </g>}
    </g>
  );
};
/** glossy red punching bag with a soft red glow and sketchy texture lines; hit = swing strength */
/** glow + radial spark star at every punch contact (arg.hit0 = first contact s, arg.hitP = period s); local = seconds since the contact */
const HitFx: React.FC<{ x: number; y: number; k: number }> = ({ x, y, k }) => {
  const a = Math.max(0, 1 - k / 0.5), r0 = 14 + k * 70;
  return <g>
    <Glow x={x} y={y} r={110 * (0.6 + k)} c="#f0d040" o={0.85 * a} />
    <Glow x={x} y={y} r={55} c="#ffb35a" o={0.9 * a} />
    <g stroke="#f7dc4a" strokeWidth={2.4} strokeLinecap="round" opacity={Math.max(0, 1 - k / 0.4)}>
      {Array.from({ length: 11 }, (_, i) => { const an = (i / 11) * Math.PI * 2 + 0.25, r1 = r0 + 14 + (i % 3) * 8, r2 = r1 + 22 + (i % 2) * 12; return <path key={i} d={`M ${x + Math.cos(an) * r1} ${y + Math.sin(an) * r1} L ${x + Math.cos(an) * r2} ${y + Math.sin(an) * r2}`} />; })}
    </g>
  </g>;
};
const Bag: React.FC<{ x: number; t: number; hit?: number; speed?: number; hit0?: number; hitP?: number; fx?: number; fy?: number; sp0?: number; spP?: number; spLen?: number }> = ({ x, t, hit = 0, speed = 0, hit0, hitP = 1.25, fx = x - 56, fy = FLOOR - 136, sp0, spP = 2.5, spLen = 0.8 }) => {
  const kh = hit0 !== undefined && t >= hit0 - 0.02 ? (t - hit0 + 0.02) % hitP - 0.02 : -1;
  const ks = sp0 !== undefined && t >= sp0 ? (t - sp0) % spP : -1;
  const sv = ks >= 0 && ks < spLen ? Math.min(1, ks / 0.06) * (1 - ks / spLen) ** 0.8 : 0;
  speed = Math.max(speed, sv);
  const sw = Math.sin(t * 6) * hit * 5;
  const top = FLOOR - 282, bot = FLOOR - 40;
  return (
    <g>
      <Glow x={x} y={FLOOR - 160} r={250} c="#ff3a2a" o={0.34} />
      <g transform={`rotate(${sw} ${x} ${FLOOR - 460})`}>
        <path d={`M ${x - 12} ${FLOOR - 700} L ${x - 6} ${top} M ${x + 12} ${FLOOR - 700} L ${x + 6} ${top}`} stroke={INK2} strokeWidth={2.4} />
        <rect x={x - 52} y={top} width={104} height={bot - top} rx={40} fill="url(#bagGrad)" stroke="#ff7a62" strokeWidth={2} />
        <rect x={x - 30} y={top + 22} width={10} height={bot - top - 66} rx={5} fill="#fff" opacity={0.2} />
        <rect x={x - 54} y={top + 4} width={108} height={14} rx={7} fill="#7a120e" opacity={0.55} />
        <path d={Array.from({ length: 16 }, (_, i) => { const yy = top + 34 + rnd(i) * (bot - top - 70), xx = x - 34 + rnd(i * 5) * 52; return `M ${xx} ${yy} l ${14 + rnd(i * 9) * 14} ${-3 - rnd(i * 4) * 6}`; }).join(" ")} stroke="#a3150f" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.75} />
        <path d={`M ${x - 52} ${bot - 50} q 52 22 104 0`} stroke="#7a120e" strokeWidth={2} fill="none" opacity={0.6} />
      </g>
      {sv > 0 && <Glow x={fx - 40} y={FLOOR - 150} r={330} c="#f0d040" o={0.32 * sv} />}
      {speed > 0 && <Speed x={fx - 70} y={FLOOR - 195} v={speed} />}
      {kh >= 0 && kh < 0.5 && <HitFx x={fx} y={fy} k={kh} />}
    </g>
  );
};
/** yellow speed lines streaming left from (x,y) */
export const Speed: React.FC<{ x: number; y: number; v?: number; s?: number }> = ({ x, y, v = 1, s = 1 }) => (
  <g opacity={Math.min(1, v)} transform={`translate(${x} ${y}) scale(${s})`} stroke="#b8982e" strokeLinecap="round" fill="none">
    {Array.from({ length: 12 }, (_, i) => {
      const yy = (i - 5.5) * 5 + rnd(i) * 6, len = 330 + rnd(i * 3) * 300, sl = -((i - 5.5) / 5.5) * 0.3 + (rnd(i * 5) - 0.5) * 0.06;
      return <path key={i} d={`M ${-14 - rnd(i * 7) * 30} ${yy} l ${-len} ${len * sl}`} strokeWidth={1.8 + rnd(i * 2) * 1.8} opacity={0.85} />;
    })}
  </g>
);
/** yellow impact star, v = progress 0..1 */
const Spark: React.FC<{ x: number; y: number; s?: number; v?: number }> = ({ x, y, s = 1, v = 0.5 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} stroke="#f7dc4a" strokeWidth={3.4} strokeLinecap="round" opacity={Math.max(0, 1 - v * 0.8)}>
    <Glow x={0} y={0} r={60} c="#f0d040" o={0.5 * (1 - v)} />
    {Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + 0.2, r0 = 12 + v * 26, r1 = r0 + 16 + (i % 2) * 8; return <path key={i} d={`M ${Math.cos(a) * r0} ${Math.sin(a) * r0} L ${Math.cos(a) * r1} ${Math.sin(a) * r1}`} />; })}
  </g>
);

/** night city (reference look: soft rounded translucent blocks, a few dim lit windows, 3 parallax layers; off = px the street has moved) */
const City: React.FC<{ off: number }> = ({ off }) => {
  const layer = (k: number, seed: number, hmin: number, hmax: number, wmin: number, wmax: number, fill: string, op: number, lit: number, key: string) => {
    const els: React.ReactNode[] = []; let x = -1100 - wmax;
    for (let i = 0; x < 3000; i++) {
      const w = wmin + rnd(seed + i) * (wmax - wmin), h = hmin + rnd(seed + i * 3) * (hmax - hmin);
      els.push(<g key={i}>
        <rect x={x} y={FLOOR - h} width={w} height={h + 14} rx={16} fill={fill} fillOpacity={op} stroke="#2a2b34" strokeOpacity={op * 0.9} strokeWidth={1.4} />
        {Array.from({ length: Math.floor((h - 30) / 44) * 2 }, (_, j) => {
          const on = rnd(seed + i * 17 + j * 5) < lit;
          return on ? <rect key={j} x={x + 14 + (j % 2) * (w / 2 - 4)} y={FLOOR - h + 30 + Math.floor(j / 2) * 44} width={9} height={9} fill="#8a6f48" opacity={0.5 + rnd(j + i) * 0.3} /> : null;
        })}
      </g>);
      x += w + 14 + rnd(seed + i * 9) * 70;
    }
    return <g key={key} transform={`translate(${-off * k} 0)`}>{els}</g>;
  };
  return <g>
    {layer(0.15, 1, 130, 230, 70, 120, "#1f2029", 0.4, 0.1, "far")}
    {layer(0.45, 900, 90, 190, 80, 130, "#2a2b36", 0.78, 0.13, "near")}
  </g>;
};
const StreetLamps: React.FC<{ off: number; t: number }> = ({ off }) => (
  <g transform={`translate(${-wrap(off, 600)} 0)`}>
    {Array.from({ length: 9 }, (_, i) => i * 300 - 600).map((x) => <g key={x}>
      <Glow x={x + 22} y={FLOOR - 176} r={62} c="#ffb35a" o={0.6} />
      <ellipse cx={x + 10} cy={FLOOR + 30} rx={110} ry={30} fill="#ffb35a" opacity={0.13} filter="url(#soft8)" />
      <path d={`M ${x} ${FLOOR} L ${x} ${FLOOR - 176} q 0 -14 20 -14`} {...L} strokeWidth={3} stroke="#7a7d8a" fill="none" />
      <circle cx={x + 22} cy={FLOOR - 172} r={5.5} fill="#ffe2ae" />
    </g>)}
  </g>
);
const RoadDashes: React.FC<{ off: number }> = ({ off }) => (
  <g transform={`translate(${-wrap(off, 130)} 0)`} stroke="#4d4e56" strokeWidth={2.4} strokeLinecap="round">
    {Array.from({ length: 28 }, (_, i) => <path key={i} d={`M ${-300 + i * 130} ${FLOOR + 46} l 56 0`} />)}
  </g>
);
export const Stairs: React.FC = () => {
  // steps rise from bottom-left (x 200, floor) to top-right; step 44 wide, 26 high. Hand-drawn: every tread / riser is a slightly
  // bumpy curve (deterministic jitter); the corners land on the exact grid so the hero's feet (stairAt) still meet the treads
  let d = `M -200 ${FLOOR + 120} L 200 ${FLOOR + 120} L 200 ${FLOOR}`;
  let x = 200, y = FLOOR;
  const j = (i: number, k: number, a: number) => (rnd(i * 13 + k * 5 + 3) - 0.5) * 2 * a;
  for (let i = 0; i < 26; i++) {
    d += ` C ${(x + 30 + j(i, 1, 3)).toFixed(1)} ${(y + 6 + j(i, 2, 2)).toFixed(1)}, ${(x + 14 + j(i, 3, 3)).toFixed(1)} ${(y - 32 + j(i, 4, 2)).toFixed(1)}, ${x + 44} ${y - 26}`;
    x += 44; y -= 26;
  }
  d += ` L 2000 -400 L 2000 ${FLOOR + 400} L -200 ${FLOOR + 400} Z`;
  return <path d={d} fill="#1d1d22" stroke="#575a6c" strokeWidth={2.6} strokeLinejoin="round" />;
};
/** feet position on the stairs at progress u (0..1) */
export const stairAt = (u: number) => { const i = u * 22; return { x: 200 + i * 44 + 22, y: FLOOR - i * 26 }; };

/** rolling ridge through points (quadratic smoothing), closed at the bottom */
const ridge = (pts: [number, number][], bottom = 1500) => {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) d += ` Q ${pts[i][0]} ${pts[i][1]} ${(pts[i][0] + pts[i + 1][0]) / 2} ${(pts[i][1] + pts[i + 1][1]) / 2}`;
  const l = pts[pts.length - 1];
  return d + ` L ${l[0]} ${l[1]} L ${l[0]} ${bottom} L ${pts[0][0]} ${bottom} Z`;
};
const Hills: React.FC<{ glow: number; hx: number; t: number }> = ({ glow, hx, t }) => {
  const F = FLOOR;
  const peak = `M -900 ${F + 215} C -300 ${F + 190}, ${hx - 400} ${F + 120}, ${hx - 150} ${F + 38} Q ${hx} ${F - 8} ${hx + 150} ${F + 50} C ${hx + 240} ${F + 110}, ${hx + 320} ${F + 230}, ${hx + 440} ${F + 330} L 2300 ${F + 336}`;
  return (
    <g>
      <rect x={-1400} y={-900} width={4000} height={2500} fill="url(#sumSky)" opacity={glow} />
      <Glow x={hx + 560} y={F - 20} r={820} c="#e8b180" o={0.55 * glow} />
      <Glow x={hx + 560} y={F - 20} r={360} c="#ffd27a" o={0.4 * glow} />
      <path d={ridge([[-1000, F - 40], [-640, F - 110], [-300, F - 50], [100, F - 120], [520, F - 40], [900, F - 100], [1300, F - 30], [1700, F - 110], [2300, F - 60]])} fill="#8a4a2c" opacity={glow} />
      <path d={ridge([[-1000, F + 0], [-500, F - 60], [-100, F + 10], [350, F - 70], [800, F - 10], [1250, F - 80], [1700, F - 10], [2300, F - 50]])} fill="#6a3424" opacity={glow} />
      <path d={ridge([[-1000, F + 40], [-300, F - 10], [200, F + 50], [700, F - 10], [1200, F + 56], [1800, F + 0], [2300, F + 40]])} fill="#44221f" opacity={glow} />
      <path d={ridge([[-1000, F + 90], [-200, F + 50], [400, F + 100], [1000, F + 50], [1600, F + 110], [2300, F + 70]])} fill="#26151a" opacity={glow} />
      <path d={`${peak} L 2300 1500 L -900 1500 Z`} fill="#100a0b" />
      <path d={peak} stroke="#d27a45" strokeWidth={2.4} fill="none" opacity={0.85 * glow} />
      {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M ${wrap(rnd(i) * 2400 - t * (500 + i * 60), 2400) - 700} ${F - 140 + i * 38} l 120 0`} stroke="#e8b180" strokeWidth={1.6} strokeLinecap="round" opacity={0.18 * glow} />)}
    </g>
  );
};
const Hoop: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <path d={`M ${x + 66} ${FLOOR} L ${x + 66} ${FLOOR - 300} L ${x + 12} ${FLOOR - 300}`} {...L} strokeWidth={5} fill="none" />
    <path d={`M ${x + 40} ${FLOOR} L ${x + 92} ${FLOOR}`} {...L} strokeWidth={5} />
    <rect x={x - 8} y={FLOOR - 362} width={18} height={112} rx={4} fill={F3} {...L} />
    <ellipse cx={x - 32} cy={FLOOR - 290} rx={36} ry={7} fill="none" stroke="#e8662a" strokeWidth={4} />
    <path d={`M ${x - 66} ${FLOOR - 288} l 10 40 M ${x - 48} ${FLOOR - 286} l 6 40 M ${x - 32} ${FLOOR - 285} l 0 40 M ${x - 16} ${FLOOR - 286} l -6 40 M ${x} ${FLOOR - 288} l -10 40 M ${x - 56} ${FLOOR - 250} l 48 0`} stroke="#aeb0bd" strokeWidth={1.4} fill="none" />
  </g>
);
const CourtMarks: React.FC = () => (
  <g stroke="#3f4150" strokeWidth={1.8} fill="none" opacity={0.8}>
    <ellipse cx={900} cy={FLOOR} rx={300} ry={26} />
    <path d={`M 700 ${FLOOR} L 640 ${FLOOR + 40} L 1160 ${FLOOR + 40} L 1100 ${FLOOR}`} />
  </g>
);
const Counter: React.FC<{ x: number }> = ({ x }) => {
  const cols = ["#b0443c", "#3f68b0", "#d1ae4a", "#5aa86a", "#8a5ab0"];
  return <g>
    <rect x={x - 160} y={FLOOR - 120} width={320} height={120} rx={8} fill={F2} {...L} />
    <path d={`M ${x - 150} ${FLOOR - 96} L ${x + 150} ${FLOOR - 96}`} {...L} strokeWidth={1.4} opacity={0.6} />
    <rect x={x + 56} y={FLOOR - 172} width={76} height={52} rx={7} fill={F3} {...L} />
    <rect x={x + 66} y={FLOOR - 164} width={56} height={22} rx={3} fill="#9cff9c" opacity={0.75} />
    <Glow x={x + 94} y={FLOOR - 150} r={120} c="#9cff9c" o={0.18} />
    <g transform={`translate(${x - 620} 0)`}>
      <path d={`M 0 ${FLOOR - 340} L 0 ${FLOOR} M 320 ${FLOOR - 340} L 320 ${FLOOR}`} {...L} opacity={0.7} />
      {[0, 1, 2, 3].map((r) => <g key={r}>
        <path d={`M 0 ${FLOOR - 70 - r * 88} L 320 ${FLOOR - 70 - r * 88}`} {...L} opacity={0.7} />
        {Array.from({ length: 6 }, (_, i) => <rect key={i} x={14 + i * 50} y={FLOOR - 70 - r * 88 - 30 - (i % 2) * 8} width={32} height={30 + (i % 2) * 8} rx={4} fill={cols[(i + r) % 5]} opacity={0.7} stroke={INK} strokeWidth={1.4} />)}
      </g>)}
    </g>
    <g transform={`translate(${x - 20} ${FLOOR - 300})`}>
      <path d="M 0 -60 L 0 0" {...L} strokeWidth={1.6} />
      <rect x={-52} y={0} width={104} height={40} rx={20} fill="#1a0e0e" stroke="#e24a3c" strokeWidth={2.4} />
      <text x={0} y={28} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={22} fill="#ff5a4a">OPEN</text>
    </g>
  </g>;
};
const Office: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <rect x={x - 150} y={FLOOR - 104} width={300} height={14} rx={4} fill={F3} {...L} />
    <path d={`M ${x - 136} ${FLOOR - 90} L ${x - 136} ${FLOOR} M ${x + 136} ${FLOOR - 90} L ${x + 136} ${FLOOR}`} {...L} strokeWidth={5} />
    <rect x={x - 10} y={FLOOR - 220} width={140} height={96} rx={8} fill="#0b1018" {...L} />
    <path d={`M ${x + 14} ${FLOOR - 192} l 40 0 M ${x + 14} ${FLOOR - 172} l 70 0 M ${x + 14} ${FLOOR - 152} l 54 0`} stroke="#7aa8ff" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
    <path d={`M ${x + 60} ${FLOOR - 124} L ${x + 60} ${FLOOR - 104} M ${x + 36} ${FLOOR - 104} L ${x + 84} ${FLOOR - 104}`} {...L} strokeWidth={4} />
    <Glow x={x + 60} y={FLOOR - 172} r={170} c="#7aa8ff" o={0.3} />
    <rect x={x - 60} y={FLOOR - 120} width={50} height={16} rx={3} fill="#2a2b32" {...L} />
    <rect x={x + 200} y={FLOOR - 70} width={44} height={70} rx={6} fill={F2} {...L} />
    <path d={`M ${x + 222} ${FLOOR - 70} q -30 -40 -16 -80 M ${x + 222} ${FLOOR - 70} q 6 -60 32 -90 M ${x + 222} ${FLOOR - 70} q 24 -30 44 -34`} stroke="#3f7a4a" strokeWidth={3} fill="none" strokeLinecap="round" />
  </g>
);
const Skyline: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g>
    <rect x={x} y={y} width={190} height={170} rx={8} fill="#0b101a" stroke={INK2} strokeWidth={3} />
    {[[14, 60, 30], [48, 30, 60], [88, 70, 24], [118, 44, 40], [158, 80, 20]].map(([dx, dy, w], i) => <g key={i}><rect x={x + dx} y={y + 170 - dy - 6} width={w} height={dy} fill="#161c2c" /><rect x={x + dx + 6} y={y + 170 - dy + 6} width={5} height={7} fill="#e9c27a" opacity={0.7} /></g>)}
    <path d={`M ${x + 95} ${y} L ${x + 95} ${y + 170} M ${x} ${y + 85} L ${x + 190} ${y + 85}`} stroke={INK2} strokeWidth={2.6} />
  </g>
);

/** kitchen fridge: tall rounded box, freezer door split, handles, a note + magnet; open = door ajar with a light spill */
const Fridge: React.FC<{ x: number; open?: number; t: number }> = ({ x, open = 0, t }) => {
  const top = FLOOR - 390, w = 200, hw = w / 2, fz = top + 128, fl = open > 0 ? open * (0.9 + 0.1 * Math.sin(t * 9)) : 0;
  if (open >= 0.99) return (   // reference look: the door swung open, the whole inside lit pale blue-grey, a big cool glow
    <g>
      <Glow x={x + 40} y={FLOOR - 200} r={620} c="#7aa8ff" o={0.26} /><Glow x={x + 20} y={FLOOR - 200} r={330} c="#ffffff" o={0.16} />
      <rect x={x - hw} y={top} width={w} height={390} rx={14} fill="#5d6678" stroke="#97a0b4" strokeWidth={3} />
      <rect x={x - hw + 10} y={top + 10} width={w - 20} height={370} rx={8} fill="#6b7488" opacity={0.7} />
      <path d={`M ${x - hw + 6} ${top + 125} L ${x + hw - 6} ${top + 125} M ${x - hw + 6} ${top + 248} L ${x + hw - 6} ${top + 248}`} stroke="#a4adc0" strokeWidth={3} />
      <path d={`M ${x + hw} ${top + 2} L ${x + hw + 112} ${top + 50} L ${x + hw + 112} ${FLOOR - 30} L ${x + hw} ${FLOOR - 4} Z`} fill="#3b4150" stroke="#8b93a6" strokeWidth={3} strokeLinejoin="round" />
      <path d={`M ${x + hw + 96} ${top + 130} L ${x + hw + 96} ${top + 260}`} stroke="#b3bbcc" strokeWidth={5} strokeLinecap="round" opacity={0.7} />
    </g>
  );
  return (
    <g>
      {fl > 0 && <g opacity={Math.min(1, fl)}>
        <g filter="url(#soft8)"><path d={`M ${x + hw - 6} ${fz + 24} L ${x + hw + 330} ${FLOOR - 90} L ${x + hw + 330} ${FLOOR + 30} L ${x + hw - 6} ${FLOOR - 40} Z`} fill="#ffe9b8" fillOpacity={0.16} /></g>
        <Glow x={x + hw + 20} y={FLOOR - 170} r={260} c="#ffd27a" o={0.34} />
        <rect x={x + hw - 8} y={fz + 22} width={9} height={FLOOR - fz - 56} rx={3} fill="#fff4d0" opacity={0.85} />
      </g>}
      <rect x={x - hw} y={top} width={w} height={390} rx={16} fill={F2} {...L} />
      <path d={`M ${x - hw} ${fz} L ${x + hw} ${fz}`} {...L} strokeWidth={2.6} />
      <path d={`M ${x + hw - 28} ${fz - 82} L ${x + hw - 28} ${fz - 16} M ${x + hw - 28} ${fz + 22} L ${x + hw - 28} ${fz + 118}`} {...L} strokeWidth={7} />
      <path d={`M ${x - hw + 12} ${top + 10} q 60 -6 120 0`} stroke="#fff" strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.08} />
      <rect x={x - 66} y={fz + 54} width={58} height={74} rx={3} fill="#cfc9b8" opacity={0.78} transform={`rotate(-3 ${x - 37} ${fz + 90})`} />
      <path d={`M ${x - 58} ${fz + 76} l 40 -1 M ${x - 58} ${fz + 92} l 34 0 M ${x - 58} ${fz + 108} l 40 -1`} stroke="#8a8676" strokeWidth={2} strokeLinecap="round" />
      <circle cx={x - 38} cy={fz + 56} r={7} fill="#EF4E3A" stroke={INK} strokeWidth={1.4} />
      <rect x={x - 100} y={fz + 190} width={46} height={36} rx={4} fill="#2f5aa8" opacity={0.75} stroke={INK} strokeWidth={1.4} transform={`rotate(4 ${x - 77} ${fz + 208})`} />
      <path d={`M ${x - hw + 18} ${FLOOR} l 0 8 M ${x + hw - 18} ${FLOOR} l 0 8`} {...L} strokeWidth={6} />
    </g>
  );
};

/** wall calendar of day boxes with optional hand-drawn red X marks over the crossed-off days */
const Calendar: React.FC<{ t: number; start?: number; cross?: number; crossDt?: number; crossT0?: number; today?: number; days?: number; paper?: number }> = ({ t, start = 2, cross = 0, crossDt = 0, crossT0 = 0, today = 0, days = 31, paper = 0 }) => {
  const x0 = 416, y0 = 192, cw = 64, ch = 56, st = Math.max(0, Math.min(4, Math.round(start))), nd = Math.max(28, Math.min(31, Math.round(days)));
  const cells: React.ReactNode[] = [];
  if (paper) for (let k = 0; k < 35; k++) cells.push(<rect key={"p" + k} x={x0 + (k % 7) * cw + 1.5} y={y0 + Math.floor(k / 7) * ch + 1.5} width={cw - 3} height={ch - 3} fill="#dcd6c8" stroke="#9d9786" strokeWidth={1.6} />);
  for (let d = 1; d <= (paper ? 0 : nd); d++) {
    const k = st + d - 1, cx = x0 + (k % 7) * cw, cy = y0 + Math.floor(k / 7) * ch;
    cells.push(<g key={d}>
      <rect x={cx + 1.5} y={cy + 1.5} width={cw - 3} height={ch - 3} rx={paper ? 0 : 4} fill={paper ? "#dcd6c8" : d <= cross ? F1 : F2} stroke={paper ? "#9d9786" : INK} strokeWidth={paper ? 1.6 : 1.8} />
      {!paper && <text x={cx + 8} y={cy + 20} fontFamily={HAND} fontWeight={700} fontSize={17} fill={d <= cross ? "#6b6f82" : "#b9bbc6"}>{d}</text>}
    </g>);
  }
  const marks: React.ReactNode[] = [];
  for (let d = 1; d <= Math.min(cross, nd); d++) {
    const at = crossT0 + (d - 1) * crossDt;
    if (crossDt > 0 && t < at) continue;
    const u = crossDt > 0 ? Math.max(0, Math.min(1, (t - at) / 0.18)) : 1;
    const k = st + d - 1, cx = x0 + (k % 7) * cw, cy = y0 + Math.floor(k / 7) * ch, r = (i: number) => (rnd(d * 11 + i) - 0.5) * 7;
    const a = `M ${cx + 9 + r(1)} ${cy + 8 + r(2)} L ${cx + cw - 9 + r(3)} ${cy + ch - 8 + r(4)}`, b = `M ${cx + cw - 9 + r(5)} ${cy + 8 + r(6)} L ${cx + 9 + r(7)} ${cy + ch - 8 + r(8)}`;
    marks.push(<g key={d} stroke="#EF4E3A" strokeWidth={paper ? 3.4 : 5} strokeLinecap="round" fill="none">
      <path d={a} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, u * 2)} />
      <path d={b} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.max(0, u * 2 - 1)} />
    </g>);
  }
  let ring: React.ReactNode = null;
  if (today > 0 && today <= nd) { const k = st + today - 1; ring = <ellipse cx={x0 + (k % 7) * cw + cw / 2} cy={y0 + Math.floor(k / 7) * ch + ch / 2} rx={cw / 2 - 1} ry={ch / 2 - 1} fill="none" stroke="#EF4E3A" strokeWidth={3.4} />; }
  return (
    <g>
      <path d="M 640 40 L 640 92" {...L} strokeWidth={2} />
      <circle cx={640} cy={92} r={5} fill={INK2} />
      <rect x={396} y={96} width={488} height={394} rx={10} fill={paper ? "#d8d2c2" : "#121216"} {...L} strokeWidth={2.6} stroke={paper ? "#8d8777" : INK} />
      <path d="M 396 106 Q 396 96 406 96 L 874 96 Q 884 96 884 106 L 884 158 L 396 158 Z" fill={paper ? "#bd3b2c" : "#2a1b1b"} stroke={paper ? "#8d8777" : INK} strokeWidth={2.2} strokeLinejoin="round" />
      {!paper && <path d="M 460 112 l 0 -4 M 520 112 l 0 -4 M 760 112 l 0 -4 M 820 112 l 0 -4" stroke={INK2} strokeWidth={4} strokeLinecap="round" />}
      {!paper && <path d="M 430 126 q 90 -10 180 0 M 430 142 q 60 6 120 0" stroke="#6b6f82" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.7} />}
      {!paper && ["S", "M", "T", "W", "T", "F", "S"].map((l, i) => <text key={i} x={x0 + i * cw + cw / 2} y={y0 - 10} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={16} fill="#8a8d9a">{l}</text>)}
      {cells}
      {ring}
      {marks}
    </g>
  );
};

const fmtClock = (v: number) => `${Math.floor(v / 100)}:${String(v % 100).padStart(2, "0")}`;

/** a whole place. `t` = seconds into the shot, `scroll` = px the street has moved (default: t * 240) */
export const SetView: React.FC<{ name: string; t: number; scroll?: number; arg?: Record<string, number> }> = ({ name, t, scroll, arg = {} }) => {
  switch (name) {
    case "bedroom": return <g><Wedge x={930} y={258} w={140} /><Window x={930} y={258} /><Floor /><Nightstand x={332 - (arg.nsExt ?? 0)} w={88 + (arg.nsExt ?? 0)} /><Bed x={420} /><Alarm x={376 - (arg.nsExt ?? 0)} y={FLOOR - 78 - 9} s={0.7} text={arg.clock ? fmtClock(arg.clock) : "5:00"} ring={arg.ring ? t : 0} /></g>;
    case "bedroomdawn": return <g><Wedge x={930} y={258} w={140} col="#e08aa0" o={Math.min(1, 0.5 + t / 4)} /><Window x={930} y={258} dawn={t / 4} /><Floor /><Nightstand x={332 - (arg.nsExt ?? 0)} w={88 + (arg.nsExt ?? 0)} /><Bed x={420} /><Alarm x={376 - (arg.nsExt ?? 0)} y={FLOOR - 78 - 9} s={0.7} text={arg.clock ? fmtClock(arg.clock) : "5:00"} /></g>;
    case "couch": return <g><Floor />{!arg.nolamp && <FloorLamp x={330} on={!!arg.lamp} />}<Couch x={680} /></g>;
    case "desk": return <g><WallClock x={730} y={180} t={t} /><Floor /><Chair x={560} dir={1} /><Desk x={680} /><BookStack x={860} y={FLOOR - 112} /><DeskLamp x={860} y={FLOOR - 154} /></g>;
    case "street": { const off = scroll ?? t * 240; return <g><City off={off} /><StreetLamps off={off} t={t} /><Floor /><RoadDashes off={off} />
      {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M ${wrap(rnd(i * 3) * 1800 - t * (1100 + i * 90), 1800) - 300} ${FLOOR - 330 + rnd(i) * 300} l ${110 + rnd(i * 5) * 160} 0`} stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.12} />)}</g>; }
    case "mirror": return <g><Floor /><Mirror x={760} crack={arg.crack ?? 0} tint={arg.tint ?? 0} hue={arg.tintHue ?? 210} /></g>;
    case "fridge": return <g><Floor /><Fridge x={arg.x ?? 760} open={arg.open ?? 0} t={t} /></g>;
    case "calendar": return <g>{!arg.paper && <Floor />}<Calendar paper={arg.paper ?? 0} t={t} start={arg.start ?? 2} cross={arg.cross ?? 0} crossDt={arg.crossDt ?? 0} crossT0={arg.crossT0 ?? 0} today={arg.today ?? 0} days={arg.days ?? 31} /></g>;
    case "gym": return <g><Bag x={arg.x ?? 770} t={t} hit={arg.hit ?? 1} speed={arg.speed ?? 0} hit0={arg.hit0} hitP={arg.hitP} fx={arg.fx} fy={arg.fy} sp0={arg.sp0} spP={arg.spP} spLen={arg.spLen} /></g>;
    case "stairs": return <g><Stairs /></g>;
    case "hill": return <g><Hills glow={arg.glow ?? 1} hx={arg.hx ?? 430} t={t} /></g>;
    case "court": return <g><Glow x={900} y={160} r={600} c="#ffffff" o={0.07} /><Floor /><CourtMarks /><Hoop x={1060} /></g>;
    case "store": return <g><Floor /><Counter x={760} /></g>;
    case "office": return <g><Floor /><Skyline x={250} y={190} /><Office x={720} /></g>;
    case "spot": return <g><Floor /><Spot x={arg.x ?? 640} t={t} /></g>;
    case "black": return null;
    default: return <g><Floor /></g>;   // void
  }
};

/** loose things. x/y in world px (y = bottom of the thing unless noted) */
export const ThingView: React.FC<{ name: string; x: number; y: number; s?: number; text?: string; t: number; v?: number }> = ({ name, x, y, s = 1, text, t, v = 0 }) => {
  switch (name) {
    case "alarm": return <Alarm x={x} y={y} s={s} text={text ?? "5:00"} ring={v ? t : 0} />;
    case "phone": return <Phone x={x} y={y} s={s} text={text} />;
    case "phonegreen": return <Phone x={x} y={y} s={s} c="9cff9c" text={text} />;
    case "phonepink": return <Phone x={x} y={y} s={s} c="ff6ad5" text={text} />;
    case "spark": return <Spark x={x} y={y} s={s} v={v} />;
    case "speed": return <Speed x={x} y={y} s={s} v={v || 1} />;
    case "ball": return <g transform={`translate(${x} ${y}) scale(${s})`}><circle r={16} fill="#d8682a" {...L} /><path d="M -16 0 L 16 0 M 0 -16 L 0 16 M -11 -11 q 8 11 0 22 M 11 -11 q -8 11 0 22" stroke="#5a2a10" strokeWidth={1.4} fill="none" /></g>;
    case "coin": return <g transform={`translate(${x} ${y}) scale(${s})`}><Glow x={0} y={0} r={50} c="#ffd27a" o={0.4} /><circle r={14} fill="#e8b84a" {...L} /><text y={6} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={16} fill="#8a6418">$</text></g>;
    case "cash": return <g transform={`translate(${x} ${y}) scale(${s})`}><rect x={-28} y={-14} width={56} height={28} rx={4} fill="#7fbf7a" {...L} /><circle r={7} fill="none" stroke="#3d6a3a" strokeWidth={2} /></g>;
    case "jar": {   // v = fill 0..1
      const h = 90 * Math.max(0, Math.min(1, v));
      return <g transform={`translate(${x} ${y}) scale(${s})`}>
        <Glow x={0} y={-50} r={110} c="#ffd27a" o={0.15 + v * 0.35} />
        <rect x={-38} y={-8 - h} width={76} height={h} rx={6} fill="#e8b84a" opacity={0.9} />
        <path d="M -40 -112 L -40 -6 q 0 6 6 6 L 34 0 q 6 0 6 -6 L 40 -112" fill="#ffffff" fillOpacity={0.05} {...L} />
        <rect x={-46} y={-124} width={92} height={14} rx={4} fill={F3} {...L} />
        {text && <text x={0} y={-50} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={20} fill="#f2efe8">{text}</text>}
      </g>;
    }
    case "chart": {  // a screen with a line that climbs (v = progress 0..1); text = label
      const pts = [0, 0.08, 0.04, 0.16, 0.12, 0.26, 0.2, 0.38, 0.32, 0.55, 0.5, 0.78, 1].map((q, i, a) => [-90 + (180 * i) / (a.length - 1), 50 - q * 100]);
      const n = Math.max(2, Math.round(v * pts.length));
      return <g transform={`translate(${x} ${y}) scale(${s})`}>
        <rect x={-110} y={-70} width={220} height={140} rx={10} fill="#0c0f12" {...L} />
        <polyline points={pts.slice(0, n).map((p) => p.join(",")).join(" ")} fill="none" stroke="#9cff9c" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" filter="url(#greenGlow)" />
        {text && <text x={0} y={-48} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={16} fill="#cfd8cf">{text}</text>}
      </g>;
    }
    case "drop": {   // a red line that crashes
      const pts = [0.6, 0.7, 0.62, 0.74, 0.66, 0.5, 0.2, 0.1].map((q, i, a) => [-90 + (180 * i) / (a.length - 1), 50 - q * 100]);
      const n = Math.max(2, Math.round(v * pts.length));
      return <g transform={`translate(${x} ${y}) scale(${s})`}>
        <rect x={-110} y={-70} width={220} height={140} rx={10} fill="#120c0c" {...L} />
        <polyline points={pts.slice(0, n).map((p) => p.join(",")).join(" ")} fill="none" stroke="#ff3a2a" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" filter="url(#redGlow)" />
        {text && <text x={0} y={-48} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={16} fill="#e8cfcf">{text}</text>}
      </g>;
    }
    case "car": return <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M -150 -20 L -150 -60 q 0 -10 10 -12 L -70 -80 L -30 -120 L 70 -120 L 110 -80 L 145 -72 q 8 2 8 12 L 153 -20 Z" fill="#e0b13a" {...L} />
      <path d="M -24 -112 L 62 -112 L 92 -82 L -52 -82 Z" fill="#20242c" {...L} />
      <circle cx={-90} cy={-20} r={24} fill="#18181a" {...L} /><circle cx={90} cy={-20} r={24} fill="#18181a" {...L} />
    </g>;
    case "book": return <g transform={`translate(${x} ${y}) scale(${s})`}><Glow x={0} y={-10} r={90} c="#ffd27a" o={0.35} /><path d="M -40 0 L 0 -8 L 40 0 L 40 -30 L 0 -38 L -40 -30 Z" fill="#e9e3d2" {...L} /><path d="M 0 -8 L 0 -38" {...L} /></g>;
    case "bag": return <g transform={`translate(${x} ${y}) scale(${s})`}><rect x={-26} y={-50} width={52} height={50} rx={4} fill="#c79a5a" {...L} /><path d="M -12 -50 q 12 -22 24 0" {...L} fill="none" /></g>;
    case "trophy": return <g transform={`translate(${x} ${y}) scale(${s})`}><Glow x={0} y={-40} r={110} c="#ffd27a" o={0.5} /><path d="M -26 -80 L 26 -80 L 20 -44 q -20 14 -40 0 Z M -8 -38 L 8 -38 L 8 -14 L -8 -14 Z M -24 -14 L 24 -14 L 24 0 L -24 0 Z" fill="#e8b84a" {...L} /></g>;
    case "zzz": return <g fontFamily={HAND} fill="#8a8d98" opacity={0.8}>
      <text x={x} y={y - ((t * 14) % 30)} fontSize={20 * s}>z</text>
      <text x={x + 18} y={y - 24 - ((t * 14 + 15) % 30)} fontSize={14 * s} opacity={0.7}>z</text>
    </g>;
    case "sweat": return <path d={`M ${x} ${y} q -4 7 0 10 q 4 -3 0 -10`} fill="#9fd4ff" />;
    default: return null;
  }
};
