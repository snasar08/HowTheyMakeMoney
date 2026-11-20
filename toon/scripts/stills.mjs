// usage: node scripts/stills.mjs <compositionId> <outPrefix> <frame,frame,...> [scale] [propsJsonFile]
// Bundles once, then renders stills (software GL on GitHub: GL=swangle; a real GPU: GL=angle).
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
const [id, prefix, frames, scale = "0.5", propsFile0] = process.argv.slice(2);
const propsFile = propsFile0 && propsFile0 !== "-" ? propsFile0 : null;
const inputProps = propsFile ? JSON.parse(fs.readFileSync(propsFile, "utf8")) : {};
const chromiumOptions = { gl: process.env.GL || "swangle" };
const browserExecutable = process.env.CHROME || undefined;
const t00 = Date.now();
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
console.log("bundle", ((Date.now() - t00) / 1000).toFixed(1) + "s");
const composition = await selectComposition({ serveUrl, id, inputProps, browserExecutable, chromiumOptions, timeoutInMilliseconds: 240000 });
const seen = new Set();
const onBrowserLog = (l) => { const t = l.text.slice(0, 500); if (/404|Clock|swiftshader/.test(t) || seen.has(t)) return; seen.add(t); if (process.env.DEBUG || l.type === "error" || l.type === "warning") console.log(`[${l.type}]`, t); };
fs.mkdirSync(path.dirname(prefix), { recursive: true });
for (const f of frames.split(",").map(Number)) {
  const t0 = Date.now();
  try {
    await renderStill({ composition, serveUrl, frame: f, output: `${prefix}${f}.jpg`, imageFormat: "jpeg", jpegQuality: 88, scale: Number(scale),
      inputProps, browserExecutable, chromiumOptions, timeoutInMilliseconds: 240000, onBrowserLog });
    console.log("still", f, ((Date.now() - t0) / 1000).toFixed(1) + "s");
  } catch (e) { console.log("FAILED", f, String(e).slice(0, 1500)); }
}
