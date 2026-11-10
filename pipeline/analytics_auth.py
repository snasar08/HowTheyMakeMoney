"""One-time: let the stats job read audience retention (where viewers swipe away).

Retention is only in the YouTube Analytics API, which needs the channel owner's Google sign-in
(the read-only YT_API_KEY can't see it). Free; read-only; nothing is uploaded or changed.

1. Google Cloud Console (the project that already holds YT_API_KEY): enable "YouTube Analytics API".
2. Google Auth Platform: External; add the channel's Google account as a test user, then
   "Publish app" (In production) so the token doesn't expire after 7 days.
3. Clients -> Create client -> Desktop app -> download the JSON next to this repo as client_secret.json
   (git ignores client_secret*.json).
4. Run:  python -m pipeline.analytics_auth client_secret.json
   A browser opens: pick the channel's account and allow "View YouTube Analytics reports".
5. Save the three printed values as GitHub repo secrets (Settings -> Secrets and variables -> Actions):
   YTA_CLIENT_ID, YTA_CLIENT_SECRET, YTA_REFRESH_TOKEN
"""
import json
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/yt-analytics.readonly",
          "https://www.googleapis.com/auth/youtube.readonly"]

if __name__ == "__main__":
    secret_file = sys.argv[1] if len(sys.argv) > 1 else "client_secret.json"
    flow = InstalledAppFlow.from_client_secrets_file(secret_file, SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")
    inner = json.load(open(secret_file))
    inner = inner.get("installed") or inner.get("web")
    print("\nAdd these as GitHub secrets (Settings -> Secrets and variables -> Actions):")
    print("YTA_CLIENT_ID =", inner["client_id"])
    print("YTA_CLIENT_SECRET =", inner["client_secret"])
    print("YTA_REFRESH_TOKEN =", creds.refresh_token)
