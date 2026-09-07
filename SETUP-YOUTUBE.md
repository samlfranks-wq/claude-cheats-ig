# YouTube for @claude.cheats — the five manual steps

The code is done. One queue entry now fans out to Instagram, Facebook and YouTube
Shorts. What is left needs a browser and your Google account, so it has to be you.

Nothing uploads until these steps are finished: the runner prints
`YT: no YouTube credentials here - skipped` and carries on posting to Instagram
as normal, so the queue is never blocked by this.

---

## 1. Create the channel

youtube.com, signed in as the Google account that should own it →
Settings → Channel → **Create a new channel**.

Make it a **Brand Account** channel, not the personal one tied to your name. A
Brand Account can be handed to another Google account later; a personal channel
cannot. Name it **Claude Cheats** and set the handle to `@claudecheats` if it is
free (the Instagram dot does not exist in YouTube handles).

Do NOT reuse the Lost Empires channel.

## 2. Get an OAuth client

console.cloud.google.com → pick a project (the Lost Empires one is fine, or make
a new one) → **APIs & Services**:

1. **Library** → enable **YouTube Data API v3**.
2. **OAuth consent screen** → set publishing status to **In production**.
   Leaving it in "Testing" expires the refresh token after 7 days and the
   uploads silently stop.
3. **Credentials** → Create credentials → **OAuth client ID** → type
   **Desktop app**. Any name.

Copy the client ID and secret.

## 3. Put them in .env

Open `claude-cheats-publisher/.env` and fill in:

    YT_CLIENT_ID=...
    YT_CLIENT_SECRET=...
    YT_CATEGORY_ID=28
    YT_PRIVACY=public
    YT_UPLOAD=1

Never paste these into a chat window.

## 4. Authorise, and pick the right channel

```bash
node yt-auth.js
```

A browser opens. **When Google asks which channel to authorise, choose Claude
Cheats** — not Lost Empires, not your personal channel. Choosing wrong uploads
this account's Shorts to the wrong place.

Then confirm what the token actually owns:

```bash
node post-youtube.js --check
```

It prints the channel name, id and subscriber count. Copy the id into
`YT_CHANNEL_ID=` in `.env`. From then on a wrong-channel token is refused
instead of uploading to the wrong place.

## 5. Add the same values as GitHub secrets

The GitHub Actions runner does the scheduled posting and has no `.env`.

Repo → Settings → Secrets and variables → Actions → **Secrets**:

| Secret | Value |
|---|---|
| `YT_CLIENT_ID` | from step 2 |
| `YT_CLIENT_SECRET` | from step 2 |
| `YT_REFRESH_TOKEN` | from `.env` after step 4 |
| `YT_CHANNEL_ID` | from step 4 |

While you are there, check `FB_PAGE_ID` and `FB_PAGE_TOKEN` are present too —
the Facebook cross-post needs them in the runner, not just locally.

---

## What happens then

- Every queued Reel publishes to Instagram at 17:00Z, then goes straight to the
  Facebook Page and up to YouTube as a Short.
- The back catalogue backfills at one video per 15-minute run, so the channel
  fills out over a couple of hours instead of arriving empty.
- Each entry records `yt` on success, or `ytError` and a retry count on failure,
  and gives up after three attempts with `ytSkip`.
- `ytTitle` on a queue entry is the YouTube headline. Every current entry has
  one. Without it the uploader derives a title from the caption and warns.

## Turning it off

Set the repo variable `YT_UPLOAD=0` (or the same in `.env` locally).

## The known gotcha

An unverified Google Cloud project force-locks every upload to **private**,
whatever `YT_PRIVACY` says. If that happens the upload still worked — flip the
videos to public in YouTube Studio, and complete the API compliance audit when
you can be bothered, which removes the lock permanently.
