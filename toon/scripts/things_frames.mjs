// usage: node scripts/things_frames.mjs <props.json>  -> prints a comma list: one frame per shot (20 frames in, after the pop-in)
import fs from "node:fs";
const p = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
console.log((p.ah?.shots ?? []).map((s) => s.a + Math.min(20, s.n - 1)).join(","));
