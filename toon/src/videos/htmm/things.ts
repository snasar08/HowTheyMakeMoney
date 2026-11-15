// HTMM things (Nov 15, Sam: "if it's mentioned in the video, it should make the video and the scenery" - if the Nike plan
// talks about spring shoes or a sneaker bus, we SEE them). Flat ink drawings in the reference's sign style, one per
// object a line can mention. `c` = the scene's brand colours (bg, fg) so a Nike shoe or an Nvidia chip wears them.
import type { Pen } from "./toon";

type P2 = [number, number];
export type Thing = { cw: number; ch: number; move?: "drive" | "fly"; draw: (p: Pen, c: { bg: string; fg: string }) => void };

const rr = (x0: number, y0: number, x1: number, y1: number, r: number): P2[] => {
  const out: P2[] = [];
  const arc = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, Math.PI / 2); arc(x0 + r, y0 + r, Math.PI); arc(x1 - r, y0 + r, Math.PI * 1.5);
  return out;
};
const txt = (p: Pen, s: string, x: number, y: number, size: number, col: string) => {
  const g = p.g; g.font = `900 ${size}px "Arial Black", Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = col; g.fillText(s, x, y);
};
const pick = (c: { bg: string }, dflt: string) => (c.bg && c.bg !== "#241726" && c.bg.toLowerCase() !== "#111111" && c.bg.toLowerCase() !== "#1a1a1a" ? c.bg : dflt);
const wheel = (p: Pen, x: number, y: number, r: number) => { p.ell(x, y, r, r, "#2b2a33", 8); p.ell(x, y, r * 0.45, r * 0.45, "#d8dde3", 4); };

// a sneaker facing right: sole, upper, laces, heel tab; x0,y0 = top-left of a 360x170 box
const sneaker = (p: Pen, x0: number, y0: number, s: number, up: string) => {
  const X = (x: number) => x0 + x * s, Y = (y: number) => y0 + y * s;
  p.poly([[X(10), Y(120)], [X(350), Y(120)], [X(352), Y(150)], [X(330), Y(166)], [X(20), Y(166)], [X(6), Y(150)]], "#f4f4f4", 8);   // sole
  p.poly([[X(14), Y(120)], [X(20), Y(40)], [X(70), Y(20)], [X(120), Y(30)], [X(170), Y(64)], [X(250), Y(78)], [X(330), Y(92)], [X(348), Y(120)]], up, 8);
  p.poly([[X(20), Y(40)], [X(70), Y(20)], [X(80), Y(44)], [X(26), Y(64)]], "#f4f4f4", 6);                                            // collar
  for (let i = 0; i < 4; i++) p.stroke([[X(120 + i * 26), Y(50 + i * 6)], [X(150 + i * 26), Y(70 + i * 6)]], 7 * s, "#f4f4f4");      // laces
  p.poly([[X(150), Y(108)], [X(250), Y(84)], [X(300), Y(96)], [X(170), Y(116)]], "#f4f4f4", 0);                                     // side stripe
};

export const THINGS: Record<string, Thing> = {
  shoe: { cw: 400, ch: 220, draw: (p, c) => sneaker(p, 20, 20, 1, pick(c, "#e2453c")) },
  springshoe: { cw: 400, ch: 360, draw: (p, c) => {
    sneaker(p, 20, 10, 1, pick(c, "#e2453c"));
    for (const x of [80, 280]) { const pts: P2[] = []; for (let i = 0; i <= 10; i++) pts.push([x + (i % 2 ? 26 : -26), 180 + i * 16]); p.stroke(pts, 12, "#9aa3b5"); p.stroke(pts, 4, "#e8ecf2"); }
    p.poly(rr(150, 120, 230, 160, 8), "#2b2a33", 6); p.ell(212, 140, 7, 7, "#4dff9a", 0);                                              // motor + LED
    for (const [x, y] of [[40, 330], [360, 330], [200, 345]] as P2[]) p.stroke([[x - 20, y], [x + 20, y]], 8, "#f2c94c");               // launch lines
  } },
  sneakerbus: { cw: 700, ch: 380, move: "drive", draw: (p, c) => {
    sneaker(p, 10, 20, 1.9, pick(c, "#e2453c"));
    for (let i = 0; i < 4; i++) p.poly(rr(220 + i * 95, 160, 290 + i * 95, 215, 10), "#a8d8ff", 6);                                    // windows
    wheel(p, 140, 330, 40); wheel(p, 540, 330, 40);
  } },
  bus: { cw: 700, ch: 360, move: "drive", draw: (p, c) => {
    p.poly(rr(20, 40, 680, 290, 30), pick(c, "#f2c94c"), 9);
    for (let i = 0; i < 6; i++) p.poly(rr(50 + i * 100, 70, 130 + i * 100, 150, 10), "#a8d8ff", 6);
    p.poly(rr(20, 200, 680, 222, 6), "#2b2a33", 0); wheel(p, 150, 300, 44); wheel(p, 550, 300, 44);
  } },
  glasses: { cw: 460, ch: 200, draw: (p) => {
    p.stroke([[20, 70], [70, 60]], 14); p.stroke([[440, 70], [390, 60]], 14);
    for (const x of [130, 330]) { p.poly(rr(x - 95, 40, x + 95, 160, 40), "#2b2a33", 10); p.poly(rr(x - 75, 58, x + 75, 142, 30), "#5fb8ff", 0); }
    p.stroke([[225, 80], [235, 80]], 16); p.ell(360, 82, 14, 14, "#ffffff", 0); p.ell(160, 82, 8, 8, "#ffffff", 0);
    p.ell(95, 110, 10, 10, "#4dff9a", 0);                                                                                                   // the tiny camera/AI light
  } },
  robot: { cw: 360, ch: 460, draw: (p, c) => {
    const b = pick(c, "#9aa3b5");
    p.stroke([[180, 70], [180, 20]], 8); p.ell(180, 18, 14, 14, "#e2453c", 6);
    p.poly(rr(80, 70, 280, 200, 26), b, 9); p.ell(140, 132, 22, 22, "#5fd8ff", 6); p.ell(220, 132, 22, 22, "#5fd8ff", 6);
    p.stroke([[140, 175], [220, 175]], 8);
    p.poly(rr(60, 215, 300, 380, 24), b, 9); p.poly(rr(130, 250, 230, 320, 10), "#2b2a33", 6); p.ell(160, 285, 9, 9, "#4dff9a", 0); p.ell(200, 285, 9, 9, "#f2c94c", 0);
    p.stroke([[60, 240], [20, 330]], 22); p.stroke([[300, 240], [340, 330]], 22);
    p.poly(rr(100, 380, 160, 450, 10), "#2b2a33", 7); p.poly(rr(200, 380, 260, 450, 10), "#2b2a33", 7);
  } },
  chip: { cw: 400, ch: 400, draw: (p, c) => {
    for (let i = 0; i < 6; i++) for (const s of [0, 1]) {
      const k = 95 + i * 42; p.poly(rr(k - 8, s ? 330 : 30, k + 8, s ? 370 : 70, 3), "#d8b25a", 4); p.poly(rr(s ? 330 : 30, k - 8, s ? 370 : 70, k + 8, 3), "#d8b25a", 4);
    }
    p.poly(rr(60, 60, 340, 340, 26), "#2b2a33", 10); p.poly(rr(100, 100, 300, 300, 16), pick(c, "#76b900"), 6);
    txt(p, "AI", 200, 204, 92, c.fg && pick(c, "") ? c.fg : "#111111");
  } },
  drone: { cw: 480, ch: 360, draw: (p) => {
    p.stroke([[90, 90], [390, 90]], 14); for (const x of [90, 390]) { p.stroke([[x, 90], [x, 60]], 10); p.ell(x, 56, 70, 12, "#cfd6de", 6); }
    p.poly(rr(170, 70, 310, 140, 22), "#3f6fb5", 9); p.ell(240, 105, 14, 14, "#4dff9a", 0);
    p.stroke([[210, 140], [200, 200]], 6); p.stroke([[270, 140], [280, 200]], 6);
    p.poly(rr(170, 200, 310, 320, 8), "#d9a066", 9); p.poly(rr(230, 200, 250, 320, 2), "#c08a52", 0);                                     // the package
  } },
  plant: { cw: 520, ch: 460, draw: (p) => {
    p.poly([[300, 440], [320, 140], [440, 140], [470, 440]], "#cfd6de", 9);                                                               // cooling tower
    p.ell(380, 140, 60, 16, "#e8ecf2", 7); p.ell(370, 90, 60, 36, "#ffffff", 0); p.ell(420, 60, 50, 30, "#ffffff", 0);                   // steam
    p.poly(rr(30, 250, 320, 440, 10), "#e2dccf", 9); for (let i = 0; i < 4; i++) p.poly(rr(55 + i * 66, 290, 95 + i * 66, 340, 6), "#a8d8ff", 5);
    p.poly([[150, 360], [120, 420], [160, 410], [140, 470]], "#f2c94c", 6);                                                              // bolt
    p.poly([[175, 350], [205, 350], [180, 400], [215, 400], [160, 450], [175, 410], [150, 410]], "#f2c94c", 7);
  } },
  satellite: { cw: 560, ch: 300, draw: (p) => {
    for (const x of [20, 360]) { p.poly(rr(x, 90, x + 180, 210, 8), "#3f6fb5", 8); for (let i = 1; i < 4; i++) p.stroke([[x + i * 45, 92], [x + i * 45, 208]], 4, "#a8d8ff"); }
    p.stroke([[200, 150], [360, 150]], 10); p.poly(rr(225, 95, 335, 205, 14), "#cfd6de", 9); p.ell(280, 150, 22, 22, "#4dff9a", 5);
    p.stroke([[280, 95], [280, 40]], 6); p.ell(280, 34, 26, 10, "#cfd6de", 5);
  } },
  chatbot: { cw: 440, ch: 360, draw: (p, c) => {
    p.poly([...rr(20, 20, 420, 270, 50), [120, 270], [80, 340], [180, 270]], "#ffffff", 9);
    txt(p, "AI", 220, 130, 110, pick(c, "#3f6fb5")); for (const x of [150, 220, 290]) p.ell(x, 215, 16, 16, "#9aa3b5", 0);
  } },
  ring: { cw: 340, ch: 360, draw: (p) => {
    p.ell(170, 230, 120, 110, "#e0b030", 12); p.ell(170, 240, 78, 70, null, 9);
    p.poly([[100, 120], [240, 120], [270, 60], [70, 60]], "#f2c94c", 9); p.poly([[130, 60], [210, 60], [170, 10]], "#5fd8ff", 7);         // crown + gem
    p.ell(170, 92, 20, 20, "#e2453c", 5);
  } },
  stadium: { cw: 680, ch: 380, draw: (p, c) => {
    p.ell(340, 250, 320, 110, pick(c, "#3f6fb5"), 10); p.ell(340, 235, 250, 70, "#3f8a35", 8); p.ell(340, 235, 120, 30, null, 4);
    for (const x of [40, 640]) { p.stroke([[x, 250], [x, 60]], 10); p.poly(rr(x - 40, 30, x + 40, 70, 8), "#fff3b0", 7); }
    for (let i = 0; i < 9; i++) p.ell(110 + i * 58, 205 - Math.abs(i - 4) * 4, 9, 9, ["#e2453c", "#f2c94c", "#ffffff"][i % 3], 0);
  } },
  factory: { cw: 600, ch: 420, draw: (p, c) => {
    p.poly(rr(470, 40, 530, 230, 6), "#9aa3b5", 8); p.ell(500, 30, 50, 26, "#e8ecf2", 0);                                                // chimney + smoke
    p.poly([[20, 400], [20, 180], [140, 110], [140, 180], [260, 110], [260, 180], [380, 110], [380, 180], [580, 180], [580, 400]], pick(c, "#c05e44"), 9);
    for (let i = 0; i < 4; i++) p.poly(rr(50 + i * 130, 240, 140 + i * 130, 310, 8), "#a8d8ff", 6);
    p.poly(rr(250, 320, 350, 400, 6), "#2b2a33", 6);
  } },
  snack: { cw: 300, ch: 400, draw: (p, c) => {
    p.poly([[40, 40], [260, 40], [250, 70], [270, 330], [250, 370], [50, 370], [30, 330], [50, 70]], pick(c, "#f2c94c"), 9);
    p.ell(150, 200, 70, 70, "#ffffff", 6); p.ell(150, 200, 45, 40, "#e0a040", 5); for (let i = 0; i < 6; i++) p.stroke([[60 + i * 36, 40], [70 + i * 36, 55]], 4, "#ffffff");
  } },
  hanger: { cw: 420, ch: 420, draw: (p, c) => {
    p.stroke([[210, 70], [210, 30], [240, 20]], 8, "#9aa3b5"); p.stroke([[60, 120], [210, 70], [360, 120]], 10, "#9aa3b5");
    p.poly([[70, 125], [150, 100], [210, 130], [270, 100], [350, 125], [400, 210], [340, 240], [320, 200], [320, 400], [100, 400], [100, 200], [80, 240], [20, 210]], pick(c, "#2b2a33"), 9);
    txt(p, (c.fg ? "FIT" : "FIT"), 210, 280, 70, c.fg || "#ffffff");
  } },
  dome: { cw: 620, ch: 360, draw: (p) => {
    p.ell(310, 330, 290, 260, "#cfe6ff", 10, 180, 360); for (let i = 1; i < 5; i++) p.ell(310, 330, 290 * (1 - i * 0.18), 260, null, 4, 180, 360);
    p.stroke([[20, 330], [600, 330]], 10); p.ell(520, 60, 40, 40, "#f2c94c", 6);
  } },
  dumbbell: { cw: 460, ch: 200, draw: (p) => {
    p.poly(rr(110, 85, 350, 115, 10), "#9aa3b5", 7);
    for (const x of [40, 90, 330, 380]) p.poly(rr(x, 30, x + 40, 170, 10), "#2b2a33", 7);
  } },
  tv: { cw: 460, ch: 400, draw: (p, c) => {
    p.poly(rr(20, 20, 440, 300, 22), "#2b2a33", 10); p.poly(rr(45, 45, 415, 275, 12), pick(c, "#5fb8ff"), 0);
    p.poly([[190, 120], [190, 200], [260, 160]], "#ffffff", 6); p.stroke([[170, 300], [140, 380]], 10); p.stroke([[290, 300], [320, 380]], 10);
  } },
  books: { cw: 420, ch: 380, draw: (p) => {
    const cols = ["#e2453c", "#3f6fb5", "#f2c94c", "#4fbf6b", "#9a6a3e"];
    for (let i = 0; i < 5; i++) { const y = 300 - i * 62, x = 40 + (i % 2) * 24; p.poly(rr(x, y, x + 320, y + 58, 8), cols[i], 8); p.poly(rr(x + 300, y + 8, x + 316, y + 50, 3), "#f4f1ea", 0); }
  } },
  ereader: { cw: 300, ch: 420, draw: (p) => {
    p.poly(rr(20, 20, 280, 400, 26), "#2b2a33", 10); p.poly(rr(48, 52, 252, 340, 8), "#e9e6dc", 0);
    for (let i = 0; i < 7; i++) p.stroke([[70, 90 + i * 34], [i % 3 === 2 ? 170 : 230, 90 + i * 34]], 8, "#9aa3b5");
    p.poly(rr(120, 360, 180, 376, 6), "#5a5560", 0);
  } },
  letter: { cw: 360, ch: 440, draw: (p) => {        // a memo / letter / email (announcements, resignations, contracts)
    p.poly(rr(20, 20, 340, 420, 14), "#fbf8f1", 10); p.poly(rr(20, 20, 340, 95, 14), "#3f6fb5", 0);
    txt(p, "MEMO", 180, 60, 48, "#ffffff");
    for (let i = 0; i < 7; i++) p.stroke([[55, 140 + i * 36], [i === 6 ? 190 : 305, 140 + i * 36]], 9, "#9aa3b5");
    p.stroke([[200, 390], [240, 372], [270, 392], [305, 370]], 6, "#2b2a33");                                    // signature
  } },
  idea: { cw: 300, ch: 420, draw: (p) => {          // the "next idea" / "still not enough?" lightbulb
    for (const [a, l] of [[-2.4, 60], [-1.6, 70], [-0.8, 60], [0.0, 75], [0.8, 60], [1.6, 70], [2.4, 60]] as P2[]) {
      const x = 150 + Math.sin(a * 0.6) * 140, y = 150 - Math.cos(a * 0.6) * 140;
      p.stroke([[x, y], [x + Math.sin(a * 0.6) * l * 0.4, y - Math.cos(a * 0.6) * l * 0.4]], 10, "#f2c94c");
    }
    p.ell(150, 170, 90, 95, "#fff3b0", 10); p.stroke([[120, 190], [135, 230], [150, 195], [165, 230], [180, 190]], 6, "#e0a040");
    p.poly(rr(108, 255, 192, 330, 10), "#9aa3b5", 9); p.stroke([[108, 280], [192, 280]], 6); p.stroke([[108, 305], [192, 305]], 6);
  } },
  shot: { cw: 460, ch: 420, draw: (p) => {          // a long shot: ball flying in an arc into a hoop
    p.poly(rr(300, 40, 450, 150, 8), "#ffffff", 9); p.poly(rr(345, 85, 405, 130, 4), null, 6);
    p.stroke([[330, 150], [420, 150]], 10, "#f0742c");
    for (let i = 0; i < 5; i++) p.stroke([[335 + i * 20, 152], [345 + i * 16, 210]], 4, "#e8e8ee");
    for (let i = 0; i < 9; i++) { const t = i / 9, x = 40 + t * 280, y = 360 - Math.sin(t * Math.PI * 0.95) * 300; p.ell(x, y, 7, 7, "#f2c94c", 0); }
    p.ell(60, 340, 44, 44, "#f0742c", 8); p.stroke([[16, 340], [104, 340]], 5); p.stroke([[60, 296], [60, 384]], 5);
  } },
  poster: { cw: 340, ch: 460, draw: (p, c) => {     // a sports poster / highlight
    p.poly(rr(10, 10, 330, 450, 10), "#2b2a33", 10); p.poly(rr(30, 30, 310, 380, 6), pick(c, "#e2453c"), 0);
    p.ell(240, 110, 26, 26, "#2b2a33", 0); p.poly([[200, 140], [260, 140], [250, 250], [205, 250]], "#2b2a33", 0);   // a dunker
    p.stroke([[215, 145], [270, 60]], 18, "#2b2a33"); p.stroke([[210, 250], [160, 320]], 18, "#2b2a33"); p.stroke([[245, 250], [270, 330]], 18, "#2b2a33");
    p.ell(285, 55, 18, 18, "#f0742c", 5); p.stroke([[60, 90], [140, 90]], 10, "#ffffff");
    txt(p, "DUNK!", 170, 415, 56, "#f2c94c");
  } },
  medal: { cw: 300, ch: 420, draw: (p) => {
    p.poly([[70, 20], [140, 20], [170, 200], [100, 200]], "#3f6fb5", 7); p.poly([[230, 20], [160, 20], [130, 200], [200, 200]], "#e2453c", 7);
    p.ell(150, 290, 110, 110, "#e0b030", 10); p.ell(150, 290, 70, 70, "#f2c94c", 6); txt(p, "1", 150, 292, 90, "#a8761a");
  } },
  crown: { cw: 420, ch: 300, draw: (p) => {
    p.poly([[30, 260], [50, 70], [130, 170], [210, 40], [290, 170], [370, 70], [390, 260]], "#f2c94c", 10);
    for (const [x, y, col] of [[210, 40, "#e2453c"], [50, 70, "#5fd8ff"], [370, 70, "#4dff9a"]] as [number, number, string][]) p.ell(x, y, 18, 18, col, 6);
  } },
};
export const THING_NAMES = Object.keys(THINGS);
