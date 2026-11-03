"""Download the Poly Haven (CC0) skies and floor textures the Blender renderer uses per set.

  python -m pipeline.polyhaven assets/polyhaven

Each set gets an HDRI (real sky / room lighting) and a floor material (color, normal, roughness).
Files land as <dir>/<asset>.hdr and <dir>/<asset>_{diff,nor,rough}.jpg; existing files are kept,
so a cached folder costs nothing. Everything on polyhaven.com is CC0 (no credit needed).
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

# set -> (hdri, floor texture, camera sees the sky?)
LOOKS = {
    "field": ("kloofendal_48d_partly_cloudy_puresky", "aerial_grass_rock", True),
    "pitch": ("dikhololo_night", "aerial_grass_rock", True),
    "launch": ("kloofendal_48d_partly_cloudy_puresky", "rocky_trail", True),
    "city": ("potsdamer_platz", "asphalt_02", True),
    "store": ("brown_photostudio_02", "concrete_floor_02", False),
    "warehouse": ("empty_warehouse_01", "concrete_floor_02", False),
    "office": ("brown_photostudio_02", "laminate_floor_02", False),
    "court": ("empty_warehouse_01", "wood_floor_deck", False),
    "stage": ("studio_small_08", "painted_concrete", False),
    "studio": ("studio_small_08", "painted_concrete", False),
    "gaming": ("studio_small_08", "painted_concrete", False),
}
API = "https://api.polyhaven.com/files/"


UA = {"User-Agent": "HowTheyMakeMoney-pipeline (github.com/snasar08/HowTheyMakeMoney)"}  # the API asks for a named client


def _open(url: str, timeout=60):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)


def _get(url: str, dest: Path):
    if dest.exists() and dest.stat().st_size > 0:
        return
    with _open(url) as r:
        dest.write_bytes(r.read())


def fetch(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    hdris = {h for h, _, _ in LOOKS.values()}
    texs = {t for _, t, _ in LOOKS.values()}
    for h in sorted(hdris):
        info = json.load(_open(API + h, 30))
        _get(info["hdri"]["2k"]["hdr"]["url"], out / f"{h}.hdr")
    for t in sorted(texs):
        info = json.load(_open(API + t, 30))
        for key, name in (("Diffuse", "diff"), ("nor_gl", "nor"), ("Rough", "rough")):
            if key in info:
                _get(info[key]["1k"]["jpg"]["url"], out / f"{t}_{name}.jpg")
    print(f"[polyhaven] {len(hdris)} skies, {len(texs)} floors in {out}")


if __name__ == "__main__":
    fetch(Path(sys.argv[1] if len(sys.argv) > 1 else "assets/polyhaven"))
