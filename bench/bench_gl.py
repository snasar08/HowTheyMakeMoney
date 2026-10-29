"""Time the moderngl 3D scenes on this machine (GitHub runner: llvmpipe via EGL)."""
import json, os, sys, time
sys.path.insert(0, os.getcwd())
from pipeline import gl3d, scene3d
from pipeline.themes import get_theme

s = json.load(open("content/scripts/001-costco.json", encoding="utf-8"))
vis = [sc["visual"] for sc in s["scenes"] if sc["visual"]["type"] in ("bars", "stat", "donut")]
vis.append({"type": "donut", "value": 95, "label": "of restaurants are franchised"})
out = {"renderer": None, "w": gl3d.W3D, "h": gl3d.H3D, "msaa": gl3d.SAMPLES, "ms_per_frame": {}}
for v in vis:
    f = scene3d.RENDERERS[v["type"]]
    f(get_theme(s["theme"]), s["theme"], v, 0.0, 0.0, 0)  # warm-up (context, textures)
    t0 = time.time()
    n = 30
    for k in range(n):
        f(get_theme(s["theme"]), s["theme"], v, k / 30, k / n, k % 3)
    out["ms_per_frame"][v["type"]] = round((time.time() - t0) / n * 1000, 1)
out["renderer"] = gl3d.Engine.get().renderer
f(get_theme(s["theme"]), s["theme"], vis[0], 2.0, 0.5, 0).save(f"bench/frame_{gl3d.W3D}_{gl3d.SAMPLES}.png")
print(json.dumps(out))
