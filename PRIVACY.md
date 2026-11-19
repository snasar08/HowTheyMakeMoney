# Privacy Policy — HTMM Uploader

Last updated: November 19, 2026

"HTMM Uploader" is a private script owned and used by one person, the owner of the YouTube channel
**How They Make Money** (@HowTheyMakeMoneyDaily). It runs on the owner's own GitHub Actions account.
It has no other users and no website or app that anyone else can sign in to.

## YouTube API Services
This project uses **YouTube API Services**. By using it you agree to be bound by the
**YouTube Terms of Service**: https://www.youtube.com/t/terms

The **Google Privacy Policy** applies to the data Google handles: https://policies.google.com/privacy

## What it accesses, and why
The owner signs in once with Google OAuth (scope `youtube.force-ssl`, plus read-only YouTube Analytics).
With that sign-in the script only touches the owner's own channel:
- uploads the owner's own videos and sets their title, description and scheduled publish time (`videos.insert`);
- sets each video's thumbnail (`thumbnails.set`);
- reads the owner's own channel and video info and statistics (`channels.list`, `videos.list`, YouTube Analytics reports);
- reads comments on the owner's own videos and posts short replies as the channel (`commentThreads.list`, `comments.insert`).

## What it stores
- The OAuth refresh token is stored only as an encrypted GitHub Actions secret on the owner's account. It is never written to files or logs.
- Per-video statistics of the owner's own channel (views, retention) are saved in this repository's `analytics/` folder.
- Comment text is read only to write a reply during the run; it is not stored.
- It does not collect, store, sell or share any data about viewers or any other Google user.
- No cookies, no tracking, no advertising, no data sent to third parties.

## Deleting data and removing access
- Remove the script's access any time at the Google security settings page:
  https://security.google.com/settings/security/permissions (or https://myaccount.google.com/permissions).
- Stored API data (the `analytics/` files) is refreshed at least every 30 days and is deleted on request,
  or within 7 days after access is removed.
- To ask for deletion or anything else: open an issue at https://github.com/snasar08/HowTheyMakeMoney/issues.
.

## Changes
Changes to this policy are made in this file; the date above shows the last update.
