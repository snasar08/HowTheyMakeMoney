"""Time a low-poly crowd scene in our moderngl engine: N GPU-skinned characters on a field."""
import json
import math
import os
import sys
import time

sys.path.insert(0, os.getcwd())
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from pipeline import character, gl3d  # noqa: E402
from pipeline.crowd import Crowd, grid_crowd  # noqa: E402
from pipeline.gl3d import Scene, run3d  # noqa: E402

N = int(os.environ.get("CROWD_N", "300"))
LOOK = dict(fog=(0.62, 0.8, 0.98), floor=(0.36, 0.62, 0.3), grid=0.0, sky=(0.9, 0.95, 1.0), ground=(0.35, 0.3, 0.25),
            rim=(0.3, 0.3, 0.3), key_dir=(-0.4, -1, -0.5), fog_near=30, fog_far=90, floor_radius=60)


def frame(crowd, t):
    sc = Scene(LOOK, (math.sin(t * 0.4) * 6, 4.0, 22 - t), (0, 1.2, 0), fov=45, aperture=0.0)
    sc.customs.append(crowd.drawer(t))
    return sc.render()


def build(ch, rng):
    c = Crowd(ch, skin="LightSkin")
    pos = grid_crowd(N, -18, 18, -30, 8, rng)
    clips = [ch.find_clip("run") if i % 3 else ch.find_clip("jump") for i in range(N)]
    c.place(pos, rng.uniform(-0.4, 0.4, N) + np.pi, rng.uniform(0.9, 1.1, N),
            [tuple(rng.uniform(0.6, 1.0, 3)) for _ in range(N)], clips, (np.arange(N) % 8) * 0.13)
    return c


def main():
    ch = character.load("quaternius-animated-human")
    rng = np.random.default_rng(1)
    crowd = run3d(build, ch, rng)
    run3d(frame, crowd, 0.0)
    t0 = time.time()
    n = 30
    img = None
    for k in range(n):
        img = run3d(frame, crowd, k / 30)
    ms = (time.time() - t0) / n * 1000
    Image.fromarray(img).save(f"bench/crowd_{N}.png")
    print(json.dumps({"engine": "moderngl", "renderer": run3d(lambda: gl3d.Engine.get().renderer), "crowd": N,
                      "ms_per_frame": round(ms, 1)}))


if __name__ == "__main__":
    main()
