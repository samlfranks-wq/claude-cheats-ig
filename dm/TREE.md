# DM reply for "Comment TREE" (Command Tree video, posted 21 Oct 2026: "Nine Claude sessions running. Which one is stuck?").
# Written 21 Oct AFTER the post went out (it was an old queue item with a Comment TREE CTA and no DM file).
# Send as TWO messages. Nothing private: no keys, no worker URL, no artifact link.

## Message 1: how it's built

Hey! Here's how the command tree works 👇

1. A small Node script on my computer reads Claude Code's own session logs (in ~/.claude/projects). If a session's last reply finished, it's idle. If it's still mid-task, it's working.
2. Once a minute, and only when something changes, it pushes a tiny status list (name, working or idle, last action) to a free Cloudflare Worker. That's what makes it work on my phone.
3. One web page reads that list and draws every session as a hexagon, grouped by job. Gold means working, grey means idle, hover for the last action.

The lesson that cost me: refresh on demand. I left it checking every 3 minutes and it burned tokens all night.

The prompt to build your own is in the next message.

## Message 2: the build prompt

Paste this into Claude Code:

---
Build me a dashboard of my Claude Code sessions.
1. Write a Node script that reads ~/.claude/projects/*/*.jsonl. For each session active in the last 7 days, get: a short title (from the first message), the project folder, the last activity time, and the status (working if the last reply hasn't finished, otherwise idle). Save it to status.json, at most once a minute and only when something changes.
2. Build one HTML page that reads status.json and draws each session as a hexagon, grouped by keywords I'll give you. Gold if working, grey if idle, last action on hover.
3. Keep it read-only. Never loop or poll faster than once a minute.
---

Want it on your phone? Ask Claude to add step 4: push status.json to a free Cloudflare Worker. And if you want Claude running whole jobs like this, my 1:1 Chat to Agent coaching is the link in my bio.
