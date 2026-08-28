# Deploying the Claude Cheats queue to GitHub Actions

Third in the set, alongside `lost-empires-yt` (:17) and `lost-empires-ig` (:42).
This one runs at **:58**, so the three never contend for runners.

## The queue is EMPTY — that is deliberate

Unlike the Lost Empires repos, there was no backlog to load. @claude.cheats has
been posted by hand, several times a day, and everything rendered has already
gone out. **An automated publisher with an empty queue posts nothing.**

Add entries to `queue.json` before you travel, or this repo sits idle:

```json
[
  {
    "at": "2026-08-30T18:00:00",
    "note": "what this is",
    "url": "https://<public-url>/reel.mp4",
    "cover": "https://<public-url>/cover.jpg",
    "trial": "manual",
    "caption": "First line is the hook.\n\nBody.\n\n#lowercase #hashtags #only"
  }
]
```

`url` **must be a public https URL** — GitHub Actions cannot see your disk. A
local path works when you run `node queue.js --confirm` on the laptop and will
fail in CI.

Hashtags are lowercased automatically by `post-reel.js`, but write them lowercase
anyway.

## Setup

### 1. Push

    git init && git add . && git commit -m "claude-cheats-publisher + workflow"
    git remote add origin git@github.com:samlfranks-wq/claude-cheats-ig.git
    git branch -M main && git push -u origin main

**Private** — the queue holds captions and schedule.

### 2. Secrets

Settings → Secrets and variables → Actions. One name, one bare value each.

| Secret | Value |
|---|---|
| `IG_USER_ID` | `17841426406142421` |
| `IG_ACCESS_TOKEN` | from local `.env` |
| `AUTH_MODE` | `instagram` |
| `GRAPH_VERSION` | `v23.0` |
| `FB_PAGE_ID` | only if cross-posting to Facebook |
| `FB_PAGE_TOKEN` | only if cross-posting to Facebook |

### 3. Test

Actions → *Publish one Cheat* → **Run workflow**. With an empty queue it prints
"Queue empty." — that still proves the secrets and token work.

## Cadence warning

This account has been posting 2-5 times a day. The measured guidance is **one a
day**: bursts are how repetitive-content penalties get earned. If you queue a
backlog, space entries a day apart.

## Token expiry

`IG_ACCESS_TOKEN` is a 60-day long-lived token with no auto-refresh. If it lapses
mid-trip, publishing stops silently. `node check.js` reports its health.
