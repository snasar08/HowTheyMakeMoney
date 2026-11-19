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
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]   # read + reply to comments

if __name__ == "__main__":
    secret_file = sys.argv[1] if len(sys.argv) > 1 else "client_secret.json"
    flow = InstalledAppFlow.from_client_secrets_file(secret_file, SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent", access_type="offline", open_browser=False)
    inner = json.load(open(secret_file))
    inner = inner.get("installed") or inner.get("web")
    print("\nAdd these as GitHub secrets (repo -> Settings -> Secrets and variables -> Actions):")
    print("YTC_CLIENT_ID =", inner["client_id"])
    print("YTC_CLIENT_SECRET =", inner["client_secret"])
    print("YTC_REFRESH_TOKEN =", creds.refresh_token)
