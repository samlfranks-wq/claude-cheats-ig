# YouTube for @claude.cheats — what is left

Checked in Chrome on 2026-09-07. Most of the setup turned out to be unnecessary:

- **Google Cloud: nothing to do.** The `lore-drop-publisher` project already has a
  Desktop OAuth client and its consent screen is **In production**, so refresh
  tokens do not expire. One OAuth app can authorise many channels — the refresh
  token is what binds it to one — so the Claude Cheats channel reuses it.
- **`.env`: done.** `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_CATEGORY_ID=28`,
  `YT_PRIVACY=public`, `YT_UPLOAD=1` are all filled in. The two credentials were
  copied file-to-file from `yt-publisher/.env`; they never passed through a chat.

Three things remain, and the first is the blocker.

---

## 1. Verify the Google account  (you — a few hours)

YouTube will not create a new channel on this account until it is verified.
The dialog is open in YouTube Studio; it offers three routes:

| Route | Time |
|---|---|
| Six-second video of yourself | fastest, minutes to a few hours for approval |
| Photo of your ID | slower |
| Build history as you grow | about two months of active use |

Take the six-second video. Approval usually lands within a few hours.

This is identity verification, so it is yours to do — Claude does not handle ID
or biometric data.

## 2. Create the channel  (you — one minute, after step 1 clears)

youtube.com → Settings → Channel → **Create a channel**.

Make it a **Brand Account**, name it **Claude Cheats**, handle `@claudecheats`
if free. Do not reuse Lost Empires or VisualAlchemy.

## 3. Authorise and finish  (Claude, one command)

```bash
node yt-auth.js
```

A browser opens. **Pick the Claude Cheats channel** when Google asks which one to
authorise, then Allow. The refresh token writes itself into `.env`.

Then:

```bash
node post-youtube.js --check
```

It prints the channel name and id. Put the id in `YT_CHANNEL_ID=` in `.env` so a
wrong-channel token is refused rather than uploading to Lost Empires.

## 4. Four GitHub secrets  (you — pasting)

The scheduled runner has no `.env`. Repo → Settings → Secrets and variables →
Actions → Secrets:

`YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `YT_CHANNEL_ID` — all
four copied from `.env`. Claude does not type credentials into forms, so this
part is yours.

While there, confirm `FB_PAGE_ID` and `FB_PAGE_TOKEN` exist too — the Facebook
cross-post needs them in the runner, not just locally.

---

## What happens once it is live

Every queued Reel publishes to Instagram at 17:00Z, then goes straight to the
Facebook Page and up to YouTube as a Short. The back catalogue backfills at one
video per fifteen-minute run, so the channel fills out over roughly two hours
instead of launching empty. Each entry records `yt` on success, or `ytError`
with a retry count, giving up after three attempts with `ytSkip`.

Until step 3 is done the runner logs `YT: no YouTube credentials here` and
Instagram is completely unaffected.

## The known gotcha

An unverified Cloud project force-locks uploads to **private** whatever
`YT_PRIVACY` says. `lore-drop-publisher` has been uploading Lost Empires Shorts
publicly for weeks, so this is unlikely to bite — but if the first Short lands
private, that is the cause, and flipping it in YouTube Studio is the fix.
