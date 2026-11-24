// POV format overlay (Nov 24): the "POV: you ..." pill and the stacked math cards, drawn over the 3D picture.
// Layout (1080x1920): pill y 70..132 (above the top sentence subtitle at y 150..254); cards start at y 285 and stack down;
// pipeline/toon.py (pov_hud) uses the same numbers to keep 3D props / faces out from under the stack.
import React from "react";
import { useCurrentFrame } from "remotion";

export type PovCard = { op: string; value: string; label: string; result?: boolean; at: number };
export type PovHud = { pill?: { text: string; a: number; n: number }; stacks?: { a: number; b: number; cards: PovCard[] }[] };
export const POV_TOP = 285, POV_GAP = 12;
/** card height by how many cards the stack will hold in total (a stack never re-lays-out while it fills) */
export const povCardH = (n: number) => (n <= 2 ? 150 : n === 3 ? 128 : 96);

const FONT = '"Arial Black", Arial, sans-serif';
const cl = (x: number) => Math.max(0, Math.min(1, x));
const popK = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2);

/** "$1,200.50" -> animated string that counts up to exactly the script's string (the last frames show the script string itself) */
const counted = (value: string, k: number): string => {
  const m = value.match(/^([^0-9]*)([0-9][0-9,]*)(\.[0-9]+)?(.*)$/);
  if (!m || k >= 1) return value;
  const whole = Number(m[2].replace(/,/g, "")), frac = m[3] ? Number(m[3]) : 0, dec = m[3] ? m[3].length - 1 : 0;
  const v = (whole + frac) * (1 - (1 - k) ** 3);
  const s = dec ? v.toFixed(dec) : String(Math.round(v));
  const [ip, fp] = s.split(".");
  const ig = m[2].includes(",") || whole >= 10000 ? ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ip;
  return `${m[1]}${ig}${fp ? "." + fp : ""}${m[4]}`;
};

export const PovOverlay: React.FC<{ hud: PovHud }> = ({ hud }) => {
  const f = useCurrentFrame();
  const stack = (hud.stacks ?? []).find((s) => f >= s.a && f < s.b);
  const pill = hud.pill && f < hud.pill.a + hud.pill.n ? hud.pill : undefined;
  const N = stack ? stack.cards.length : 0, H = povCardH(N);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: FONT }}>
      {pill && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center", opacity: cl((pill.a + pill.n - f) / 6) }}>
          <div style={{ background: "#fff", border: "5px solid #141018", borderRadius: 40, padding: "8px 34px", fontSize: pill.text.length > 30 ? 30 : 36, fontWeight: 900, color: "#141018", maxWidth: 940, whiteSpace: "nowrap", letterSpacing: 0.5 }}>{pill.text}</div>
        </div>
      )}
      {stack && stack.cards.filter((c) => f >= c.at).map((c, i) => {
        const k = popK((f - c.at) / 8), cnt = c.result ? cl((f - c.at - 3) / 26) : 1, txt = c.result ? counted(c.value, cnt) : c.value;
        const big = H * 0.56 * Math.min(1, 7 / Math.max(7, c.value.length)), top = POV_TOP + i * (H + POV_GAP);
        return (
          <div key={i} style={{ position: "absolute", left: 210, width: 660, top, height: H, transform: `scale(${Math.max(0.001, k)})`, transformOrigin: "50% 0%", opacity: cl((f - c.at) / 3),
            background: c.result ? "#ffd23a" : "#ffffff", border: "6px solid #141018", borderRadius: 34, boxShadow: "0 7px 0 rgba(20,16,24,0.85)", display: "flex", alignItems: "center", boxSizing: "border-box" }}>
            <div style={{ width: 96, textAlign: "center", fontSize: H * 0.5, fontWeight: 900, color: c.result ? "#8a5a00" : "#9aa1b5", lineHeight: 1 }}>{c.op}</div>
            <div style={{ flex: 1, paddingRight: 96, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: big, fontWeight: 900, color: "#141018", lineHeight: 1.0, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{txt}</div>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: Math.max(22, H * 0.19), fontWeight: 700, color: c.result ? "#6b4b00" : "#7b8296", marginTop: 4, whiteSpace: "nowrap" }}>{c.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
