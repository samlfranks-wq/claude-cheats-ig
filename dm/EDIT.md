# DM reply for "Comment EDIT" (CLAUDE EDIT video, Oct 2026: "This video was edited by Claude. Here's how, in seven steps.")
# Send as TWO messages (Instagram DMs cap at about 1,000 characters each). Paste each block below as one message.

## Message 1: the style guide

Hey! Here's the style guide 👇 Save it in your video folder as STYLE_GUIDE.md and change anything to match your style.

---
# Style guide
- Hook in the first second. Open on the most surprising moment, never an intro.
- A cut on every spoken line. No shot longer than 2 seconds.
- Captions: white, bold, 2-3 words at a time, centred in the lower third.
- Music under the voice, never over it. Duck it during speech.
- Total length 25-35 seconds. Cut anything that repeats.
- End on the call to action, then stop. No outro.
- Export 1080x1920, 30fps, loudness -14 LUFS.
---

The skill is in the next message.

## Message 2: the skill

Here's the skill 👇 Save it as .claude/skills/video-edit/SKILL.md inside your video folder, then open Claude Code there.

---
---
name: video-edit
description: Edit the clips in this folder into a short vertical video following STYLE_GUIDE.md
---
1. Read STYLE_GUIDE.md first and follow it exactly.
2. List every clip, photo and audio file here. Check ffmpeg is installed; if not, tell me how to install it.
3. Transcribe the voiceover or main clip, then plan one shot per spoken line. Show me the plan before cutting.
4. Cut and render with ffmpeg to final.mp4. Burn in the captions as the guide says.
5. Tell me the length and anything you couldn't follow.
6. When I ask for a change, re-render only what changed.
---

Then just say: "cut this to 30 seconds using my style guide." Enjoy! And if you want Claude doing whole jobs like this for you, my Chat to Agent course is the link in my bio.

(Reply "Sent! 📩" on each comment too, it boosts the post.)
