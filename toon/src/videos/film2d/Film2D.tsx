// Nov 19 (Sam: "Analyze 3 of them frame by frame and replicate almost exactly ... the look the movement everything"):
// the flat 2D silent film. A cream bean character on a near-black stage (#0B0B0B), side-on, thin grey hand-drawn outlines,
// light only from lamps / phones / the moon / a sunrise, one sentence at a time, a red glowing inner-voice monster, a day
// counter, chunky hand-lettered title cards with a red wavy underline. Study: C:\Users\rsn\tools\dayone-breakdown (DISCIPLINE).
// Our own character, places, music and lines.
//
// Props: inputProps.d2 = { shots: Shot2[], film: { lines, cards, day, hud, thumb } } (built by pipeline/film2d.py).
//
// Camera (Shot2.cam): none = the set's default framing + slow linear push-in (SET_CAMS in sets.tsx, ~1 %/s);
//   { from: [cx,cy,zoom] }            locked;   { from, push: 1.2 }   push-in %/s (negative = pull out);
//   { from, to, ease }                move; ease "lin" (default) | "in" (slow start, the 1.0->1.8x zoom before a slam) | "out" | "io".
// Shot2.arg extras (numbers, so they pass through pipeline/film2d.py): dip = N frames: 1 black frame then an N-frame
//   fade-in (use 4); flashAmp (0..1, default .62) and flashLen (frames, default 10) shape the flash frames in Shot2.flash;
//   bloom = seconds into the beat of a golden-peach full-frame bloom (20 f up, 28 f down).
// Text: narration = white fade (no typing); red + size < 60 = whisper typed ~2 f/char above the monster (or `at`);
//   red + size >= 60 = slam that hard-pops with a 3 f overshoot, centred near the top.
//   white: true  = white bold "pop" line (e.g. "DAY 1."): same hard pop as the slam but white, bold, typed as written, default size 84,
//                  centred near the top (or `at`).
//   bold: true   = bold spotlight line: narration (white fade) in bold, e.g. the second line of a pair.
//   shatter: true | seconds = on a slam / pop line the letters break apart and fall: true = 16 f before the line ends, a number = seconds
//                  into the line when the break starts (the break lasts 16 f; make the line long enough).
//   Line fields in JSON "say" entries: t, red, white, bold, shatter, at, size, cps, delay, until.
// Title card (beat "card": {big, line, cmd}): optional timing / size fields, defaults = the old look:
//   tagAt = seconds from the card start when `line` (the tagline) fades in (default: just after the underline is drawn, ~ big letters
//   2.4 f each + 32 f); cmdAt = seconds when `cmd` (the "You decide." end line) appears (default 1.5 s after the tagline);
//   fs = title font size px (default: as big as fits, max 150).
//   sy = vertical stretch of the title (the reference letters are taller / narrower than Comic Neue, default 1)
//   outAt / outLen = seconds from the card start when the card starts fading out / how long the fade takes (default: the last third, max 2 s).
//   The title is heavy: bold 700 + a 5 px same-colour stroke (matches the reference's thick hand-lettered DISCIPLINE).
// Beat keys passed through (film2d.py KEYS):
//   grade: "sunset" = warm orange wash + low sun glow | "rain" = cool blue-grey wash, darker, diagonal rain streaks;  arg.gradeAmt 0..1 (default 1)
//   arg.punchPhase = seconds the punch cycle is shifted (contact lands 0.42 s into a cycle: use it to land the punch on a music hit)
//   arg.punch = seconds per punch cycle of the "punch" pose in this beat (default 1.25, the reference uses 2.5)
//   arg.embers = N floating embers rising through the frame (try 40) | arg.emberSpeed multiplier (default 1)
//   arg.burst = seconds into the beat of a spark burst (radial yellow-white streaks, 0.9 s) | arg.burstX, arg.burstY screen px
//   (default 640, 300) | arg.burstN count (default 28)
//   lying hero in a bed ("bed": true): the blanket now starts right of the face, so the face shows on the pillow.
import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import "@fontsource/comic-neue/700.css";
import "@fontsource/comic-neue/400.css";
import { Expr, Guy, handOf, headOf, Look, pose } from "./rig";
import { Blanket, FLOOR, GLOW_COLORS, SET_CAMS, SetView, stairAt, ThingView } from "./sets";

