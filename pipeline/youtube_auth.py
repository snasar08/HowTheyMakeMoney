"""One-time: get a YouTube refresh token for direct uploads (UPLOAD_MODE=youtube).

1. Google Cloud Console: create a project, enable "YouTube Data API v3".
2. OAuth consent screen: External, add your channel's Google account as a test
   user, then click "Publish app" (In production) so the token doesn't expire
   after 7 days. Google will show an "unverified app" warning — that's fine for
   your own channel.
3. Credentials → Create OAuth client ID → Desktop app → download JSON as
   client_secret.json next to this repo.
4. Run:  python -m pipeline.youtube_auth client_secret.json
5. Save the printed values as GitHub repo secrets:
   YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN

Uploads from an unaudited project are locked to private by YouTube. Apply for
the audit (YouTube API Services audit and quota extension form) before
switching the repo variable UPLOAD_MODE to "youtube".
"""
import json
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

if __name__ == "__main__":
    secret_file = sys.argv[1] if len(sys.argv) > 1 else "client_secret.json"
    flow = InstalledAppFlow.from_client_secrets_file(secret_file, SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")
    cfg = json.load(open(secret_file))
    inner = cfg.get("installed") or cfg.get("web")
    print("\nAdd these as GitHub secrets (Settings → Secrets and variables → Actions):")
    print("YT_CLIENT_ID =", inner["client_id"])
    print("YT_CLIENT_SECRET =", inner["client_secret"])
    print("YT_REFRESH_TOKEN =", creds.refresh_token)
