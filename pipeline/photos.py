"""Free-license photos of real people from Wikimedia Commons, with the credit line each needs.

Editorial "backstory" Shorts (Nov 3, Sam liked the Whoop reel) show the real people a story is
about. Only Commons files whose license allows reuse with credit are used: CC0, public domain,
CC BY and CC BY-SA. Anything else (or a fetch error) returns None and the card falls back to a
name-only tile, so a bad photo never blocks a Short. Credits go in the video description.

  photo("File:Cristiano Ronaldo 2018.jpg") -> (PIL image, "Name — Artist, CC BY-SA 3.0, via Wikimedia Commons")
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

CACHE = Path(os.environ.get("HTMM_CACHE", ".cache")) / "commons"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "HowTheyMakeMoney-pipeline (github.com/snasar08/HowTheyMakeMoney)"}
OK = re.compile(r"^(cc0|public domain|pd\b|cc by(-sa)? \d)", re.I)


def _get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read()


def info(title: str) -> dict | None:
    """Commons metadata for a file: url, license, artist. None if it isn't free to reuse."""
    CACHE.mkdir(parents=True, exist_ok=True)
    title = title if title.startswith("File:") else f"File:{title}"
    meta = CACHE / (hashlib.sha1(title.encode()).hexdigest()[:16] + ".json")
    if meta.exists():
        d = json.loads(meta.read_text())
    else:
        q = urllib.parse.urlencode({"action": "query", "titles": title, "prop": "imageinfo", "format": "json",
                                    "iiprop": "url|extmetadata", "iiurlwidth": 900})
        pages = json.loads(_get(f"{API}?{q}"))["query"]["pages"]
        ii = next(iter(pages.values())).get("imageinfo", [{}])[0]
        em = ii.get("extmetadata", {})
        strip = lambda h: re.sub(r"<[^>]+>", "", h or "").strip()
        d = {"title": title, "url": ii.get("thumburl") or ii.get("url"),
             "license": strip(em.get("LicenseShortName", {}).get("value")),
             "artist": strip(em.get("Artist", {}).get("value")) or "Unknown author",
             "page": ii.get("descriptionurl")}
        meta.write_text(json.dumps(d))
    if not d.get("url") or not OK.match(d.get("license", "")):
        return None
    return d


def photo(title: str, name: str = ""):
    """(PIL RGB image, credit line) or (None, None)."""
    from PIL import Image
    try:
        d = info(title)
        if not d:
            print(f"::warning::[photos] {title}: not a free license, skipped")
            return None, None
        f = CACHE / (hashlib.sha1(d["url"].encode()).hexdigest()[:16] + ".jpg")
        if not f.exists():
            f.write_bytes(_get(d["url"]))
        img = Image.open(io.BytesIO(f.read_bytes())).convert("RGB")
        who = f"{name} — " if name else ""
        return img, f"{who}{d['artist']}, {d['license']}, via Wikimedia Commons ({d['page']})"
    except Exception as exc:  # never lose a night over a photo
        print(f"::warning::[photos] {title}: {exc!r}")
        return None, None


def credits(script: dict) -> list[str]:
    """Credit lines for every person photo in a script (for the description)."""
    out = []
    for sc in script.get("scenes", []):
        for p in sc.get("visual", {}).get("people", []):
            if p.get("photo"):
                _, c = photo(p["photo"], p.get("name", ""))
                if c and c not in out:
                    out.append(c)
    return out