type V3 = [number, number, number];
export type Char2 = { look?: Look; x: number; y?: number; dir?: number; pose?: string; expr?: Expr; exprAt?: [number, Expr][]; poseAt?: [number, string][]; scale?: number; to?: [number, number]; stairs?: [number, number]; bed?: boolean; dim?: number; ease?: boolean };
export type Thing2 = { name: string; x?: number; y?: number; s?: number; text?: string; v?: number | [number, number]; hand?: number; at?: number; dx?: number; dy?: number };
export type Cam2 = { from?: V3; to?: V3; ease?: "lin" | "in" | "out" | "io"; push?: number };
export type Shot2 = { a: number; n: number; set: string; arg?: Record<string, number>; cam?: Cam2; chars?: Char2[]; things?: Thing2[]; fade?: number; fadeOut?: number; sat?: [number, number]; shake?: [number, number][]; flash?: number[]; scroll?: [number, number]; spot?: number; dark?: number; grade?: "sunset" | "rain" };
export type Line2 = { a: number; n: number; t: string; red?: boolean; white?: boolean; bold?: boolean; shatter?: boolean | number; at?: "top" | "mid" | "low" | [number, number]; size?: number; cps?: number };
export type Card2 = { a: number; n: number; big: string; line?: string; cmd?: string; tagAt?: number; cmdAt?: number; fs?: number; outAt?: number; outLen?: number; sy?: number };
export type Day2 = { a: number; n: number; t: string };
export type Hud2 = { a: number; n: number; label: string; from: number; to: number; unit?: string };
export type Thumb2 = { words: string; red?: string[]; pos?: "tl" | "tr" };
type Props = { shots: Shot2[]; film: { lines?: Line2[]; cards?: Card2[]; day?: Day2[]; hud?: Hud2[]; thumb?: Thumb2 } };

const P = (): Props => ((getInputProps() as { d2?: Props }).d2 ?? { shots: [], film: {} });
export const D2_FRAMES = Math.max(1, ...P().shots.map((s) => s.a + s.n));

const BG = "#0B0B0B", WHITE = "#EDEBE7", RED = "#EF4E3A";
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const easeBy = (k: string | undefined, u: number) => (k === "in" ? u ** 2.2 : k === "out" ? 1 - (1 - u) ** 2.2 : k === "io" ? ease(u) : u);
/** visibility with linear fade in / out (frames) */
const vis = (f: number, a: number, n: number, fin = 8, fout = 8) => (f < a || f >= a + n ? 0 : Math.min(clamp((f - a + 1) / fin), clamp((a + n - f) / fout)));
/** day label; "DAY 1~47" counts up from 1 to 47 over ~1.5 s (reference curve: 11 at 0.3 s, 33 at 0.6 s, 43 at 0.9 s, 46 at 1.2 s) */
const dayLabel = (t: string, sec: number) => {
  const m = /^(.*?)(\d+)~(\d+)$/.exec(t); if (!m) return t;
  const a = +m[2], b = +m[3], kp = [[0, 0], [0.3, 0.217], [0.6, 0.696], [0.9, 0.913], [1.2, 0.978], [1.6, 1]];
  let u = 1; for (let i = 1; i < kp.length; i++) if (sec < kp[i][0]) { u = kp[i - 1][1] + (kp[i][1] - kp[i - 1][1]) * ((sec - kp[i - 1][0]) / (kp[i][0] - kp[i - 1][0])); break; }
  return m[1] + Math.round(a + (b - a) * Math.max(0, u));
};
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const useFontsReady = () => {
  const [h] = useState(() => delayRender("film2d fonts"));
  useEffect(() => { Promise.all([document.fonts.load("700 40px 'Comic Neue'"), document.fonts.load("400 40px 'Comic Neue'")]).catch(() => 0).finally(() => continueRender(h)); }, [h]);
};
const HAND = "'Comic Neue', 'Comic Sans MS', cursive";

