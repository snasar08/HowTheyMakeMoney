"""Depth maps for the Higgsfield images, so the renderer can add real parallax (camera drifting
through the picture) without spending video credits.

Model: Depth Anything V2 Small (Apache-2.0, ~100 MB, CPU ~2 s per image), via transformers.
Each map is computed once per image and cached as a 16-bit PNG next to the image cache.
Returns None if the model can't load — the renderer then falls back to the flat zoom.
"""
from __future__ import annotations

import hashlib
import os
import threading
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

MODEL = os.environ.get("DEPTH_MODEL", "depth-anything/Depth-Anything-V2-Small-hf")
_pipe = None
_lock = threading.Lock()
_failed = False


def _cache_dir() -> Path:
    from .render import CACHE
    CACHE.mkdir(parents=True, exist_ok=True)
    return CACHE


def depth_for(key: str, img: Image.Image) -> np.ndarray | None:
    """Relative depth in 0..1 (1 = nearest), same aspect as img, lightly smoothed."""
    global _pipe, _failed
    path = _cache_dir() / f"depth-{hashlib.sha1(key.encode()).hexdigest()[:16]}.png"
    if not path.exists():
        with _lock:
            if not path.exists():
                if _failed:
                    return None
                try:
                    if _pipe is None:
                        from transformers import pipeline
                        _pipe = pipeline("depth-estimation", model=MODEL, device="cpu")
                    small = img.convert("RGB")
                    small.thumbnail((768, 768))
                    d = np.asarray(_pipe(small)["predicted_depth"].squeeze().float().numpy(), np.float32)
                    d = (d - d.min()) / max(1e-6, float(d.max() - d.min()))
                    Image.fromarray((d * 65535).astype(np.uint16)).save(path)
                except Exception as exc:  # noqa: BLE001 — parallax is optional
                    print(f"::warning::[depth] depth model unavailable ({exc!r}); flat image motion")
                    _failed = True
                    return None
    d = Image.fromarray(np.asarray(Image.open(path), np.float32) / 65535.0, mode="F")
    d = d.resize(img.size, Image.BILINEAR)
    # smooth so depth edges stretch softly instead of tearing (blur works on 8-bit only)
    d8 = Image.fromarray((np.asarray(d) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
    return np.asarray(d8, np.float32) / 255.0
