"""Source fetcher for the weekly script writer (runs on GitHub Actions).

The cloud routine that writes scripts can search the web but can't open pages. So it lists
the URLs it needs in research/requests.txt on a `research/<anything>` branch and pushes;
.github/workflows/fetch-sources.yml runs this on GitHub's machines (which can reach any site),
saves each page as plain text in research/pages/, writes research/index.json and pushes back
to the same branch. The writer pulls and reads the real page text.

  python -m pipeline.fetch_sources research/requests.txt research/
"""
from __future__ import annotations

import datetime as dt
import gzip
import hashlib
import html
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

# SEC and BLS reject bots without a "Name contact@email" User-Agent. The GitHub no-reply
# address keeps Sam's real email private.
UA = "HowTheyMakeMoney research snasar08@users.noreply.github.com"
MAX_BYTES = 40_000_000
MAX_TEXT = 1_500_000  # chars kept per page (10-Ks are long; grep the file for the table you need)


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "head"}
    BLOCK = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.BLOCK:
            self.out.append("\n")
        elif tag in ("td", "th"):
            self.out.append(" | ")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def html_to_text(raw: str) -> str:
    p = _Text()
    p.feed(raw)
    text = html.unescape("".join(p.out))
    text = re.sub(r"[ \t\xa0]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def pdf_to_text(data: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(data)
        f.flush()
        r = subprocess.run(["pdftotext", "-layout", f.name, "-"], capture_output=True, timeout=120)
        return r.stdout.decode("utf-8", "replace")


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip",
                                               "Accept": "text/html,application/pdf,*/*"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read(MAX_BYTES)
        if r.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
        ctype = r.headers.get("Content-Type", "")
        final = r.geturl()
        status = r.status
    if "pdf" in ctype or data[:4] == b"%PDF":
        text = pdf_to_text(data)
    else:
        m = re.search(r"charset=([\w-]+)", ctype)
        text = html_to_text(data.decode(m.group(1) if m else "utf-8", "replace"))
    return {"status": status, "final_url": final, "content_type": ctype, "text": text}


def main(requests_file: str, out_dir: str) -> int:
    out = Path(out_dir)
    pages = out / "pages"
    pages.mkdir(parents=True, exist_ok=True)
    idx_path = out / "index.json"
    index = json.loads(idx_path.read_text()) if idx_path.exists() else {}
    urls = [u.strip() for u in Path(requests_file).read_text().splitlines()
            if u.strip() and not u.strip().startswith("#")]
    for url in dict.fromkeys(urls):
        name = hashlib.sha1(url.encode()).hexdigest()[:12] + ".txt"
        if index.get(url, {}).get("ok"):
            continue
        entry = {"file": f"pages/{name}", "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        try:
            res = fetch(url)
            text = res.pop("text")
            (pages / name).write_text(f"URL: {url}\nFINAL_URL: {res['final_url']}\nFETCHED: "
                                      f"{entry['fetched_at']}\n\n{text[:MAX_TEXT]}", encoding="utf-8")
            entry.update(ok=True, chars=len(text), **res)
        except urllib.error.HTTPError as exc:
            entry.update(ok=False, error=f"HTTP {exc.code}")
        except Exception as exc:  # report and keep going
            entry.update(ok=False, error=repr(exc)[:200])
        index[url] = entry
        print(("OK  " if entry["ok"] else "FAIL") + f" {url} {entry.get('chars', entry.get('error'))}")
        time.sleep(0.3)  # be polite (SEC allows 10 req/s)
    idx_path.write_text(json.dumps(index, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