const Defs: React.FC = () => (
  <defs>
    {GLOW_COLORS.map((c) => <radialGradient key={c} id={`g-${c}`}><stop offset="0" stopColor={"#" + c} stopOpacity={0.9} /><stop offset="0.35" stopColor={"#" + c} stopOpacity={0.35} /><stop offset="1" stopColor={"#" + c} stopOpacity={0} /></radialGradient>)}
    <linearGradient id="coneW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity={0.05} /><stop offset="1" stopColor="#fff" stopOpacity={0.17} /></linearGradient>
    <linearGradient id="coneWarm" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb35a" stopOpacity={0.55} /><stop offset="1" stopColor="#ffb35a" stopOpacity={0.02} /></linearGradient>
    <linearGradient id="winDawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3e3566" /><stop offset="0.55" stopColor="#8a5a82" /><stop offset="1" stopColor="#d08a82" /></linearGradient>
    <linearGradient id="sumSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e1416" /><stop offset="0.42" stopColor="#3a1f1c" /><stop offset="0.52" stopColor="#6a3a26" /><stop offset="0.6" stopColor="#8c5230" /><stop offset="1" stopColor="#b8703c" /></linearGradient>
    <linearGradient id="bagGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#c01e16" /><stop offset="0.3" stopColor="#f0402c" /><stop offset="0.6" stopColor="#e8281e" /><stop offset="1" stopColor="#a8160f" /></linearGradient>
    <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    <filter id="greenGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    <filter id="soft6" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
    <filter id="soft8" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" /></filter>
    {/* the monster: a red rim that glows outward */}
    <filter id="monGlow" x="-60%" y="-40%" width="220%" height="180%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d" />
      <feFlood floodColor="#ff2a1a" result="r" /><feComposite in="r" in2="d" operator="in" result="rim" />
      <feGaussianBlur in="rim" stdDeviation="9" result="soft" />
      <feMerge><feMergeNode in="soft" /><feMergeNode in="soft" /><feMergeNode in="rim" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    {/* hand-drawn wobble on every outline (fixed seed: lines do not boil) */}
    <filter id="wob" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={7} result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" /></filter>
  </defs>
);

/** where everybody stands at time tl of shot s */
const charsOf = (s: Shot2, tl: number, u: number) => (s.chars ?? []).map((c, i) => {
  let name = c.pose ?? "stand"; for (const [at, p] of c.poseAt ?? []) if (tl >= at) name = p;
  let e: Expr = c.expr ?? "neutral"; for (const [at, x] of c.exprAt ?? []) if (tl >= at) e = x;
  const p = pose(name, tl + i * 0.37 + (s.arg?.punchPhase ?? 0), s.arg?.punch);
  let x = c.x, y = c.y ?? FLOOR;
  if (c.to) { const k = c.ease ? ease(u) : u; x = lerp(c.x, c.to[0], k); y = lerp(c.y ?? FLOOR, c.to[1], k); }
  if (c.stairs) { const q = stairAt(lerp(c.stairs[0], c.stairs[1], u)); x = q.x; y = q.y; }
  return { c, p, e, x, y, dir: c.dir ?? 1, sc: c.scale ?? 1, name };
});
type CharState = ReturnType<typeof charsOf>;

/** camera centre + zoom at frame f of shot s */
const camOf = (s: Shot2, f: number, chars: CharState) => {
  const tl = (f - s.a) / 30, u = clamp((f - s.a) / Math.max(1, s.n - 1));
  const def = SET_CAMS[s.set] ?? SET_CAMS.void, cm = s.cam;
  let cx: number, cy: number, z: number;
  if (cm?.to) {
    const from = cm.from ?? def.c, k = easeBy(cm.ease, u);
    cx = lerp(from[0], cm.to[0], k); cy = lerp(from[1], cm.to[1], k); z = lerp(from[2], cm.to[2], k);
  } else {
    const from = cm?.from ?? def.c, push = cm?.push ?? (cm?.from ? 0 : def.push);
    cx = from[0]; cy = from[1]; z = from[2] * (1 + (push / 100) * tl);
    const hero = s.set === "stairs" && !cm?.from ? chars.find((q) => q.c.stairs && !q.c.look?.monster) : undefined;
    if (hero) { z = 1.0; cx = hero.x + 160 / z; cy = hero.y - 160 / z; }
  }
  for (const [at, amp] of s.shake ?? []) { const k = tl - at; if (k >= 0 && k < 0.5) { const d = amp * (1 - k / 0.5); cx += Math.sin(k * 90) * d; cy += Math.cos(k * 77) * d; } }
  return { cx, cy, z };
};

