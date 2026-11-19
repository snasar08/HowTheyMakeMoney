// Nov 19 films: 16:9 long-form "silent film" look (see docs/LONGFORM_STYLE.md). The 3D shots come from Ah.tsx (same
// characters and sets as the Shorts); this file adds what a film has and a Short does not:
//   - a colour grade per shot (shot.mood) and fades from black (shot.fade)
//   - one on-screen sentence at a time (white = the story, red lowercase = the inner voice)
//   - full black title cards ("DAY 1.", the end card: big word + quiet line + red command)
//   - a day counter top-left and an optional counting HUD top-right ("SHOTS MADE 0 -> 100")
// No voice: the text carries the story. Props: inputProps.ah = { shots: [...], film: FilmSpec }.
import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { AhShort, PROPS, SHOTS_ } from "./Ah";

export type FilmLine = { a: number; n: number; t: string; red?: boolean; at?: "low" | "mid" | "high" };
export type FilmCard = { a: number; n: number; big: string; line?: string; cmd?: string; red?: boolean };
export type FilmDay = { a: number; n: number; t: string };
export type FilmHud = { a: number; n: number; label: string; from: number; to: number; unit?: string };
/** thumbnail mode: 1-3 huge ALL-CAPS words, white with a thick black outline, on the side away from the face; `red` words are red */
export type FilmThumb = { words: string; side?: "left" | "right"; red?: string[] };
export type FilmSpec = { lines?: FilmLine[]; cards?: FilmCard[]; day?: FilmDay[]; hud?: FilmHud[]; thumb?: FilmThumb };

const SPEC = (): FilmSpec => (PROPS().film as FilmSpec) ?? {};

/** mood -> CSS filter on the 3D picture + a multiply tint + an optional warm glow from the top right */
const MOODS: Record<string, { filter: string; tint?: string; glow?: string }> = {
  night: { filter: "brightness(1.08) saturate(0.8)", tint: "#8090d0" },
  cold: { filter: "brightness(0.95) saturate(0.6)", tint: "#9aa8d8" },
  dark: { filter: "brightness(0.6) saturate(0.5)", tint: "#7080b0" },
  red: { filter: "brightness(0.75) saturate(0.8)", tint: "#d07070" },
  warm: { filter: "brightness(1.02) saturate(1.05)", tint: "#ffe2c0" },
  sunrise: { filter: "brightness(1.05) saturate(1.15)", tint: "#ffd8b0", glow: "rgba(255,170,80,0.35)" },
  day: { filter: "none" },
};

const FONTS: Array<[string, string, string]> = [["FilmBlack", "fonts/InterDisplay-Black.otf", "900"], ["FilmText", "fonts/Inter-SemiBold.otf", "600"]];
const useFonts = () => {
  const [h] = useState(() => delayRender("film fonts"));
  useEffect(() => {
    Promise.all(FONTS.map(([fam, url, w]) => new FontFace(fam, `url(${staticFile(url)})`, { weight: w }).load().then((f) => { document.fonts.add(f); })))
      .catch((e) => console.error("font", e)).finally(() => continueRender(h));
  }, [h]);
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** opacity of an item at frame f: 8-frame fade in, 8-frame fade out (cards: 6 / 10) */
const vis = (f: number, a: number, n: number, fin = 8, fout = 8) => (f < a || f >= a + n ? 0 : Math.min(clamp((f - a + 1) / fin), clamp((a + n - f) / fout)));

const Line: React.FC<{ l: FilmLine; f: number }> = ({ l, f }) => {
  const o = vis(f, l.a, l.n), rise = (1 - clamp((f - l.a) / 10)) * 10;
  const top = l.at === "high" ? "12%" : l.at === "mid" ? "46%" : undefined;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, bottom: top ? undefined : "8.5%", display: "flex", justifyContent: "center", opacity: o, transform: `translateY(${rise}px)` }}>
      <div style={{ fontFamily: l.red ? "FilmBlack" : "FilmText", fontSize: l.red ? 44 : 40, letterSpacing: l.red ? 0.5 : 0.2, color: l.red ? "#ff3b36" : "#f6f3ee", maxWidth: "80%", textAlign: "center", lineHeight: 1.2,
        textShadow: l.red ? "0 0 18px rgba(255,40,30,0.85), 0 0 4px rgba(255,60,40,0.9), 0 2px 3px #000" : "0 2px 6px rgba(0,0,0,0.95), 0 0 18px rgba(0,0,0,0.7)" }}>
        {l.red ? l.t.toLowerCase() : l.t}
      </div>
    </div>
  );
};

/** a red hand-drawn underline under the big word */
const Scribble: React.FC<{ w: number; p: number }> = ({ w, p }) => (
  <svg width={w} height={40} viewBox={`0 0 ${w} 40`} style={{ display: "block", margin: "0 auto" }}>
    <path d={`M 8 22 C ${w * 0.25} 10, ${w * 0.5} 30, ${w * 0.75} 16 S ${w - 10} 20, ${w - 6} 14`} stroke="#ff3b36" strokeWidth={9} strokeLinecap="round" fill="none"
      strokeDasharray={w * 1.3} strokeDashoffset={w * 1.3 * (1 - p)} />
  </svg>
);

