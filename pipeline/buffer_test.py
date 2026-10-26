"""End-to-end Buffer check, run on GitHub's machines by .github/workflows/ci-test.yml.

Schedules ONE test post on the connected YouTube channel ~1 hour out (privacy private when
Buffer supports it), confirms through the API that it is queued, then deletes it and confirms
it is gone — so nothing goes live. Writes out/buffer-test.json (no secrets).
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

from . import publish as P

ENUMS = ["YoutubePrivacy", "ShareMode", "SchedulingType", "PostStatus", "Service"]


def main(video_url: str, out: Path) -> int:
    rep: dict = {"video_url": video_url, "steps": []}

    def step(name, ok, **info):
        rep["steps"].append({"step": name, "ok": ok, **info})
        print(f"[buffer-test] {'OK ' if ok else 'BAD'} {name} {info}")

    try:
        q = " ".join(f'{e}: __type(name: "{e}") {{ enumValues {{ name }} }}' for e in ENUMS)
        types = P.buffer_gql("query { " + q + " }")
        rep["enums"] = {e: [v["name"] for v in (types.get(e) or {}).get("enumValues") or []] for e in ENUMS}
        step("introspect enums", True, **rep["enums"])
    except Exception as exc:
        rep["enums"] = {}
        step("introspect enums", False, error=str(exc)[:300])

    try:
        org, chan = P.buffer_channel()
        step("find YouTube channel", True, channel=chan, name=P._channel_cache.get("name"))
    except Exception as exc:
        step("find YouTube channel", False, error=str(exc)[:300])
        return finish(rep, out)

    step("video URL public", P.public_ok(video_url), url=video_url)

    privacy = "private" if "private" in rep.get("enums", {}).get("YoutubePrivacy", []) else None
    when = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)).replace(second=0, microsecond=0)
    script = {"id": "test", "title": "TEST - will be deleted", "description": "Automated test post. Deleted "
              "before it publishes.", "tags": []}
    post_id = None
    try:
        post = P.buffer_schedule(video_url, script, when, privacy=privacy)
        post_id = post["id"]
        step("schedule test post", True, post=post_id, dueAt=post.get("dueAt"), privacy=privacy)
        got = P.buffer_post(post_id)
        step("confirm queued", str(got.get("status")).lower() in ("scheduled", "pending", "buffer"),
             status=got.get("status"), dueAt=got.get("dueAt"))
    except Exception as exc:
        step("schedule test post", False, error=str(exc)[:500])
    if post_id:
        try:
            P.buffer_delete(post_id)
            step("delete test post", True, post=post_id)
        except Exception as exc:
            step("delete test post", False, post=post_id, error=str(exc)[:300])
        try:
            gone = P.buffer_post(post_id)
            step("confirm deleted", gone is None or str(gone.get("status")).lower() == "deleted", status=gone)
        except Exception as exc:  # NOT_FOUND is what we want
            step("confirm deleted", "not" in str(exc).lower() and "found" in str(exc).lower(),
                 detail=str(exc)[:200])
    return finish(rep, out)


def finish(rep: dict, out: Path) -> int:
    rep["ok"] = all(s["ok"] for s in rep["steps"])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rep, indent=2))
    return 0  # report, don't fail the job: results are read from the file


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], Path(sys.argv[2])))