const Shot: React.FC<{ s: Shot2; f: number }> = ({ s, f }) => {
  const tl = (f - s.a) / 30, u = clamp((f - s.a) / Math.max(1, s.n - 1));
  const chars = charsOf(s, tl, u);
  const { cx, cy, z } = camOf(s, f, chars);
  const scroll = s.scroll ? lerp(s.scroll[0], s.scroll[1], u) : undefined;
  const sat = s.sat ? lerp(s.sat[0], s.sat[1], u) : 1;
  const things = (s.things ?? []).filter((th) => th.at === undefined || tl >= th.at);
  return (
    <g transform={`translate(640 360) scale(${z}) translate(${-cx} ${-cy})`} style={{ filter: sat < 0.999 ? `saturate(${sat})` : undefined }}>
      <g filter="url(#wob)">
        <SetView name={s.set} t={tl} scroll={scroll} arg={s.arg} />
        {chars.map(({ c, p, e, x, y, dir, sc, name }, i) => <g key={i}>
          <Guy p={p} e={e} dir={dir} t={tl + i} look={c.look} scale={sc} x={x} y={c.bed ? y - 96 : y} dim={c.dim} />
          {c.bed && <Blanket x={420} heave={Math.sin(tl * 2) * 2} x0={Math.max(532, x + headOf(p, dir).x * sc + 46)} />}
          {name === "sleepdesk" || (c.bed && e === "sleep") ? <ThingView name="zzz" x={x + 40 * dir} y={y - (c.bed ? 150 : 170) * sc} t={tl} /> : null}
        </g>)}
        {things.map((th, i) => {
          let x = th.x ?? 640, y = th.y ?? FLOOR;
          if (th.hand !== undefined && chars[th.hand]) { const ch = chars[th.hand], h = handOf(ch.p, ch.dir); x = ch.x + h.x * ch.sc + (th.dx ?? 0); y = (ch.c.bed ? ch.y - 96 : ch.y) + h.y * ch.sc + (th.dy ?? 0); }
          const v = Array.isArray(th.v) ? lerp(th.v[0], th.v[1], ease(u)) : th.v ?? 0;
          return <ThingView key={i} name={th.name} x={x} y={y} s={th.s} text={th.text} t={tl} v={v} />;
        })}
      </g>
    </g>
  );
};

/** where a line sits on screen (1280x720). Narration: top-centre. Whisper: above the monster's head. Slam: big, near the top. */
const placeOf = (l: Line2, shots: Shot2[]): [number, number] => {
  if (Array.isArray(l.at)) return l.at;
  const size = l.size ?? (l.red ? 30 : 38), slam = (!!l.red && size >= 60) || !!l.white;
  if (l.at === "mid") return [640, 360];
  if (l.at === "low") return [640, 560];
  if (l.at === "top" || !l.red || slam) return [640, slam ? 172 : 152];
  const s = shots.find((x) => l.a >= x.a && l.a < x.a + x.n);
  if (s) {
    const f = l.a + 8, tl = (f - s.a) / 30, u = clamp((f - s.a) / Math.max(1, s.n - 1));
    const chars = charsOf(s, tl, u), m = chars.find((q) => q.c.look?.monster);
    if (m) {
      const { cx, cy, z } = camOf(s, f, chars);
      const sx = 640 + (m.x - cx) * z, sy = 360 + (m.y - 330 * m.sc - cy) * z - 20;
      if (sy < 130) return [Math.max(230, Math.min(1050, sx + (sx < 640 ? 150 : -150))), Math.max(130, sy + 80)];   // no room above the head: beside it
      return [Math.max(230, Math.min(1050, sx)), Math.min(560, sy)];
    }
  }
  return [640, 240];
};

