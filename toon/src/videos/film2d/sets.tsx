// Nov 19: places and things for the flat 2D films. Everything is flat dark-grey shapes with a thin grey outline on a
// near-black stage, one floor line, and light only where the story needs it (a lamp, a phone, the moon, a sunrise).
// World units = px of a 1280x720 frame at camera zoom 1; the floor is at y = FLOOR.
import React from "react";
import { OUTLINE } from "./rig";

export const FLOOR = 560;
const L = { stroke: OUTLINE, strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const D1 = "#161618", D2 = "#222226", D3 = "#2e2e33";

/** soft light pool: a radial gradient blob (lamp, phone, moon) */
export const Glow: React.FC<{ x: number; y: number; r: number; c: string; o?: number }> = ({ x, y, r, c, o = 0.5 }) => (
  <circle cx={x} cy={y} r={r} fill={`url(#g-${c.replace("#", "")})`} opacity={o} />
);
export const GLOW_COLORS = ["ffb35a", "ffffff", "7aa8ff", "ff3a2a", "ff6ad5", "9cff9c", "ffd27a"];

export const Spot: React.FC<{ x: number; w?: number; o?: number }> = ({ x, w = 150, o = 0.22 }) => (
  <g opacity={o}>
    <path d={`M ${x - 26} -40 L ${x + 26} -40 L ${x + w} ${FLOOR} L ${x - w} ${FLOOR} Z`} fill="url(#spotGrad)" />
    <ellipse cx={x} cy={FLOOR} rx={w * 1.05} ry={18} fill="#ffffff" opacity={0.5} />
  </g>
);

const Floor: React.FC<{ x0?: number; x1?: number }> = ({ x0 = -2000, x1 = 3400 }) => <path d={`M ${x0} ${FLOOR} L ${x1} ${FLOOR}`} {...L} strokeWidth={1.6} opacity={0.8} />;

const Window: React.FC<{ x: number; y: number; w?: number; sky?: string; moon?: boolean; sun?: number }> = ({ x, y, w = 96, sky = "#0c0d14", moon = true, sun }) => (
  <g>
    <rect x={x} y={y} width={w} height={w} rx={6} fill={sky} {...L} />
    {moon && <><circle cx={x + w * 0.66} cy={y + w * 0.3} r={w * 0.11} fill="#e8e6df" /><Glow x={x + w * 0.66} y={y + w * 0.3} r={w * 0.4} c="#ffffff" o={0.25} /></>}
    {sun !== undefined && <circle cx={x + w * 0.5} cy={y + w * (1 - sun * 0.6)} r={w * 0.16} fill="#ffb35a" />}
    <path d={`M ${x + w / 2} ${y} L ${x + w / 2} ${y + w} M ${x} ${y + w / 2} L ${x + w} ${y + w / 2}`} {...L} />
  </g>
);

/** a digital clock face: red 7-segment-ish digits */
export const Alarm: React.FC<{ x: number; y: number; s?: number; text?: string; ring?: number }> = ({ x, y, s = 1, text = "5:00", ring = 0 }) => {
  const sh = ring ? Math.sin(ring * 60) * 3 : 0;
  return (
    <g transform={`translate(${x + sh} ${y}) scale(${s})`}>
      <rect x={-48} y={-32} width={96} height={46} rx={10} fill="#111113" {...L} />
      <text x={0} y={2} textAnchor="middle" fontFamily="DSEG, 'Courier New', monospace" fontWeight={700} fontSize={30} fill="#ff3a2a" style={{ letterSpacing: 1 }} filter="url(#redGlow)">{text}</text>
      {ring ? <g {...L} stroke="#ff6a5a" strokeWidth={2.5}>
        <path d="M -62 -30 l -8 -10 M -56 -36 l -4 -12 M 62 -30 l 8 -10 M 56 -36 l 4 -12" />
      </g> : null}
    </g>
  );
};

export const Phone: React.FC<{ x: number; y: number; s?: number; c?: string; text?: string; rot?: number }> = ({ x, y, s = 1, c = "ff6ad5", text, rot = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <Glow x={0} y={0} r={90} c={"#" + c} o={0.45} />
    <rect x={-9} y={-16} width={18} height={32} rx={4} fill={"#" + c} opacity={0.9} {...L} />
    {text && <text x={0} y={-24} textAnchor="middle" fontFamily="Comic Neue" fontWeight={700} fontSize={14} fill="#fff">{text}</text>}
  </g>
);

const Bed: React.FC<{ x: number; occupied?: boolean }> = ({ x }) => (
  <g>
    <path d={`M ${x} ${FLOOR} L ${x} ${FLOOR - 120} q 0 -14 12 -14 q 12 0 12 14 L ${x + 24} ${FLOOR}`} fill={D2} {...L} />
    <rect x={x + 10} y={FLOOR - 66} width={330} height={26} rx={8} fill={D3} {...L} />
    <path d={`M ${x + 20} ${FLOOR - 40} L ${x + 20} ${FLOOR} M ${x + 330} ${FLOOR - 40} L ${x + 330} ${FLOOR}`} {...L} strokeWidth={5} />
    <rect x={x + 28} y={FLOOR - 82} width={64} height={20} rx={9} fill="#3a3a40" {...L} />
  </g>
);
/** the blanket goes over whoever lies in the bed */
export const Blanket: React.FC<{ x: number; heave?: number }> = ({ x, heave = 0 }) => (
  <path d={`M ${x + 104} ${FLOOR - 64} q 10 ${-34 - heave} 60 -36 q 90 -6 150 4 q 22 4 24 32 Z`} fill="#2c3450" {...L} />
);
const Nightstand: React.FC<{ x: number }> = ({ x }) => (
  <g><rect x={x} y={FLOOR - 70} width={78} height={70} rx={8} fill={D2} {...L} /><circle cx={x + 39} cy={FLOOR - 38} r={3} fill={OUTLINE} /></g>
);
const Couch: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <rect x={x - 170} y={FLOOR - 150} width={340} height={90} rx={26} fill="#2a2a33" {...L} />
    <rect x={x - 200} y={FLOOR - 92} width={60} height={92} rx={22} fill="#33333d" {...L} />
    <rect x={x + 140} y={FLOOR - 92} width={60} height={92} rx={22} fill="#33333d" {...L} />
    <rect x={x - 150} y={FLOOR - 80} width={300} height={44} rx={14} fill="#30303a" {...L} />
    <path d={`M ${x - 150} ${FLOOR - 36} L ${x - 150} ${FLOOR} M ${x + 150} ${FLOOR - 36} L ${x + 150} ${FLOOR}`} {...L} strokeWidth={4} />
  </g>
);
const Lamp: React.FC<{ x: number; on?: boolean; desk?: boolean }> = ({ x, on = true, desk }) => {
  const top = desk ? FLOOR - 190 : FLOOR - 220;
  return (
    <g>
      {on && <Glow x={x} y={top + 30} r={260} c="#ffb35a" o={0.38} />}
      {on && <path d={`M ${x - 24} ${top + 22} L ${x + 24} ${top + 22} L ${x + 120} ${desk ? FLOOR - 110 : FLOOR} L ${x - 120} ${desk ? FLOOR - 110 : FLOOR} Z`} fill="url(#warmCone)" opacity={0.5} />}
      <path d={`M ${x} ${top + 20} L ${x} ${desk ? FLOOR - 110 : FLOOR}`} {...L} strokeWidth={3} />
      <path d={`M ${x - 26} ${top + 22} L ${x - 14} ${top} L ${x + 14} ${top} L ${x + 26} ${top + 22} Z`} fill={on ? "#e9b56a" : D3} {...L} />
    </g>
  );
};
const Desk: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <rect x={x - 140} y={FLOOR - 112} width={280} height={16} rx={5} fill={D3} {...L} />
    <path d={`M ${x - 126} ${FLOOR - 96} L ${x - 126} ${FLOOR} M ${x + 126} ${FLOOR - 96} L ${x + 126} ${FLOOR}`} {...L} strokeWidth={5} />
    <rect x={x + 40} y={FLOOR - 134} width={60} height={10} rx={2} fill="#4a3f36" {...L} />
    <rect x={x + 44} y={FLOOR - 146} width={52} height={12} rx={2} fill="#3c4450" {...L} />
  </g>
);
const Chair: React.FC<{ x: number; dir?: number }> = ({ x, dir = 1 }) => (
  <g><rect x={x - 30} y={FLOOR - 50} width={60} height={10} rx={4} fill={D3} {...L} /><path d={`M ${x - 24} ${FLOOR - 40} L ${x - 24} ${FLOOR} M ${x + 24} ${FLOOR - 40} L ${x + 24} ${FLOOR} M ${x - 28 * dir} ${FLOOR - 50} L ${x - 30 * dir} ${FLOOR - 130}`} {...L} strokeWidth={4} /></g>
);
const WallClock: React.FC<{ x: number; y: number; t: number }> = ({ x, y, t }) => (
  <g><circle cx={x} cy={y} r={20} fill={D1} {...L} /><path d={`M ${x} ${y} L ${x + Math.sin(t * 2) * 13} ${y - Math.cos(t * 2) * 13} M ${x} ${y} L ${x + 8} ${y + 4}`} {...L} /></g>
);
const Mirror: React.FC<{ x: number; crack?: number }> = ({ x, crack = 0 }) => (
  <g>
    <ellipse cx={x} cy={FLOOR - 160} rx={70} ry={110} fill="#0d0d10" {...L} strokeWidth={4} stroke="#9a9792" />
    <rect x={x - 70} y={FLOOR - 52} width={140} height={20} rx={8} fill={D3} {...L} />
    <rect x={x - 56} y={FLOOR - 32} width={112} height={32} rx={8} fill={D2} {...L} />
    {crack > 0 && <path d={`M ${x + 6} ${FLOOR - 170} l -40 -50 M ${x + 6} ${FLOOR - 170} l 46 -40 M ${x + 6} ${FLOOR - 170} l -36 70 M ${x + 6} ${FLOOR - 170} l 50 60 M ${x + 6} ${FLOOR - 170} l 4 -96`} stroke="#d8d6d0" strokeWidth={1.4} opacity={crack} fill="none" />}
  </g>
);
const Bag: React.FC<{ x: number; t: number; hit?: number }> = ({ x, t, hit = 0 }) => {
  const sw = Math.sin(t * 6) * hit * 6;
  return (
    <g transform={`rotate(${sw} ${x} 40)`}>
      <path d={`M ${x} 0 L ${x} ${FLOOR - 330}`} {...L} />
      <rect x={x - 46} y={FLOOR - 330} width={92} height={210} rx={34} fill="#d8261c" stroke="#ff6050" strokeWidth={2.2} filter="url(#redGlow)" />
      <path d={`M ${x - 30} ${FLOOR - 280} l 20 6 M ${x + 10} ${FLOOR - 220} l 18 -4 M ${x - 20} ${FLOOR - 170} l 14 8`} stroke="#8a1410" strokeWidth={2} />
    </g>
  );
};
const City: React.FC<{ off: number }> = ({ off }) => {
  const bs = [[-400, 230], [-310, 300], [-220, 200], [-150, 340], [-60, 260], [20, 380], [110, 220], [190, 300], [280, 250], [360, 420], [460, 270], [540, 330], [630, 210], [710, 360], [800, 290], [880, 240], [960, 400], [1060, 260], [1140, 330], [1230, 220], [1310, 300], [1400, 370], [1490, 250], [1580, 320], [1680, 280]];
  return (
    <g transform={`translate(${-off * 0.35} 0)`}>
      {bs.map(([x, h], i) => <g key={i}>
        <rect x={x} y={FLOOR - h} width={74} height={h} fill={i % 2 ? "#0f0f12" : "#121216"} stroke="#26262c" strokeWidth={1.4} />
        {[0, 1, 2].map((r) => (i * 7 + r * 3) % 5 === 0 ? <rect key={r} x={x + 14 + (r % 2) * 30} y={FLOOR - h + 30 + r * 40} width={12} height={14} fill="#e9c27a" opacity={0.7} /> : null)}
      </g>)}
    </g>
  );
};
const StreetLamps: React.FC<{ off: number }> = ({ off }) => (
  <g transform={`translate(${-(off % 420)} 0)`}>
    {[-420, 0, 420, 840, 1260, 1680].map((x) => <g key={x}>
      <Glow x={x} y={FLOOR - 260} r={200} c="#ffb35a" o={0.35} />
      <ellipse cx={x} cy={FLOOR} rx={130} ry={14} fill="#ffb35a" opacity={0.12} />
      <path d={`M ${x} ${FLOOR} L ${x} ${FLOOR - 250} q 0 -16 18 -16`} {...L} strokeWidth={3} />
      <circle cx={x + 18} cy={FLOOR - 262} r={6} fill="#ffd9a0" />
    </g>)}
  </g>
);
export const Stairs: React.FC = () => {
  // steps rise from bottom-left (x 200, floor) to top-right; step 44 wide, 26 high
  let d = `M -200 ${FLOOR + 120} L 200 ${FLOOR + 120} L 200 ${FLOOR}`;
  for (let i = 0; i < 26; i++) d += ` l 44 0 l 0 -26`;
  d += ` L 2000 -400 L 2000 ${FLOOR + 400} L -200 ${FLOOR + 400} Z`;
  return <path d={d} fill="#1a1a1d" stroke="#8f8c86" strokeWidth={2} strokeLinejoin="round" />;
};
/** feet position on the stairs at progress u (0..1) */
export const stairAt = (u: number) => { const i = u * 22; return { x: 200 + i * 44 + 22, y: FLOOR - Math.floor(i) * 26 }; };
const Hills: React.FC<{ glow: number }> = ({ glow }) => (
  <g>
    <rect x={-1000} y={-600} width={3400} height={1800} fill="url(#dawnSky)" opacity={glow} />
    <circle cx={640} cy={FLOOR - 40} r={90} fill="#ffcf8a" opacity={0.85 * glow} />
    <Glow x={640} y={FLOOR - 40} r={520} c="#ffb35a" o={0.7 * glow} />
    <path d={`M -1000 ${FLOOR - 20} C -400 ${FLOOR - 120}, 0 ${FLOOR - 10}, 300 ${FLOOR - 60} S 900 ${FLOOR - 140}, 1300 ${FLOOR - 50} S 2000 ${FLOOR - 90}, 2400 ${FLOOR - 40} L 2400 1400 L -1000 1400 Z`} fill="#1d120c" />
    <path d={`M -1000 ${FLOOR + 40} C -200 ${FLOOR - 10}, 300 ${FLOOR + 50}, 640 ${FLOOR - 6} S 1500 ${FLOOR + 60}, 2400 ${FLOOR + 10} L 2400 1400 L -1000 1400 Z`} fill="#0e0907" stroke="#3a2618" strokeWidth={1.5} />
  </g>
);
const Hoop: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <path d={`M ${x + 60} ${FLOOR} L ${x + 60} ${FLOOR - 300} L ${x + 10} ${FLOOR - 300}`} {...L} strokeWidth={6} />
    <rect x={x - 6} y={FLOOR - 360} width={16} height={110} rx={3} fill={D3} {...L} />
    <ellipse cx={x - 30} cy={FLOOR - 290} rx={34} ry={7} fill="none" stroke="#e8662a" strokeWidth={4} />
    <path d={`M ${x - 62} ${FLOOR - 288} l 10 40 M ${x - 46} ${FLOOR - 286} l 6 40 M ${x - 30} ${FLOOR - 285} l 0 40 M ${x - 14} ${FLOOR - 286} l -6 40 M ${x + 2} ${FLOOR - 288} l -10 40 M ${x - 52} ${FLOOR - 250} l 44 0`} stroke="#bdbab4" strokeWidth={1.4} />
  </g>
);
const Counter: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <rect x={x - 160} y={FLOOR - 120} width={320} height={120} rx={8} fill={D2} {...L} />
    <rect x={x + 60} y={FLOOR - 170} width={70} height={50} rx={6} fill={D3} {...L} />
    <rect x={x + 70} y={FLOOR - 162} width={50} height={18} rx={3} fill="#9cff9c" opacity={0.7} />
    <path d={`M ${x - 600} ${FLOOR - 330} L ${x - 600} ${FLOOR} M ${x - 600} ${FLOOR - 330} L ${x - 300} ${FLOOR - 330} L ${x - 300} ${FLOOR}`} {...L} opacity={0.6} />
    {[0, 1, 2].map((r) => <path key={r} d={`M ${x - 600} ${FLOOR - 90 - r * 80} L ${x - 300} ${FLOOR - 90 - r * 80}`} {...L} opacity={0.6} />)}
  </g>
);
const Office: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <rect x={x - 150} y={FLOOR - 104} width={300} height={14} rx={4} fill={D3} {...L} />
    <path d={`M ${x - 136} ${FLOOR - 90} L ${x - 136} ${FLOOR} M ${x + 136} ${FLOOR - 90} L ${x + 136} ${FLOOR}`} {...L} strokeWidth={5} />
    <rect x={x - 10} y={FLOOR - 220} width={140} height={96} rx={8} fill="#0d1014" {...L} />
    <path d={`M ${x + 60} ${FLOOR - 124} L ${x + 60} ${FLOOR - 104} M ${x + 36} ${FLOOR - 104} L ${x + 84} ${FLOOR - 104}`} {...L} strokeWidth={4} />
    <Glow x={x + 60} y={FLOOR - 172} r={160} c="#7aa8ff" o={0.3} />
  </g>
);