const Card: React.FC<{ c: FilmCard; f: number }> = ({ c, f }) => {
  const o = vis(f, c.a, c.n, 6, 10), t = f - c.a;
  const big = clamp(t / 8), sub = clamp((t - 30) / 12), cmd = clamp((t - 70) / 10);
  const bw = Math.min(1100, 120 + c.big.length * 92);
  return (
    <AbsoluteFill style={{ background: "#050507", opacity: o, alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <div style={{ fontFamily: "FilmBlack", fontSize: c.big.length > 9 ? 110 : 150, color: c.red ? "#ff3b36" : "#f6f3ee", letterSpacing: 2, opacity: big, transform: `scale(${1.08 - 0.08 * big})`, textShadow: c.red ? "0 0 24px rgba(255,40,30,0.8)" : undefined }}>{c.big}</div>
      <Scribble w={bw} p={clamp((t - 6) / 14)} />
      {c.line && <div style={{ fontFamily: "FilmText", fontSize: 36, color: "#cfcac2", marginTop: 26, opacity: sub, maxWidth: "75%", textAlign: "center" }}>{c.line}</div>}
      {c.cmd && <div style={{ fontFamily: "FilmBlack", fontSize: 46, color: "#ff3b36", marginTop: 22, opacity: cmd, letterSpacing: 1, textShadow: "0 0 18px rgba(255,40,30,0.8)" }}>{c.cmd.toLowerCase()}</div>}
    </AbsoluteFill>
  );
};

const Thumb: React.FC<{ t: FilmThumb }> = ({ t }) => {
  const words = t.words.toUpperCase().split(/\s+/), right = (t.side ?? "right") === "right";
  const fs = words.length >= 3 ? 150 : 190;
  return (
    <div style={{ position: "absolute", top: 0, bottom: 0, [right ? "right" : "left"]: 40, width: "52%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: right ? "flex-end" : "flex-start" }}>
      {words.map((w, i) => (
        <div key={i} style={{ fontFamily: "FilmBlack", fontSize: fs, lineHeight: 0.92, letterSpacing: -2, color: (t.red ?? []).includes(w) ? "#ff3b36" : "#ffffff",
          WebkitTextStroke: "14px #000", paintOrder: "stroke fill", textShadow: "0 8px 0 #000, 0 0 30px rgba(0,0,0,0.9)", transform: `rotate(${i % 2 ? 1.5 : -2}deg)` }}>{w}</div>
      ))}
    </div>
  );
};

export const AhFilm: React.FC = () => {
  useFonts();
  const f = useCurrentFrame(), sp = SPEC();
  const k = Math.max(0, SHOTS_.findIndex((s) => f >= s.a && f < s.a + s.n)), s = SHOTS_[k];
  const m = MOODS[s?.mood ?? "day"] ?? MOODS.day;
  const fadeO = s?.fade ? 1 - clamp((f - s.a) / s.fade) : 0;
  const day = (sp.day ?? []).find((d) => f >= d.a && f < d.a + d.n);
  const hud = (sp.hud ?? []).find((d) => f >= d.a && f < d.a + d.n);
  return (
    <AbsoluteFill style={{ background: "#050507" }}>
      {/* thumbnails (Nov 19: the first test was too dark to read on a phone): brighter, punchier, a light tint only, a warm rim light behind the hero (left) */}
      <AbsoluteFill style={{ filter: sp.thumb ? "brightness(1.45) saturate(1.45) contrast(1.12)" : m.filter }}><AhShort /></AbsoluteFill>
      {m.tint && <AbsoluteFill style={{ background: m.tint, mixBlendMode: "multiply", opacity: sp.thumb ? 0.45 : 1 }} />}
      {sp.thumb && <AbsoluteFill style={{ background: "radial-gradient(circle at 27% 45%, rgba(255,120,70,0.42), rgba(0,0,0,0) 42%)", mixBlendMode: "screen" }} />}
      {m.glow && <AbsoluteFill style={{ background: `radial-gradient(circle at 78% 18%, ${m.glow}, rgba(0,0,0,0) 60%)`, mixBlendMode: "screen" }} />}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${sp.thumb ? 0.3 : 0.55}) 100%)` }} />
      {fadeO > 0 && <AbsoluteFill style={{ background: "#050507", opacity: fadeO }} />}
      {day && <div style={{ position: "absolute", left: 44, top: 32, fontFamily: "FilmBlack", fontSize: 30, letterSpacing: 2, color: "#b9bdc8", opacity: vis(f, day.a, day.n, 6, 6), textShadow: "0 2px 4px #000" }}>{day.t}</div>}
      {hud && (() => {
        const v = Math.round(hud.from + (hud.to - hud.from) * clamp((f - hud.a) / Math.max(1, hud.n - 20)));
        return <div style={{ position: "absolute", right: 44, top: 28, textAlign: "right", opacity: vis(f, hud.a, hud.n, 6, 6), textShadow: "0 2px 4px #000" }}>
          <div style={{ fontFamily: "FilmText", fontSize: 18, letterSpacing: 3, color: "#b9bdc8" }}>{hud.label}</div>
          <div style={{ fontFamily: "FilmBlack", fontSize: 44, color: "#f6f3ee" }}>{v}{hud.unit ?? ""}</div>
        </div>;
      })()}
      {(sp.lines ?? []).filter((l) => f >= l.a && f < l.a + l.n).map((l, i) => <Line key={i} l={l} f={f} />)}
      {(sp.cards ?? []).filter((c) => f >= c.a && f < c.a + c.n).map((c, i) => <Card key={i} c={c} f={f} />)}
      {sp.thumb && <Thumb t={sp.thumb} />}
    </AbsoluteFill>
  );
};
