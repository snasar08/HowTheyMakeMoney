// Afterhour look: text pictures in the world (date signs, money screens, flip calendars, headlines, tombstones).
import * as THREE from "three";
import { canvasTex } from "./common";

export type CardSpec = { text: string; kind?: "sign" | "screen" | "paper" | "flip" | "tomb" | "white"; sub?: string; bg?: string; fg?: string };
const CACHE = new Map<string, THREE.Texture>();

export const drawCard = (C: CardSpec, W: number, H: number) => {
  const key = JSON.stringify([C, W, H]);
  const hit = CACHE.get(key); if (hit) return hit;
  const t = canvasTex(W, H, (g) => {
    const kind = C.kind ?? "sign";
    const rr = (x0: number, y0: number, x1: number, y1: number, r: number) => { g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x1, y0, x1, y1, r); g.arcTo(x1, y1, x0, y1, r); g.arcTo(x0, y1, x0, y0, r); g.arcTo(x0, y0, x1, y0, r); g.closePath(); };
    const fit = (s: string, maxW: number, size: number, font = '900 SIZEpx "Arial Black", Arial, sans-serif') => {
      g.font = font.replace("SIZE", String(size)); const w = g.measureText(s).width;
      if (w > maxW) { size = (size * maxW) / w; g.font = font.replace("SIZE", String(size)); } return size; };
    const lines = C.text.split("\n");
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    const ink = (lw: number) => { g.lineWidth = lw; g.strokeStyle = "#141018"; g.stroke(); };
    if (kind === "sign") {
      rr(14, 14, W - 14, H - 14, 36); g.fillStyle = C.bg ?? "#111316"; g.fill(); ink(18);
      const sz = (H - 140) / lines.length;
      lines.forEach((ln, i) => { fit(ln, W - 120, sz * 0.82); g.fillStyle = C.fg ?? "#b8f12a"; g.shadowColor = C.fg ?? "#b8f12a"; g.shadowBlur = 18; g.fillText(ln, W / 2, 70 + sz * (i + 0.5)); g.shadowBlur = 0; });
    } else if (kind === "screen") {
      rr(14, 14, W - 14, H - 14, 50); g.fillStyle = "#d9d6cf"; g.fill(); ink(18);
      rr(70, 70, W - 70, H - 70, 24); g.fillStyle = C.bg ?? "#0c1a12"; g.fill(); ink(10);
      if (C.sub) { fit(C.sub, W - 240, 64, '800 SIZEpx Arial, sans-serif'); g.fillStyle = "#cfe8d8"; g.fillText(C.sub, W / 2, 150); }
      const sz = (H - (C.sub ? 300 : 220)) / lines.length;
      lines.forEach((ln, i) => { fit(ln, W - 220, sz * 0.8); g.fillStyle = C.fg ?? "#3ee07a"; g.fillText(ln, W / 2, (C.sub ? 230 : 110) + sz * (i + 0.5)); });
    } else if (kind === "flip") {
      rr(14, 14, W - 14, H - 14, 30); g.fillStyle = "#ffffff"; g.fill(); ink(16);
      g.save(); rr(14, 14, W - 14, 200, 30); g.clip(); g.fillStyle = C.bg ?? "#e0343a"; g.fillRect(0, 0, W, 200); g.restore();
      if (C.sub) { fit(C.sub, W - 160, 110); g.fillStyle = "#ffffff"; g.fillText(C.sub, W / 2, 110); }
      fit(lines[0], W - 140, 360); g.fillStyle = C.fg ?? "#151515"; g.fillText(lines[0], W / 2, 200 + (H - 200) / 2);
    } else if (kind === "paper") {
      g.fillStyle = "#f4f2ec"; g.fillRect(10, 10, W - 20, H - 20); g.strokeStyle = "#141018"; g.lineWidth = 12; g.strokeRect(10, 10, W - 20, H - 20);
      const mast = C.sub ?? "The Daily News"; fit(mast, W - 140, 96, '700 SIZEpx Georgia, "Times New Roman", serif'); g.fillStyle = "#1a1a1a"; g.fillText(mast, W / 2, 110);
      g.fillRect(60, 180, W - 120, 8);
      lines.forEach((ln, i) => { fit(ln, W - 140, 110, '800 SIZEpx Georgia, serif'); g.fillText(ln, W / 2, 280 + i * 120); });
      g.fillStyle = "#a9c6cc"; g.fillRect(90, 560, 420, 330);
      g.fillStyle = "#9a9a9a"; for (let i = 0; i < 14; i++) g.fillRect(540, 570 + i * 24, W - 640, 9); for (let i = 0; i < 12; i++) g.fillRect(90, 930 + i * 28, W - 180, 9);
    } else if (kind === "tomb") {
      g.beginPath(); g.moveTo(140, H - 20); g.lineTo(140, 380); g.arc(W / 2, 380, W / 2 - 140, Math.PI, 0); g.lineTo(W - 140, H - 20); g.closePath();
      g.fillStyle = "#b9b2d6"; g.fill(); ink(18);
      lines.forEach((ln, i) => { fit(ln, W - 360, i ? 90 : 170); g.fillStyle = "#3b3560"; g.fillText(ln, W / 2, 560 + i * 170); });
    } else {
      rr(14, 14, W - 14, H - 14, 30); g.fillStyle = C.bg ?? "#ffffff"; g.fill(); ink(16);
      if (C.sub) { fit(C.sub, W - 160, 80, '800 SIZEpx Arial, sans-serif'); g.fillStyle = "#555"; g.fillText(C.sub, W / 2, 120); }
      const sz = (H - (C.sub ? 260 : 160)) / lines.length;
      lines.forEach((ln, i) => { fit(ln, W - 140, sz * 0.8); g.fillStyle = C.fg ?? "#e0343a"; g.fillText(ln, W / 2, (C.sub ? 190 : 80) + sz * (i + 0.5)); });
    }
  });
  CACHE.set(key, t);
  return t;
};
