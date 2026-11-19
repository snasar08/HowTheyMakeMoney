"""Post a finished Short straight to YouTube through the Data API (free), as an alternative to Buffer.

Why (Nov 19 2026): Buffer's free plan caps YouTube at 2 posts per rolling 24 h. publish.py uses this when
UPLOAD_MODE is "youtube" (all posts) or "mix" (Buffer first, the overflow here). Off by default.

Login: the comment login secrets YTC_CLIENT_ID / YTC_CLIENT_SECRET / YTC_REFRESH_TOKEN (scope youtube.force-ssl,
which allows videos.insert and thumbnails.set), through pipeline.comment_replies.token().

What one upload does:
  1. videos.insert, uploadType=resumable, part=snippet,status: title, description, tags from the script,
     categoryId 27 (Education, same as Buffer), selfDeclaredMadeForKids false, containsSyntheticMedia true
     (AI voice and images), privacyStatus "private" + publishAt = the slot time (YouTube publishes it then).
  2. thumbnails.set with frame 0 of the MP4 (our title cover), same as pipeline/thumb_fix.py.
  3. videos.list part=status to report uploadStatus / privacyStatus / publishAt.
Quota: videos.insert = 1,600 units + thumbnails.set 50; the free daily quota is 10,000 (about 6 Shorts a day).
Until Google audits the API project, YouTube locks API uploads to private ("locked"): the video then never goes
public at publishAt. We detect that as best we can (see locked_hint) and print a ::warning::.
Never raises out of upload_short() / upload_film(): any failure prints a ::warning:: and returns None (caller keeps the MP4 as a release).

  python -m pipeline.yt_upload --dry 007                       # print the request bodies, no network
  python -m pipeline.yt_upload --test 007 --mp4 x.mp4          # upload PRIVATE, no publishAt, set thumbnail, print id + status
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "content" / "scripts"
API = "https://www.googleapis.com/youtube/v3"
UPLOAD = "https://www.googleapis.com/upload/youtube/v3"
CATEGORY = "27"  # Education (Shorts)
FILM_CATEGORY = "1"  # Film & Animation (long-form films, pipeline/films.py)


class YtError(RuntimeError):
    pass


def load_script(sid: str) -> dict:
    found = sorted(SCRIPTS.glob(f"{sid}-*.json")) or sorted(SCRIPTS.glob(f"{sid}*.json"))
    if not found:
        raise YtError(f"no script {sid}")
    return json.loads(found[0].read_text(encoding="utf-8"))


def _clean(t: str) -> str:
    return t.replace("<", "").replace(">", "")


def _description(script: dict) -> str:
    desc = script["description"].strip()
    try:  # free-license photos of real people need their credit line (pipeline/photos.py)
        from .photos import credits
        cr = credits(script)
    except Exception:
        cr = []
    if cr and "Wikimedia Commons" not in desc:
        desc += "\n\nPhotos: " + "; ".join(cr)
    return _clean(desc)[:4900]


def _tags(script: dict) -> list[str]:
    out, n = [], 0
    for t in script.get("tags", []):
        t = _clean(str(t)).strip()
        if t and n + len(t) + 1 <= 450 and len(out) < 15:  # YouTube: all tags together at most 500 chars
            out.append(t)
            n += len(t) + 1
    return out


def video_body(script: dict, when: dt.datetime | None, category: str = CATEGORY) -> dict:
    """videos.insert body. when=None -> private with no publishAt (test uploads)."""
    status = {"privacyStatus": "private", "selfDeclaredMadeForKids": False, "containsSyntheticMedia": True}
    if when is not None:
        status["publishAt"] = when.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"snippet": {"title": _clean(script["title"])[:100], "description": _description(script),
                        "tags": _tags(script), "categoryId": category},
            "status": status}


def _http(req: urllib.request.Request, timeout: int = 120):
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:500]
        raise YtError(f"HTTP {exc.code}: {body}") from None


def _code(exc: Exception) -> int:
    s = str(exc)
    return int(s.split()[1].rstrip(":")) if s.startswith("HTTP ") else 0


def insert(video: Path, body: dict, access: str) -> dict:
    """Resumable upload: start a session, PUT the file (resume from the server's offset on a hiccup)."""
    size = video.stat().st_size
    start = urllib.request.Request(
        f"{UPLOAD}/videos?uploadType=resumable&part=snippet,status&notifySubscribers=true",
        data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json; charset=UTF-8",
                 "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)})
    with _http(start) as r:
        loc = r.headers.get("Location")
    if not loc:
        raise YtError("no resumable upload URL returned")
    data = video.read_bytes()
    offset, last = 0, None
    for attempt in range(5):
        hdr = {"Content-Type": "video/mp4", "Content-Length": str(size - offset)}
        if offset:
            hdr["Content-Range"] = f"bytes {offset}-{size - 1}/{size}"
        try:
            with _http(urllib.request.Request(loc, data=data[offset:], method="PUT", headers=hdr), timeout=600) as r:
                return json.loads(r.read())
        except YtError as exc:
            last = exc
            if 0 < _code(exc) < 500:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
        time.sleep(5 * (attempt + 1))
        try:  # ask how much arrived: 308 + Range header (200/201 = it actually finished)
            q = urllib.request.Request(loc, method="PUT", headers={"Content-Length": "0",
                                                                   "Content-Range": f"bytes */{size}"})
            try:
                with urllib.request.urlopen(q, timeout=60) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                if e.code == 308:
                    rng = e.headers.get("Range")  # "bytes=0-12345"
                    offset = int(rng.split("-")[1]) + 1 if rng else 0
                else:
                    raise
        except Exception:
            pass
    raise YtError(f"upload failed after retries: {last!r}")


def cover(video: Path, out: Path) -> None:
    """Frame 0 (the title cover) at full 1080x1920, JPEG well under YouTube's 2 MB limit (as thumb_fix.cover)."""
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-frames:v", "1",
                    "-vf", "scale=1080:1920", "-q:v", "3", str(out)], check=True)


