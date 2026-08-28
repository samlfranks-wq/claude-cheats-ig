# @claude.cheats carousel publisher

Publishes carousels straight to Instagram from the Graph API. No Canva, no
browser automation, no manual page-by-page uploading.

This is a **separate account** from `ig-publisher/` (@lostempiresai) — its own
Meta app, its own token, its own `.env`. The two folders never share
credentials, on purpose: a mistake configuring one account can't touch the
other.

Zero npm dependencies. Node 18+ (you have v24).

---

## The full pipeline, end to end

```
motion-carousel/render.mjs        → 6 slide MP4s (spec.json in, video out)
claude-cheats-publisher/catbox-upload.mjs → 6 direct, hot-linkable URLs
claude-cheats-publisher/post-carousel.js  → validates, stages, publishes
```

One command per step:

```bash
node ../motion-carousel/render.mjs ../motion-carousel/spec-c24.json --out ../motion-carousel/dist-c24

node catbox-upload.mjs ../motion-carousel/dist-c24/slide-*.mp4 2>/dev/null | \
  node post-carousel.js --caption-file caption.txt --confirm
```

That second line is the whole publish step: upload each slide, pipe the
`name<TAB>url` lines straight into the poster, which creates all 6 child
containers, waits for Instagram to finish processing them, builds the
carousel, and publishes it.

## Why catbox, not GoFile

`gofile-upload.mjs` (in `motion-carousel/`) makes `gofile.io/d/XXXX` links —
those are HTML **download pages**, meant for a human to tap on a phone, save,
and upload by hand. That's the right tool for posting manually from mobile.

The Graph API is different: Instagram's servers fetch `video_url` /
`image_url` themselves and need the raw file back with a real
`Content-Type: video/mp4`. Point it at a GoFile download page and it fetches
an HTML page instead and rejects the container.

`catbox-upload.mjs` solves that — one anonymous POST to catbox.moe returns a
permanent, directly-fetchable URL (`https://files.catbox.moe/xxxxx.mp4`).
`post-carousel.js` also hard-refuses any `gofile.io/d/` URL it's given, so
this mistake fails loudly before wasting an API call, not silently after.

---

## One-time setup (~15 minutes)

### 1. Confirm the account is Professional

Instagram app → **Settings → Account type and tools → Switch to professional
account** → **Creator** or **Business**. Required — personal accounts can't
publish via API at all.

### 2. Create a Meta developer app for THIS account

[developers.facebook.com/apps](https://developers.facebook.com/apps) →
**Create app** → use case **"Manage messaging and content on Instagram"**.

Log into the Meta flow as **@claude.cheats**, not @lostempiresai — this is
the step where account mix-ups happen. This is *Instagram API with Instagram
Login*, so no Facebook Page is required.

### 3. Generate a long-lived token

App dashboard → **Instagram → API setup with Instagram login**:

1. Add the @claude.cheats account under **Generate access tokens**
2. Permissions needed: `instagram_business_basic`, `instagram_business_content_publish`
3. **Generate token**, authorise, copy it

No App Review needed — you're the admin of your own app, publishing to an
account you have a role on.

### 4. Fill in `.env`

```bash
cp .env.example .env
```

Paste the token into `IG_ACCESS_TOKEN`. Leave `IG_USER_ID` blank — the next
step finds it. Don't paste the token into a chat window; don't commit `.env`.

### 5. Verify

```bash
node check.js
```

Confirms the token works, prints your `IG_USER_ID`, and warns you explicitly
if the token turns out to belong to the wrong account. Put the printed ID
into `.env`, then re-run to confirm it's clean.

---

## Publishing

```bash
# dry run — validates and stages every slide, stops before publish
node catbox-upload.mjs slide-01.mp4 slide-02.mp4 ... | node post-carousel.js --caption "..."

# the same run, actually published
node catbox-upload.mjs slide-01.mp4 slide-02.mp4 ... | node post-carousel.js --caption "..." --confirm
```

Or skip the pipe and pass URLs directly if you already hosted them elsewhere:

```bash
node post-carousel.js --urls "https://files.catbox.moe/a.mp4,https://files.catbox.moe/b.mp4" \
  --caption-file caption.txt --confirm
```

Notes:
- **2–10 items** — Instagram's hard limit on both ends.
- The **first slide sets the carousel's aspect ratio** for the rest — keep
  `slide-01` first in the file list / URL order.
- Hashtags are auto-lowercased to match house style; caption is capped at
  2200 chars / 30 tags, same as `ig-publisher/post.js`.
- Without `--confirm`, every child container is created and validated but the
  final `media_publish` call never fires — the carousel container sits ready
  for 24 hours if you want to confirm separately.
- Meta allows **25 API-published posts per rolling 24h** per account —
  `check.js` reports current usage.
