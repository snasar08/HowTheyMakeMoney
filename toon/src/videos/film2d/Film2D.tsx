// Nov 19 (Sam: "Analyze 3 of them frame by frame and replicate almost exactly ... the look the movement everything"):
// the flat 2D silent film. A cream bean character on a near-black stage, side-on, thin grey hand-drawn outlines,
// light only from lamps / phones / the moon / a sunrise, one typed sentence at a time, a red glowing inner-voice
// monster, a day counter, chunky hand-lettered title cards with a red scribble underline.
// Our own character, places, music and lines (see C:\Users\rsn\tools\dayone-breakdown for the study).
//
// Props: inputProps.d2 = { shots: Shot2[], film: { lines, cards, day, hud, thumb } } (built by pipeline/film2d.py).
import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import "@fontsource/comic-neue/700.css";
import "@fontsource/comic-neue/400.css";
import { Expr, Guy, handOf, Look, pose } from "./rig";
import { Blanket, FLOOR, GLOW_COLORS, SetView, stairAt, ThingView } from "./sets";

type V3 = [number, number, number];
export type Char2 = { look?: Look; x: number; y?: number; dir?: number; pose?: string; expr?: Expr; exprAt?: [number, Expr][]; poseAt?: [number, string][]; scale?: number; to?: [number, number]; stairs?: [number, number]; bed?: boolean; dim?: number; ease?: boolean };
export type Thing2 = { name: string; x?: number; y?: number; s?: number; text?: string; v?: number | [number, number]; hand?: number; at?: number; dx?: number; dy?: number };
export type Shot2 = { a: number; n: number; set: string; arg?: Record<string, number>; cam?: { from: V3; to?: V3 }; chars?: Char2[]; things?: Thing2[]; fade?: number; fadeOut?: number; sat?: [number, number]; shake?: [number, number][]; flash?: number[]; scroll?: [number, number]; spot?: number; dark?: number };
export type Line2 = { a: number; n: number; t: string; red?: boolean; at?: "top" | "mid" | "low" | [number, number]; size?: number; cps?: number };
export type Card2 = { a: number; n: number; big: string; line?: string; cmd?: string };
export type Day2 = { a: number; n: number; t: string };
export type Hud2 = { a: number; n: number; label: string; from: number; to: number; unit?: string };
export type Thumb2 = { words: string; red?: string[]; pos?: "tl" | "tr" };
type Props = { shots: Shot2[]; film: { lines?: Line2[]; cards?: Card2[]; day?: Day2[]; hud?: Hud2[]; thumb?: Thumb2 } };

const P = (): Props => ((getInputProps() as { d2?: Props }).d2 ?? { shots: [], film: {} });
export const D2_FRAMES = Math.max(1, ...P().shots.map((s) => s.a + s.n));

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const vis = (f: number, a: number, n: number, fin = 8, fout = 8) => (f < a || f >= a + n ? 0 : Math.min(clamp((f - a + 1) / fin), clamp((a + n - f) / fout)));

const useFontsReady = () => {
  const [h] = useState(() => delayRender("film2d fonts"));
  useEffect(() => { Promise.all([document.fonts.load("700 40px 'Comic Neue'"), document.fonts.load("400 40px 'Comic Neue'")]).catch(() => 0).finally(() => continueRender(h)); }, [h]);
};
const HAND = "'Comic Neue', 'Comic Sans MS', cursive";

