// Scheduled posting. Reads queue.json, finds the first entry whose `at` time
// has passed and which hasn't posted yet, publishes it, and records the result
// back into queue.json.
//
//   node queue.js            ← dry run: shows what is due, publishes nothing
//   node queue.js --confirm  ← publishes the one due item
//
// Run it on a schedule (Windows Task Scheduler, hourly) to post unattended.
// It publishes at most ONE item per run, so a misconfigured queue can never
// dump your whole backlog onto the account at once.
//
// queue.json format. `at` is UTC — in British Summer Time that is one hour
// BEHIND the clock, so 18:00Z fires at 19:00 local.
// [
//   {
//     "at": "2026-07-31T18:00:00Z",
//     "url": "https://.../video.mp4",
//     "cover": "https://.../thumb.jpg",     // optional poster frame
//     "trial": "manual",                     // optional: manual | performance
//     "caption": "..."
//   }
// ]

import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {fail} from './lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUEUE = join(HERE, 'queue.json');

if (!existsSync(QUEUE)) fail(`No queue.json at ${QUEUE}. See the format in this file's header.`);

const items = JSON.parse(readFileSync(QUEUE, 'utf8'));
const now = new Date();
const confirm = process.argv.includes('--confirm');
const save = () => writeFileSync(QUEUE, JSON.stringify(items, null, 2) + '\n');

// --- Facebook cross-post (API route, OPT-IN) ---------------------------------
// Primary route is Instagram's own "Automatically share to Facebook" toggle
// (Sam, 2026-09-07: "you can crosspost from insta") — one post, both surfaces.
// This API route is the fallback if that toggle does not cover API-published
// Reels. It only runs when FB_CROSSPOST=1 is set (repo variable/secret or .env);
// with the toggle on AND this on, every Reel would land on the Page TWICE.
// When enabled: runs right after the IG publish, plus a backfill pass at the
// top of every run for anything that missed. Items carry:
//   fb: ISO time      -> cross-posted
//   fbSkip: true      -> never cross-post (the pre-Sept-7 backlog)
//   fbAttempts/fbError-> retried up to 3 times, then given up with fbSkip
const fbEnabled = () => {
  if (process.env.FB_CROSSPOST) return process.env.FB_CROSSPOST === '1';
  if (!existsSync(join(HERE, '.env'))) return false;
  return /^FB_CROSSPOST=1/m.test(readFileSync(join(HERE, '.env'), 'utf8'));
};
const fbCreds = () => {
  if (process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN) return true;
  if (!existsSync(join(HERE, '.env'))) return false;
  const env = readFileSync(join(HERE, '.env'), 'utf8');
  return /^FB_PAGE_ID=\S+/m.test(env) && /^FB_PAGE_TOKEN=\S+/m.test(env);
};
function crossPostFB(it) {
  if (!fbEnabled()) return 'off';
  if (!fbCreds()) { console.log('  FB: no FB_PAGE_ID/FB_PAGE_TOKEN here — skipped (backfill will retry).'); return 'skipped'; }
  const args = ['post-facebook.js', '--url', it.url, '--caption', it.caption ?? '', '--reel'];
  if (confirm) args.push('--confirm');
  const r = spawnSync(process.execPath, args, {cwd: HERE, stdio: 'inherit'});
  if (!confirm) return 'dry';
  if (r.status === 0) { it.fb = new Date().toISOString(); delete it.fbError; return 'ok'; }
  it.fbAttempts = (it.fbAttempts || 0) + 1; it.fbError = `exit ${r.status} at ${new Date().toISOString()}`;
  if (it.fbAttempts >= 3) { it.fbSkip = true; console.error('  FB: given up after 3 attempts — marked fbSkip.'); }
  return 'fail';
}
// backfill: at most ONE missed cross-post per run
const missed = fbEnabled() ? items.find((it) => it.posted && !it.fb && !it.fbSkip) : null;
if (missed) {
  console.log(`FB backfill due: ${missed.at}\n  ${missed.url}`);
  const r = crossPostFB(missed);
  if (r === 'ok' || r === 'fail') save();
}

const dueIndex = items.findIndex((it) => !it.posted && new Date(it.at) <= now);

if (dueIndex === -1) {
  const next = items.filter((it) => !it.posted).sort((a, b) => new Date(a.at) - new Date(b.at))[0];
  console.log(next ? `Nothing due. Next: ${next.at} — ${next.url}` : 'Queue empty.');
  process.exit(0);
}

// One post per day — hard rule for this account. Burst posting on 27 Aug 2026
// cost 30x reach (posts 3 and 4 got 4 and 6 views against 179 for post 2).
// Without this, a missed day would drain the backlog at one per HOUR, because
// the runner fires hourly and only ever checks "is this item due yet".
const today = new Date().toISOString().slice(0, 10);
const alreadyToday = items.find((it) => it.posted && it.posted.slice(0, 10) === today);
if (alreadyToday) {
  console.log(`Already posted today (${alreadyToday.at}). One per day — stopping.`);
  process.exit(0);
}

const item = items[dueIndex];
console.log(`Due: ${item.at}\n  ${item.url}`);

const args = ['post-reel.js', '--url', item.url, '--caption', item.caption ?? ''];
if (item.cover) args.push('--cover', item.cover);
if (item.trial) args.push('--trial', item.trial);
if (confirm) args.push('--confirm');
const res = spawnSync(process.execPath, args, {cwd: HERE, stdio: 'inherit'});

if (!confirm) process.exit(0);

if (res.status === 0) {
  items[dueIndex] = {...item, posted: new Date().toISOString()};
  writeFileSync(QUEUE, JSON.stringify(items, null, 2) + '\n');
  console.log('✔ Marked as posted in queue.json');
} else {
  console.error('✖ Publish failed — leaving the item in the queue to retry next run.');
  process.exit(1);
}