def set_thumb(vid: str, img: Path, access: str) -> None:
    req = urllib.request.Request(f"{UPLOAD}/thumbnails/set?videoId={vid}&uploadType=media",
                                 data=img.read_bytes(), method="POST",
                                 headers={"Authorization": f"Bearer {access}", "Content-Type": "image/jpeg"})
    with _http(req, timeout=60) as r:
        r.read()


def video_status(vid: str, access: str) -> dict:
    q = urllib.parse.urlencode({"part": "status", "id": vid})
    with _http(urllib.request.Request(f"{API}/videos?{q}", headers={"Authorization": f"Bearer {access}"}), 60) as r:
        items = json.loads(r.read()).get("items") or []
    return (items[0].get("status") if items else {}) or {}


def locked_hint(sent: dict, got: dict) -> str | None:
    """Best-effort: an unaudited API project gets its uploads forced to private. YouTube documents this as
    'locked' in Studio; through the API the only visible signs are a status that lost our publishAt or a
    rejection/failure reason. Field names are the documented video.status ones (the lock itself is UNCONFIRMED)."""
    if got.get("uploadStatus") in ("rejected", "failed"):
        return f"uploadStatus={got.get('uploadStatus')} reason={got.get('rejectionReason') or got.get('failureReason')}"
    if sent.get("publishAt") and not got.get("publishAt"):
        return "publishAt was dropped (video forced private: the API project is probably not audited yet)"
    return None