/** a whole place. `t` = seconds into the shot, `scroll` = px the street has moved */
export const SetView: React.FC<{ name: string; t: number; scroll?: number; arg?: Record<string, number> }> = ({ name, t, scroll = 0, arg = {} }) => {
  switch (name) {
    case "bedroom": return <g><Window x={1000} y={120} /><path d="M 1000 216 L 760 560 L 900 560 L 1096 216 Z" fill="#ffffff" opacity={0.035} /><Floor /><Nightstand x={330} /><Bed x={420} /><Alarm x={369} y={FLOOR - 92} s={0.62} text={arg.clock ? fmtClock(arg.clock) : "5:00"} ring={arg.ring ? t : 0} /></g>;
    case "bedroomdawn": return <g><Window x={1000} y={120} sky="#3a2414" moon={false} sun={Math.min(1, t / 4)} /><path d="M 1000 216 L 760 560 L 900 560 L 1096 216 Z" fill="#ffb35a" opacity={0.08} /><Floor /><Nightstand x={330} /><Bed x={420} /><Alarm x={369} y={FLOOR - 92} s={0.62} text="5:00" /></g>;
    case "couch": return <g><Floor /><Lamp x={330} on={!!arg.lamp} /><Couch x={680} /></g>;
    case "desk": return <g><Floor /><WallClock x={900} y={210} t={t} /><Chair x={560} dir={1} /><Desk x={700} /><Lamp x={760} desk /></g>;
    case "street": return <g><City off={scroll} /><StreetLamps off={scroll} /><Floor /></g>;
    case "mirror": return <g><Floor /><Mirror x={760} crack={arg.crack ?? 0} /></g>;
    case "gym": return <g><Floor /><Bag x={780} t={t} hit={arg.hit ?? 1} /></g>;
    case "stairs": return <g><Stairs /></g>;
    case "hill": return <g><Hills glow={arg.glow ?? 1} /></g>;
    case "court": return <g><Floor /><Glow x={640} y={120} r={700} c="#ffffff" o={0.08} /><Hoop x={1060} /></g>;
    case "store": return <g><Floor /><Counter x={760} /></g>;
    case "office": return <g><Floor /><Window x={260} y={150} sky="#101624" /><Office x={720} /></g>;
    case "spot": return <g><Floor /><Spot x={arg.x ?? 640} /></g>;
    case "black": return null;
    default: return <g><Floor /></g>;   // void
  }
};
const fmtClock = (v: number) => `${Math.floor(v / 100)}:${String(v % 100).padStart(2, "0")}`;