/** letters of a slam / pop line: after `sa` frames they break apart, fly out and fall (deterministic) */
const Shatter: React.FC<{ text: string; k: number }> = ({ text, k }) => (
  <>{text.split("").map((ch, i) => {
    const dx = (rnd(i * 5 + 2) - 0.5) * 360 * k, dy = (rnd(i * 3 + 1) - 0.65) * 120 * k + 260 * k * k, rot = (rnd(i * 7 + 4) - 0.5) * 220 * k;
    return <span key={i} style={{ display: "inline-block", whiteSpace: "pre", transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: clamp(1 - k * 1.15) }}>{ch}</span>;
  })}</>
);

const Line: React.FC<{ l: Line2; f: number; pos: [number, number] }> = ({ l, f, pos }) => {
  const size = l.size ?? (l.red ? 30 : l.white ? 84 : 38), slam = (!!l.red && size >= 60) || !!l.white, t = f - l.a;
  const box: React.CSSProperties = { position: "absolute", left: pos[0], top: pos[1], width: "max-content", maxWidth: 1040, textAlign: "center", whiteSpace: "pre-wrap", fontFamily: HAND, fontWeight: l.white || l.bold || (l.red && size >= 60) ? 700 : 400, fontSize: size, lineHeight: 1.15 };
  const sa = !l.shatter ? -1 : l.shatter === true ? Math.max(6, l.n - 16) : Math.round(l.shatter * 30);
  const ks = sa >= 0 ? clamp((t - sa) / 16) : 0;
  const body = (txt: string) => (sa >= 0 && ks > 0 ? <Shatter text={txt} k={ks} /> : txt);
  if (!l.red && !l.white) {   // narration: near-hard pop in 4 f, out 6 f (the reference cuts text on and off), no typing
    return <div style={{ ...box, transform: "translate(-50%,-50%)", opacity: vis(f, l.a, l.n, 4, 6), color: WHITE, textShadow: l.bold ? "0 0 26px rgba(255,255,255,0.18)" : undefined }}>{l.t}</div>;
  }
  if (slam) {     // hard pop: 1.35x -> 1.0x over 3 f, then a slow fade out (18 f); shatter lines stay solid until the letters fall
    const k = clamp(t / 3), sc = 1 + 0.35 * (1 - k), inl = f < l.a || f >= l.a + l.n ? 0 : 1;
    const o = sa >= 0 ? inl : inl * clamp((l.a + l.n - f) / 18), txt = l.white ? l.t : l.t.toLowerCase();
    return <div style={{ ...box, transform: `translate(-50%,-50%) scale(${sc})`, opacity: o, color: l.white ? WHITE : RED, textShadow: l.white ? "0 0 30px rgba(255,255,255,0.22)" : undefined }}>{body(txt)}</div>;
  }
  const txt = l.t.toLowerCase(), n = Math.max(0, Math.min(txt.length, Math.ceil((t / 30) * (l.cps ?? 15))));   // red whisper: typed ~2 f/char
  const o = f < l.a || f >= l.a + l.n ? 0 : clamp((l.a + l.n - f) / 8);
  return <div style={{ ...box, transform: "translate(-50%,-50%)", opacity: o, color: RED }}>{txt.slice(0, n)}<span style={{ opacity: 0 }}>{txt.slice(n)}</span></div>;
};

const wavy = (w: number, amp: number, waves: number, frac: number) => {
  let d = `M 0 ${amp + 2}`;
  const n = Math.max(1, Math.round(60 * frac));
  for (let i = 1; i <= n; i++) { const x = (w * i) / 60; d += ` L ${x.toFixed(1)} ${(amp + 2 + Math.sin((i / 60) * waves * Math.PI * 2 + 0.6) * amp + Math.sin(i * 1.7) * 0.8).toFixed(1)}`; }
  return d;
};

