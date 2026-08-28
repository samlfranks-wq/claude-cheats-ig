#!/usr/bin/env bash
# Push the Instagram backlog to the Claude Cheats Facebook Page.
#
#   bash backfill-facebook.sh            # dry run, publishes nothing
#   bash backfill-facebook.sh --confirm  # actually posts
#
# ONE POST PER DECK, NOT TWO.
# Each deck went out on Instagram twice — once as a carousel, once as a Reel —
# because those are different surfaces there and IG ranks them separately.
# Facebook has no carousel equivalent, so posting both versions would just be
# the same video on the same Page twice. Each deck therefore posts once here,
# as a Facebook Reel (9:16), which is the shape the Page's video surface
# actually favours.
set -euo pipefail
cd "$(dirname "$0")"

CONFIRM="${1:-}"

post () {
  local label="$1" url="$2" caption="$3"
  echo ""
  echo "=============================================="
  echo " $label"
  echo "=============================================="
  node post-facebook.js --url "$url" --caption-file "$caption" --reel $CONFIRM
}

post "Stop prompting. Start installing." \
     "https://files.catbox.moe/mqmgwm.mp4" \
     "caption-sleek-01.txt"

post "10 skills you wish you knew 6 months ago" \
     "https://files.catbox.moe/zedvlp.mp4" \
     "caption-sleek-02.txt"

echo ""
if [ "$CONFIRM" != "--confirm" ]; then
  echo "DRY RUN — nothing published. Re-run with --confirm."
else
  echo "Backlog pushed to the Page."
fi