/** loose things. x/y in world px (y = bottom of the thing unless noted) */
export const ThingView: React.FC<{ name: string; x: number; y: number; s?: number; text?: string; t: number; v?: number }> = ({ name, x, y, s = 1, text, t, v = 0 }) => {
  switch (name) {
    case "alarm": return <Alarm x={x} y={y} s={s} text={text ?? "5:00"} ring={v ? t : 0} />;
    case "phone": return <Phone x={x} y={y} s={s} text={text} />;
    case "phonegreen": return <Phone x={x} y={y} s={s} c="9cff9c" text={text} />;
    case "ball": return <g transform={`translate(${x} ${y}) scale(${s})`}><circle r={16} fill="#d8682a" {...L} /><path d="M -16 0 L 16 0 M 0 -16 L 0 16 M -11 -11 q 8 11 0 22 M 11 -11 q -8 11 0 22" stroke="#5a2a10" strokeWidth={1.4} fill="none" /></g>;
    case "coin": return <g transform={`translate(${x} ${y}) scale(${s})`}><Glow x={0} y={0} r={50} c="#ffd27a" o={0.4} /><circle r={14} fill="#e8b84a" {...L} /><text y={6} textAnchor="middle" fontFamily="Comic Neue" fontWeight={700} fontSize={16} fill="#8a6418">$</text></g>;
    case "cash": return <g transform={`translate(${x} ${y}) scale(${s})`}><rect x={-28} y={-14} width={56} height={28} rx={4} fill="#7fbf7a" {...L} /><circle r={7} fill="none" stroke="#3d6a3a" strokeWidth={2} /></g>;
    case "jar": {   // v = fill 0..1
      const h = 90 * Math.max(0, Math.min(1, v));
      return <g transform={`translate(${x} ${y}) scale(${s})`}>
        <Glow x={0} y={-50} r={110} c="#ffd27a" o={0.15 + v * 0.35} />
        <rect x={-38} y={-8 - h} width={76} height={h} rx={6} fill="#e8b84a" opacity={0.9} />
        <path d="M -40 -112 L -40 -6 q 0 6 6 6 L 34 0 q 6 0 6 -6 L 40 -112" fill="#ffffff" fillOpacity={0.05} {...L} />
        <rect x={-46} y={-124} width={92} height={14} rx={4} fill={D3} {...L} />
        {text && <text x={0} y={-50} textAnchor="middle" fontFamily="Comic Neue" fontWeight={700} fontSize={20} fill="#f2efe8">{text}</text>}
      </g>;
    }
    case "chart": {  // a screen with a line that climbs (v = progress 0..1); text = label
      const pts = [0, 0.08, 0.04, 0.16, 0.12, 0.26, 0.2, 0.38, 0.32, 0.55, 0.5, 0.78, 1].map((q, i, a) => [-90 + (180 * i) / (a.length - 1), 50 - q * 100]);
      const n = Math.max(2, Math.round(v * pts.length));
      return <g transform={`translate(${x} ${y}) scale(${s})`}>
        <rect x={-110} y={-70} width={220} height={140} rx={10} fill="#0c0f12" {...L} />
        <polyline points={pts.slice(0, n).map((p) => p.join(",")).join(" ")} fill="none" stroke="#9cff9c" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" filter="url(#greenGlow)" />
        {text && <text x={0} y={-48} textAnchor="middle" fontFamily="Comic Neue" fontWeight={700} fontSize={16} fill="#cfd8cf">{text}</text>}
      </g>;
    }
    case "drop": {   // a red line that crashes
      const pts = [0.6, 0.7, 0.62, 0.74, 0.66, 0.5, 0.2, 0.1].map((q, i, a) => [-90 + (180 * i) / (a.length - 1), 50 - q * 100]);
      const n = Math.max(2, Math.round(v * pts.length));
      return <g transform={`translate(${x} ${y}) scale(${s})`}>
        <rect x={-110} y={-70} width={220} height={140} rx={10} fill="#120c0c" {...L} />
        <polyline points={pts.slice(0, n).map((p) => p.join(",")).join(" ")} fill="none" stroke="#ff3a2a" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" filter="url(#redGlow)" />
        {text && <text x={0} y={-48} textAnchor="middle" fontFamily="Comic Neue" fontWeight={700} fontSize={16} fill="#e8cfcf">{text}</text>}
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
    case "zzz": return <text x={x} y={y - ((t * 14) % 30)} fontFamily="Comic Neue" fontWeight={700} fontSize={20 * s} fill="#8f8c86" opacity={0.8}>z</text>;
    case "sweat": return <path d={`M ${x} ${y} q -4 7 0 10 q 4 -3 0 -10`} fill="#9fd4ff" />;
    default: return null;
  }
};
