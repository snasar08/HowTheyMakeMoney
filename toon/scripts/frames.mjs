// usage: node scripts/frames.mjs <compositionId> <props.json> <outDir> <shard> <shards> [scale]
// Renders this shard's slice of the composition as JPEG frames into <outDir>/<shard>/ and writes range.json
// ({start, end}: composition frames, end exclusive), so the frames can be mapped back whatever Remotion names them.
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";
const [id0, propsFile, outDir, shardS, shardsS, scale = "0.5"] = process.argv.slice(2);
const shard = Number(shardS), shards = Number(shardsS);
const inputProps = JSON.parse(fs.readFileSync(propsFile, "utf8"));
const id = inputProps.ah?.film ? "AhFilm" : inputProps.ah ? "AhShort" : id0;   // Nov 16: the afterhour look, chosen by the plan; Nov 19: films (16:9)
const chromiumOptions = { gl: process.env.GL || "swangle" };
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id, inputProps, chromiumOptions, timeoutInMilliseconds: 300000 });
const total = composition.durationInFrames, start = Math.floor((total * shard) / shards), end = Math.floor((total * (shard + 1)) / shards);
const dir = path.join(outDir, String(shard));
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "range.json"), JSON.stringify({ start, end, total }));
if (end <= start) { console.log("empty shard"); process.exit(0); }
const t0 = Date.now();
let last = 0;
await renderFrames({
  composition, serveUrl, inputProps, outputDir: dir, imageFormat: "jpeg", jpegQuality: 90, frameRange: [start, end - 1], scale: Number(scale),
  concurrency: Number(process.env.CONCURRENCY || 2), chromiumOptions, timeoutInMilliseconds: 300000,
  onStart: () => console.log(`shard ${shard}: frames ${start}..${end - 1} of ${total}`),
  onFrameUpdate: (n) => { if (n - last >= 10) { last = n; console.log(`  ${n}/${end - start} (${((Date.now() - t0) / 1000 / n).toFixed(1)} s/frame)`); } },
  onBrowserLog: (l) => { if (l.type === "error" && !/404/.test(l.text)) console.log("[error]", l.text.slice(0, 300)); },
});
console.log(`done ${end - start} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