def _upload(video: Path, body: dict, tag: str, watch_url: str, thumb_fn) -> dict | None:
    """Shared by Shorts and films: login, insert, thumb_fn(vid, access) (failure tolerated), status check.
    Returns {video_id, url, ...}; None (with a ::warning::) on any failure. Never raises."""
    from .comment_replies import token
    try:
        access = token()
    except Exception as exc:
        print(f"::warning title=YouTube upload {tag}::login failed ({exc!r}); YTC_* secrets wrong or expired?")
        return None
    if not access:
        print(f"::warning title=YouTube upload {tag}::YTC_CLIENT_ID / YTC_CLIENT_SECRET / YTC_REFRESH_TOKEN not set")
        return None
    try:
        res = insert(video, body, access)
    except YtError as exc:
        msg = str(exc)
        if "quotaExceeded" in msg or "uploadLimitExceeded" in msg:
            print(f"::warning title=YouTube upload {tag}::daily quota or upload limit hit ({msg[:200]}); "
                  f"kept as a release")
        elif _code(exc) in (401, 403):
            print(f"::warning title=YouTube upload {tag}::refused ({msg[:300]}); login lacks permission, "
                  f"channel not verified or API project blocked")
        else:
            print(f"::warning title=YouTube upload {tag}::{msg[:300]}")
        return None
    except Exception as exc:
        print(f"::warning title=YouTube upload {tag}::{exc!r}")
        return None
    vid = res["id"]
    out = {"video_id": vid, "url": watch_url.format(id=vid)}
    print(f"[yt_upload] uploaded {tag}: {vid}")
    if thumb_fn is not None:
        try:
            thumb_fn(vid, access)
            out["thumbnail"] = True
            print(f"[yt_upload] thumbnail set for {vid}")
        except Exception as exc:  # the video is up; a missing thumbnail must not lose it (thumb_fix can retry later)
            out["thumbnail"] = False
            print(f"::warning title=YouTube thumbnail {tag}::{exc!r}")
    try:
        st = video_status(vid, access)
        out["status"] = st
        print(f"[yt_upload] status: uploadStatus={st.get('uploadStatus')} privacyStatus={st.get('privacyStatus')} "
              f"publishAt={st.get('publishAt')}")
        hint = locked_hint(body["status"], st)
        if hint:
            out["locked"] = hint
            print(f"::warning title=YouTube upload {tag} locked?::{hint}")
    except Exception as exc:
        print(f"::warning title=YouTube status {tag}::{exc!r}")
    return out


def upload_short(video: Path, script: dict, when: dt.datetime | None, thumbnail: bool = True) -> dict | None:
    """Upload a Short, set the cover thumbnail, return {video_id, url, status...}; None (with a ::warning::) on any failure."""
    def thumb(vid: str, access: str) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            img = Path(tmp) / "cover.jpg"
            cover(video, img)
            set_thumb(vid, img, access)
    return _upload(video, video_body(script, when), script.get("id", "?"), "https://youtube.com/shorts/{id}",
                   thumb if thumbnail else None)


def upload_film(video: Path, film: dict, when: dt.datetime | None, thumb_img: Path | None = None) -> dict | None:
    """Upload a long-form 16:9 film (no #shorts, category Film & Animation), optional JPEG thumbnail (1280x720).
    Never raises; None (with a ::warning::) on any failure, the caller keeps the release as the fallback."""
    def thumb(vid: str, access: str) -> None:
        set_thumb(vid, thumb_img, access)
    try:
        body = video_body(film, when, FILM_CATEGORY)
    except Exception as exc:
        print(f"::warning title=YouTube upload film::bad film metadata ({exc!r})")
        return None
    return _upload(video, body, str(film.get("id", "film")), "https://youtu.be/{id}",
                   thumb if thumb_img and Path(thumb_img).exists() else None)


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "--dry":
        from . import publish as P
        script = load_script(argv[1])
        when = P.publish_slots(1)[0]
        print(f"POST {UPLOAD}/videos?uploadType=resumable&part=snippet,status&notifySubscribers=true")
        print(json.dumps(video_body(script, when), indent=2, ensure_ascii=False))
        print(f"then PUT the MP4, then POST {UPLOAD}/thumbnails/set?videoId=<id>&uploadType=media "
              f"(JPEG = frame 0 scaled 1080x1920), then GET {API}/videos?part=status&id=<id>")
        print(f"private test body (no publishAt): {json.dumps(video_body(script, None)['status'])}")
        return 0
    if len(argv) >= 3 and argv[0] == "--test" and argv[2] == "--mp4":
        script = load_script(argv[1])
        from .comment_replies import token
        try:
            if not token():
                print("::notice title=yt-upload-test::YTC_* secrets are not set; nothing uploaded")
                return 0
        except Exception as exc:
            print(f"::warning title=yt-upload-test::login failed ({exc!r}); nothing uploaded")
            return 0
        res = upload_short(Path(argv[3]), script, None)
        print("RESULT", json.dumps(res, ensure_ascii=False))
        return 0
    if len(argv) >= 2 and argv[0] == "--dry-film":
        film = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
        print(json.dumps(video_body(film, dt.datetime.now(dt.timezone.utc), FILM_CATEGORY), indent=2, ensure_ascii=False))
        return 0
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
