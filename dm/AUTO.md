# DM reply for "Comment AUTO" (post 2026-10-01, "Your page is dead because you post twice a month...")
# Written 2026-10-14 when the first AUTO commenter (@warszawski_obserwator) arrived. Paste the block below as the DM.

Hey! Here's the prompt 👇

Paste it into Claude Code in an empty folder. It builds the system with you step by step and asks for your API keys when it needs them.

---
I want a daily short-video pipeline for my Instagram, Facebook and YouTube page about [YOUR TOPIC]. Build it in this folder and keep everything as plain files I can read.

1. Ideas: keep a list in ideas.md. Each run, pick one. Every hook names one concrete pain in its first line.
2. Script: 35-45 seconds, about 120 words, one idea, ends with "follow for more". Save it to videos/<name>/script.txt.
3. Voice: generate the voiceover in one continuous take (Higgsfield or ElevenLabs, voice: [NAME]), then transcribe it with word timestamps.
4. Animation: write code that draws every scene and syncs it to the word timings. Same characters and colours every time so the page looks like a series.
5. Captions and cover: burn in word-by-word captions. Make a cover with the hook in 5 words or fewer and put it on the first frame.
6. Queue: add the finished video to queue.json with its caption, lowercase hashtags and a 6pm post time, marked approved: false. Never publish anything yourself.
7. Publishing: write a script that posts the next item I've marked approved: true to Instagram, Facebook and YouTube through their APIs, and a scheduled job that runs it every day at 6pm.

Show me the first video before you build the publisher. Never hardcode my API keys.
---

Shout if you get stuck!