const Defs: React.FC = () => (
  <defs>
    {GLOW_COLORS.map((c) => <radialGradient key={c} id={`g-${c}`}><stop offset="0" stopColor={"#" + c} stopOpacity={0.9} /><stop offset="0.35" stopColor={"#" + c} stopOpacity={0.35} /><stop offset="1" stopColor={"#" + c} stopOpacity={0} /></radialGradient>)}
    <linearGradient id="spotGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity={0.05} /><stop offset="1" stopColor="#fff" stopOpacity={0.55} /></linearGradient>
    <linearGradient id="warmCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb35a" stopOpacity={0.5} /><stop offset="1" stopColor="#ffb35a" stopOpacity={0.05} /></linearGradient>
    <linearGradient id="dawnSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d0a10" /><stop offset="0.45" stopColor="#3a1c10" /><stop offset="0.8" stopColor="#c0612a" /><stop offset="1" stopColor="#f0a050" /></linearGradient>
    <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    <filter id="greenGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
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

const Shot: React.FC<{ s: Shot2; f: number }> = ({ s, f }) => {
  const tl = (f - s.a) / 30, u = clamp((f - s.a) / Math.max(1, s.n - 1));
  const c0 = s.cam?.from ?? [640, 420, 1.3], c1 = s.cam?.to ?? c0, eu = ease(u);
  let cx = lerp(c0[0], c1[0], eu), cy = lerp(c0[1], c1[1], eu);
  const z = lerp(c0[2], c1[2], eu);
  for (const [at, amp] of s.shake ?? []) { const k = tl - at; if (k >= 0 && k < 0.5) { const d = amp * (1 - k / 0.5); cx += Math.sin(k * 90) * d; cy += Math.cos(k * 77) * d; } }
  const scroll = s.scroll ? lerp(s.scroll[0], s.scroll[1], u) : 0;
  const sat = s.sat ? lerp(s.sat[0], s.sat[1], u) : 1;
  const things = (s.things ?? []).filter((th) => th.at === undefined || tl >= th.at);
  const chars = (s.chars ?? []).map((c, i) => {
    let name = c.pose ?? "stand"; for (const [at, p] of c.poseAt ?? []) if (tl >= at) name = p;
    let e: Expr = c.expr ?? "neutral"; for (const [at, x] of c.exprAt ?? []) if (tl >= at) e = x;
    const p = pose(name, tl + i * 0.37);
    let x = c.x, y = c.y ?? FLOOR;
    if (c.to) { const k = c.ease ? ease(u) : u; x = lerp(c.x, c.to[0], k); y = lerp(c.y ?? FLOOR, c.to[1], k); }
    if (c.stairs) { const q = stairAt(lerp(c.stairs[0], c.stairs[1], u)); x = q.x; y = q.y; }
    return { c, p, e, x, y, dir: c.dir ?? 1, sc: c.scale ?? 1, name };
  });
  return (
    <g transform={`translate(640 360) scale(${z}) translate(${-cx} ${-cy})`} style={{ filter: sat < 0.999 ? `saturate(${sat})` : undefined }}>
      <g filter="url(#wob)">
        <SetView name={s.set} t={tl} scroll={scroll} arg={s.arg} />
        {chars.map(({ c, p, e, x, y, dir, sc, name }, i) => <g key={i}>
          <Guy p={p} e={e} dir={dir} t={tl + i} look={c.look} scale={sc} x={x} y={c.bed ? y - 96 : y} dim={c.dim} />
          {c.bed && <Blanket x={420} heave={Math.sin(tl * 2) * 2} />}
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

const typed = (t: string, f: number, a: number, cps: number) => t.slice(0, Math.max(0, Math.ceil(((f - a) / 30) * cps)));

const Line: React.FC<{ l: Line2; f: number }> = ({ l, f }) => {
  const o = vis(f, l.a, l.n, 3, 10);
  const pos = Array.isArray(l.at) ? l.at : l.at === "mid" ? [640, 360] : l.at === "low" ? [640, 600] : [640, 160];
  const size = l.size ?? (l.red ? 34 : 30);
  return <div style={{ position: "absolute", left: pos[0] - 560, width: 1120, top: pos[1] - size, textAlign: "center", opacity: o, fontFamily: HAND, fontWeight: 700, fontSize: size,
    color: l.red ? "#ff3a2a" : "#ecebe6", textShadow: l.red ? "0 0 14px rgba(255,40,20,0.75), 0 0 3px rgba(255,60,40,0.9)" : "0 0 10px rgba(0,0,0,0.9)", letterSpacing: 0.3, whiteSpace: "pre-wrap" }}>
    {typed(l.red ? l.t.toLowerCase() : l.t, f, l.a, l.cps ?? 20)}
  </div>;
};

const Card: React.FC<{ c: Card2; f: number }> = ({ c, f }) => {
  const t = f - c.a, o = vis(f, c.a, c.n, 1, 14);
  const big = typed(c.big, f, c.a, 10), w = Math.min(1000, 70 * c.big.length + 40);
  const p = clamp((t - c.big.length * 3 - 4) / 12);
  return <AbsoluteFill style={{ background: "#070707", opacity: o, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
    <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: c.big.length > 9 ? 110 : 130, color: "#f2f0ea", letterSpacing: 3, minHeight: 150 }}>{big}</div>
    <svg width={w} height={30} viewBox={`0 0 ${w} 30`}><path d={`M 6 18 C ${w * 0.3} 8, ${w * 0.6} 26, ${w - 6} 12`} stroke="#ff3a2a" strokeWidth={7} strokeLinecap="round" fill="none" strokeDasharray={w * 1.2} strokeDashoffset={w * 1.2 * (1 - p)} /></svg>
    {c.line && <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 30, color: "#d9d6cf", marginTop: 26 }}>{typed(c.line, f, c.a + 40, 20)}</div>}
    {c.cmd && <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 36, color: "#ff3a2a", marginTop: 10, textShadow: "0 0 14px rgba(255,40,20,0.75)" }}>{typed(c.cmd, f, c.a + 40 + Math.ceil(((c.line?.length ?? 0) / 20) * 30) + 25, 16)}</div>}
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

export const Film2D: React.FC = () => {
  useFontsReady();
  const f = useCurrentFrame(), { shots, film } = P();
  const s = shots.find((x) => f >= x.a && f < x.a + x.n) ?? shots[shots.length - 1];
  if (!s) return <AbsoluteFill style={{ background: "#070707" }} />;
  const fin = s.fade ? 1 - clamp((f - s.a) / s.fade) : 0, fout = s.fadeOut ? clamp((f - (s.a + s.n - s.fadeOut)) / s.fadeOut) : 0;
  const flash = Math.max(0, ...(s.flash ?? []).map((at) => { const k = (f - s.a) / 30 - at; return k >= 0 && k < 0.6 ? 1 - k / 0.6 : 0; }));
  const day = (film.day ?? []).find((d) => f >= d.a && f < d.a + d.n);
  const hud = (film.hud ?? []).find((d) => f >= d.a && f < d.a + d.n);
  return (
    <AbsoluteFill style={{ background: "#070707" }}>
      <svg width={1280} height={720} viewBox="0 0 1280 720" style={{ position: "absolute" }}>
        <Defs />
        <Shot s={s} f={f} />
      </svg>
      {/* soft stage light: a gentle vignette everywhere, darker on "dark" shots */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 45%, rgba(0,0,0,${0.55 + (s.dark ?? 0) * 0.4}) 100%)` }} />
      {!film.thumb && <><div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 64, background: "#000" }} /><div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 64, background: "#000" }} /></>}
      {flash > 0 && <AbsoluteFill style={{ background: "#ffe9c8", opacity: flash }} />}
      {(fin > 0 || fout > 0) && <AbsoluteFill style={{ background: "#070707", opacity: Math.max(fin, fout) }} />}
      {day && <div style={{ position: "absolute", left: 50, top: 82, fontFamily: HAND, fontWeight: 700, fontSize: 22, letterSpacing: 1, color: "#c9c6bf", opacity: vis(f, day.a, day.n, 4, 4) }}>{day.t}</div>}
      {hud && (() => {
        const v = Math.round(hud.from + (hud.to - hud.from) * ease(clamp((f - hud.a) / Math.max(1, hud.n - 20))));
        return <div style={{ position: "absolute", right: 50, top: 76, textAlign: "right", opacity: vis(f, hud.a, hud.n, 6, 6), fontFamily: HAND, fontWeight: 700 }}>
          <div style={{ fontSize: 18, letterSpacing: 2, color: "#9a978f" }}>{hud.label}</div>
          <div style={{ fontSize: 40, color: "#ecebe6" }}>{hud.unit?.trim() === "$" ? "$" + v.toLocaleString("en-US") : `${v}${hud.unit ?? ""}`}</div>
        </div>;
      })()}
      {(film.lines ?? []).filter((l) => f >= l.a && f < l.a + l.n).map((l, i) => <Line key={i} l={l} f={f} />)}
      {(film.cards ?? []).filter((c) => f >= c.a && f < c.a + c.n).map((c, i) => <Card key={i} c={c} f={f} />)}
      {film.thumb && <Thumb t={film.thumb} />}
    </AbsoluteFill>
  );
};