const Card: React.FC<{ c: Card2; f: number }> = ({ c, f }) => {
  const t = f - c.a, len = c.big.length;
  const fs = c.fs ?? Math.min(150, 880 / (0.52 * Math.max(5, len))), ls = Math.min(14, Math.max(0, (880 - 0.52 * len * fs) / len));
  const lettersEnd = 26;   // the reference fades the whole word in over ~0.7 s, then draws the underline
  const ul = clamp((t - lettersEnd + 1) / 18);
  const tag0 = c.tagAt !== undefined ? c.tagAt * 30 : lettersEnd + 18 + 14, cmd0 = c.cmdAt !== undefined ? c.cmdAt * 30 : tag0 + 45;
  const fout = Math.min(60, c.n / 3), o = c.outAt !== undefined ? clamp(1 - (t - c.outAt * 30) / Math.max(1, (c.outLen ?? 1) * 30)) : clamp((c.a + c.n - f) / fout);
  return <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, ${BG} 52%, #050505 100%)` }}>
    <svg width={1280} height={720} style={{ position: "absolute", opacity: o }}>
      {Array.from({ length: 70 }, (_, i) => <circle key={i} cx={rnd(i * 3) * 1280} cy={70 + rnd(i * 5 + 1) * 580} r={0.7 + rnd(i * 7) * 1.1} fill="#fff" opacity={0.1 + rnd(i * 9) * 0.28} />)}
    </svg>
    <div style={{ position: "absolute", left: 0, right: 0, top: 310 - fs * 0.5, textAlign: "center", opacity: o }}>
      <div style={{ position: "relative", display: "inline-block", fontFamily: HAND, fontWeight: 700, fontSize: fs, letterSpacing: ls, lineHeight: 1, transform: `scaleY(${c.sy ?? 1})`, transformOrigin: "50% 40%", color: WHITE, WebkitTextStroke: "4.5px #EDEBE7", textShadow: "0 0 26px rgba(255,255,255,0.12)" }}>
        {c.big.split("").map((ch, i) => <span key={i} style={{ opacity: clamp((t - 3 - i * 0.8) / 18), whiteSpace: "pre" }}>{ch}</span>)}
        <svg height={26} viewBox="0 0 400 26" preserveAspectRatio="none" style={{ position: "absolute", left: -10, top: fs * 1.0, width: "calc(100% + 20px)", overflow: "visible" }}>
          {ul > 0 && <path d={wavy(400, 4.5, 3.2, ul)} stroke={RED} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
    </div>
    {c.line && <div style={{ position: "absolute", left: 0, right: 0, top: 462 - 4, textAlign: "center", fontFamily: HAND, fontWeight: 700, fontSize: 42, color: WHITE, opacity: o * clamp((t - tag0) / 15) }}>{c.line}</div>}
    {c.cmd && <div style={{ position: "absolute", left: 0, right: 0, top: 545 - 14, textAlign: "center", fontFamily: HAND, fontWeight: 700, fontSize: 50, color: RED, opacity: o * clamp((t - cmd0) / 6) }}>{c.cmd}</div>}
  </AbsoluteFill>;
};

const Thumb: React.FC<{ t: Thumb2 }> = ({ t }) => {
  const words = t.words.toUpperCase().split(/\s+/);
  return <div style={{ position: "absolute", left: t.pos === "tr" ? undefined : 34, right: t.pos === "tr" ? 34 : undefined, top: 18, textAlign: t.pos === "tr" ? "right" : "left" }}>
    {[words.join(" ")].map((w, i) => <div key={i} style={{ fontFamily: HAND, fontWeight: 700, fontSize: words.join(" ").length > 9 ? 120 : 150, lineHeight: 1, color: "#fff", WebkitTextStroke: "10px #000", paintOrder: "stroke fill", textShadow: "0 6px 0 #000" }}>
      {words.map((x, k) => <span key={k} style={{ color: (t.red ?? []).includes(x) ? "#ff3a2a" : "#fff" }}>{x}{k < words.length - 1 ? " " : ""}</span>)}
    </div>)}
  </div>;
};

/** floating embers (screen space, deterministic by frame): n particles rising and swaying, flickering orange */
const Embers: React.FC<{ tl: number; n: number; speed: number }> = ({ tl, n, speed }) => (
  <svg width={1280} height={720} style={{ position: "absolute", left: 0, top: 0 }}>
    {Array.from({ length: Math.min(120, Math.round(n)) }, (_, i) => {
      const sp = (28 + rnd(i * 5 + 1) * 70) * speed, y = 780 - ((rnd(i * 7 + 2) * 860 + tl * sp) % 860), x = rnd(i * 3) * 1280 + Math.sin(tl * (0.8 + rnd(i) * 1.2) + i) * 22;
      const o = (0.35 + rnd(i * 9 + 3) * 0.6) * (0.65 + 0.35 * Math.sin(tl * 7 + i * 2.3)) * clamp(y / 160) * clamp((790 - y) / 60);
      return <circle key={i} cx={x} cy={y} r={1.2 + rnd(i * 11 + 4) * 2.6} fill={["#ff8a3a", "#ffb35a", "#ff5a2a", "#ffd27a"][i % 4]} opacity={Math.max(0, o)} />;
    })}
  </svg>
);

/** radial spark burst: k = frames since the burst, ~26 f long */
const Burst: React.FC<{ k: number; x: number; y: number; n: number }> = ({ k, x, y, n }) => (
  <svg width={1280} height={720} style={{ position: "absolute", left: 0, top: 0 }}>
    {k < 4 && <circle cx={x} cy={y} r={30 + k * 22} fill="#fff6cf" opacity={0.7 * (1 - k / 4)} />}
    {Array.from({ length: Math.min(80, Math.round(n)) }, (_, i) => {
      const a = rnd(i * 3 + 1) * Math.PI * 2, v = 9 + rnd(i * 5 + 2) * 22, d = v * k * (1 - k / 60), len = (10 + rnd(i * 7) * 24) * (1 - k / 30);
      const cx = Math.cos(a), cy = Math.sin(a) + 0.12 * k * 0.1;
      return <path key={i} d={`M ${x + cx * d} ${y + cy * d} L ${x + cx * (d - len)} ${y + cy * (d - len)}`} stroke={i % 3 === 0 ? "#fff" : "#f7dc4a"} strokeWidth={1.6 + rnd(i * 9) * 2.2} strokeLinecap="round" opacity={Math.max(0, 1 - k / 26)} />;
    })}
  </svg>
);

/** rain: diagonal streaks falling (deterministic by frame) */
const Rain: React.FC<{ f: number; amt: number }> = ({ f, amt }) => (
  <svg width={1280} height={720} style={{ position: "absolute", left: 0, top: 0 }}>
    {Array.from({ length: 90 }, (_, i) => {
      const sp = 34 + rnd(i * 5 + 1) * 30, y = ((rnd(i * 7 + 2) * 900 + f * sp) % 900) - 90, len = 22 + rnd(i * 11 + 4) * 34, x = rnd(i * 3) * 1500 - y * 0.22;
      return <path key={i} d={`M ${x} ${y} l ${-0.22 * len} ${len}`} stroke="#cfe0ff" strokeWidth={1 + rnd(i * 9) * 1.2} strokeLinecap="round" opacity={(0.1 + rnd(i * 13) * 0.22) * amt} />;
    })}
  </svg>
);

export const Film2D: React.FC = () => {
  useFontsReady();
  const f = useCurrentFrame(), { shots, film } = P();
  const s = shots.find((x) => f >= x.a && f < x.a + x.n) ?? shots[shots.length - 1];
  if (!s) return <AbsoluteFill style={{ background: BG }} />;
  const dip = s.arg?.dip ?? 0;
  const fin = dip ? (f === s.a ? 1 : 1 - clamp((f - s.a) / dip)) : s.fade ? 1 - clamp((f - s.a) / s.fade) : 0;
  const fout = s.fadeOut ? clamp((f - (s.a + s.n - s.fadeOut)) / s.fadeOut) : 0;
  // white flash frames decaying over ~10 f; golden bloom 20 f up / 28 f down
  const fAmp = s.arg?.flashAmp ?? 0.62, fLen = s.arg?.flashLen ?? 10;
  const flash = Math.max(0, ...(s.flash ?? []).map((at) => { const k = f - s.a - at * 30; return k >= 0 && k < fLen ? fAmp * (1 - k / fLen) ** 1.6 : 0; }));
  const bk = s.arg?.bloom !== undefined ? f - s.a - s.arg.bloom * 30 : -1;
  const bloom = bk >= 0 && bk < 48 ? 0.72 * (bk < 20 ? bk / 20 : 1 - (bk - 20) / 28) : 0;
  const day = (film.day ?? []).find((d) => f >= d.a && f < d.a + d.n);
  const hud = (film.hud ?? []).find((d) => f >= d.a && f < d.a + d.n);
  const dark = 0.6 + (s.dark ?? 0) * 0.3;
  const gAmt = s.arg?.gradeAmt ?? 1, tlS = (f - s.a) / 30;
  const gFilter = s.grade === "sunset" ? `sepia(${0.3 * gAmt}) saturate(${1 + 0.25 * gAmt}) hue-rotate(${-8 * gAmt}deg)` : s.grade === "rain" ? `brightness(${1 - 0.18 * gAmt}) saturate(${1 - 0.25 * gAmt}) hue-rotate(${8 * gAmt}deg)` : undefined;
  const burstK = s.arg?.burst !== undefined ? f - s.a - Math.round(s.arg.burst * 30) : -1;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <svg width={1280} height={720} viewBox="0 0 1280 720" style={{ position: "absolute", filter: gFilter }}>
        <Defs />
        <Shot s={s} f={f} />
      </svg>
      {/* static vignette: flat centre, falls to ~40 % at the corners */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,${dark}) 100%)` }} />
      {s.grade === "sunset" && <AbsoluteFill style={{ opacity: gAmt, background: "radial-gradient(ellipse at 50% 88%, rgba(255,190,90,0.34) 0%, rgba(255,120,50,0.0) 55%), linear-gradient(to bottom, rgba(70,30,60,0.22) 0%, rgba(255,110,50,0.20) 62%, rgba(255,150,70,0.30) 100%)" }} />}
      {s.grade === "rain" && <><AbsoluteFill style={{ background: `rgba(40,70,120,${0.16 * gAmt})` }} /><Rain f={f} amt={gAmt} /></>}
      {s.arg?.warm ? <AbsoluteFill style={{ background: `radial-gradient(ellipse at 18% 4%, rgba(205,115,40,${0.85 * s.arg.warm}) 0%, rgba(150,85,30,${0.34 * s.arg.warm}) 45%, rgba(0,0,0,0) 80%)` }} /> : null}
      {s.arg?.embers ? <Embers tl={tlS} n={s.arg.embers} speed={s.arg.emberSpeed ?? 1} /> : null}
      {burstK >= 0 && burstK < 26 && <Burst k={burstK} x={s.arg?.burstX ?? 640} y={s.arg?.burstY ?? 300} n={s.arg?.burstN ?? 28} />}
      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
      {bloom > 0 && <AbsoluteFill style={{ background: "#E8B180", opacity: bloom }} />}
      {day && <div style={{ position: "absolute", left: 100, top: 80, fontFamily: HAND, fontWeight: 700, fontSize: 27, letterSpacing: 2.7, color: "#b8b6b0", opacity: vis(f, day.a, day.n, 4, 4) }}>{dayLabel(day.t, (f - day.a) / 30).toUpperCase()}</div>}
      {hud && (() => {
        const v = Math.round(hud.from + (hud.to - hud.from) * ease(clamp((f - hud.a) / Math.max(1, hud.n - 20))));
        return <div style={{ position: "absolute", right: 100, top: 80, textAlign: "right", opacity: vis(f, hud.a, hud.n, 6, 6), fontFamily: HAND, fontWeight: 700 }}>
          <div style={{ fontSize: 18, letterSpacing: 2, color: "#9a978f" }}>{hud.label}</div>
          <div style={{ fontSize: 40, color: WHITE }}>{hud.unit?.trim() === "$" ? "$" + v.toLocaleString("en-US") : `${v}${hud.unit ?? ""}`}</div>
        </div>;
      })()}
      {(film.lines ?? []).filter((l) => f >= l.a && f < l.a + l.n).map((l, i) => <Line key={i} l={l} f={f} pos={placeOf(l, shots)} />)}
      {(film.cards ?? []).filter((c) => f >= c.a && f < c.a + c.n).map((c, i) => <Card key={i} c={c} f={f} />)}
      {!film.thumb && <><div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 64, background: "#000" }} /><div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 64, background: "#000" }} /></>}
      {(fin > 0 || fout > 0) && <AbsoluteFill style={{ background: "#000", opacity: Math.max(fin, fout) }} />}
      {film.thumb && <Thumb t={film.thumb} />}
    </AbsoluteFill>
  );
};
