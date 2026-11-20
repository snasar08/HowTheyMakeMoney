"""One-time (Sam does this, ~5 min): a login that may REPLY to comments, for pipeline/comment_replies.py (Saturdays).

1. Use the same Google Cloud project + OAuth "Desktop app" client as the upload login (pipeline/youtube_auth.py), or
   make one: console.cloud.google.com -> APIs & Services -> enable "YouTube Data API v3" -> Credentials -> Create
   OAuth client ID -> Desktop app -> download the JSON as client_secret.json next to this repo. (OAuth consent screen
   "In production", so the login does not expire after 7 days; the "unverified app" warning is fine for your channel.)
2. Run:  pip install google-auth-oauthlib   then   python -m pipeline.comment_auth client_secret.json
   Open the printed link in the browser where the CHANNEL's Google account is signed in, pick the channel, allow.
3. Add the three printed values as GitHub secrets (repo -> Settings -> Secrets and variables -> Actions):
   YTC_CLIENT_ID, YTC_CLIENT_SECRET, YTC_REFRESH_TOKEN. Then delete client_secret.json.
"""
import json
import subprocess
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]   # read + reply to comments

if __name__ == "__main__":
    secret_file = sys.argv[1] if len(sys.argv) > 1 else "client_secret.json"
    flow = InstalledAppFlow.from_client_secrets_file(secret_file, SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent", access_type="offline", open_browser=True)
    inner = json.load(open(secret_file))
    inner = inner.get("installed") or inner.get("web")
    # The values go to a text file next to the login file (NOT the screen, NOT the repo), opened in Notepad for Sam.
    out = Path(secret_file).resolve().parent / "YTC_secrets.txt"
    out.write_text("Add these 3 as GitHub secrets (repo -> Settings -> Secrets and variables -> Actions ->\n"
                   "New repository secret). Name on the left, value on the right. Then delete this file.\n\n"
                   f"YTC_CLIENT_ID\n{inner['client_id']}\n\nYTC_CLIENT_SECRET\n{inner['client_secret']}\n\n"
                   f"YTC_REFRESH_TOKEN\n{creds.refresh_token}\n")
    print(f"\nDone. Saved to {out} (opening it in Notepad).")
    if sys.platform == "win32":
        subprocess.Popen(["notepad.exe", str(out)])
