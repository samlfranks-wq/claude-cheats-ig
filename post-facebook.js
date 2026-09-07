// Publish a video to the linked Claude Cheats FACEBOOK PAGE.
//
//   node post-facebook.js --check
//   node post-facebook.js --url "https://.../video.mp4" --caption-file caption.txt [--reel] [--confirm]
//
// WHY THIS IS A SEPARATE SCRIPT FROM post-reel.js
// ------------------------------------------------
// The Instagram publisher authenticates with Instagram Login: an IGAA... token
// issued by graph.instagram.com. That token can ONLY see the Instagram account
// — graph.facebook.com rejects it with "Cannot parse access token" (code 190).
// Posting to a Page needs a genuinely different credential: a PAGE access token
// carrying pages_manage_posts and pages_read_engagement. So this reads its own
// env vars and never touches the IG ones.
//
// WHAT DOES AND DOESN'T PORT OVER
// -------------------------------
// Facebook has no equivalent of an Instagram multi-video carousel, so what gets
// posted here is the concatenated full-sequence video — the same slides, played
// through. Two shapes are supported:
//   --reel   → a Facebook Reel   (9:16, uses the chunked video_reels flow)
//   default  → a normal Page video post (any aspect, single call)

import {readFileSync} from 'node:fs';
import {loadEnv} from './lib.js';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : argv[i + 1]; };
const confirm = argv.includes('--confirm');
const asReel = argv.includes('--reel');

const fail = (m) => { console.error(`
✖ ${m}
`); process.exit(1); };

// --- env ----------------------------------------------------------------
// loadEnv reads .env locally and falls back to process.env in GitHub Actions,
// so the same script cross-posts from the runner using repo secrets.
const env = loadEnv(['FB_PAGE_ID', 'FB_PAGE_TOKEN']);
const PAGE_ID = env.FB_PAGE_ID;
const PAGE_TOKEN = env.FB_PAGE_TOKEN;
const V = env.GRAPH_VERSION || 'v23.0';

if (!PAGE_ID || !PAGE_TOKEN) {
  fail(
    'Missing FB_PAGE_ID and/or FB_PAGE_TOKEN in .env.\n' +
    '  These are NOT the Instagram credentials — a Page token comes from the\n' +
    '  *Page Access Token* section of Graph API Explorer, not "Get User Access Token".\n' +
    '  Run:  node post-facebook.js --check   after adding them.'
  );
}

async function fb(path, {method = 'GET', params = {}} = {}) {
  const u = new URL(`https://graph.facebook.com/${V}/${path}`);
  const body = new URLSearchParams({...params, access_token: PAGE_TOKEN});
  const res = method === 'GET' ? await fetch(`${u}?${body}`) : await fetch(u, {method, body});
  const j = await res.json();
  if (j.error) fail(`Graph API: ${j.error.message} (code ${j.error.code})`);
  return j;
}

// --- identity guard -----------------------------------------------------
// The OAuth flow ALWAYS hands back a personal User token first; the Page token
// is a second, separate thing you swap to. Publish with the User token by
// mistake and the post lands on a personal timeline instead of the business
// Page — and on Facebook that is public the instant it happens.
//
// So this refuses to publish unless it can prove three things:
//   1. the token's own type is PAGE, not USER
//   2. /me resolves to the SAME id as FB_PAGE_ID — a User token's /me is the
//      personal profile, so this alone catches the common mistake
//   3. the target carries a Page 'category' — personal profiles have none
// Any doubt and it aborts rather than guessing.
async function assertBusinessPage() {
  let type = null;
  try {
    const dbg = await fb('debug_token', {params: {input_token: PAGE_TOKEN}});
    type = dbg?.data?.type || null;
  } catch { /* debug_token can be restricted; the checks below still stand */ }

  const me = await fb('me', {params: {fields: 'id,name,category'}});

  const problems = [];
  if (type && type !== 'PAGE') problems.push(`token type is ${type}, expected PAGE`);
  if (me.id !== PAGE_ID) problems.push(`token identifies as "${me.name}" (${me.id}), not FB_PAGE_ID ${PAGE_ID}`);
  if (!me.category) problems.push(`"${me.name}" has no Page category — this looks like a personal profile`);

  if (problems.length) {
    fail(
      'REFUSING TO PUBLISH — this is not a business Page token.\n' +
      problems.map((p) => `  • ${p}`).join('\n') +
      '\n\n  In Graph API Explorer, open the "User or Page" dropdown and pick the\n' +
      '  page under the *Page Access Token* heading — NOT "Get User Access Token".\n' +
      '  Posting with a User token would publish to a personal timeline.'
    );
  }
  return me;
}

// --- --check -------------------------------------------------------------
if (argv.includes('--check')) {
  const me = await assertBusinessPage();
  console.log(`\n✔ Verified BUSINESS PAGE: ${me.name} (${me.id})`);
  console.log(`  Category: ${me.category}`);
  const extra = await fb(PAGE_ID, {params: {fields: 'fan_count,link'}}).catch(() => ({}));
  console.log(`  Followers: ${extra.fan_count ?? 'n/a'}`);
  console.log(`  URL: ${extra.link ?? 'n/a'}\n`);
  process.exit(0);
}

const url = arg('url');
const captionFile = arg('caption-file');
const caption = captionFile ? readFileSync(captionFile, 'utf8').trim() : (arg('caption') || '');

if (!url) fail('Missing --url (a public https URL Facebook can fetch).');
if (!/^https:\/\//.test(url)) fail('--url must be a public https URL.');
if (/gofile\.io\/d\//.test(url)) fail('gofile.io/d/ links are HTML pages, not files. Use catbox-upload.mjs.');

const target = await assertBusinessPage();

console.log(`\nTarget : BUSINESS PAGE "${target.name}" — ${target.category} (${target.id})`);
console.log(`Shape  : ${asReel ? 'Reel (video_reels)' : 'Page video post'}`);
console.log(`Video  : ${url}`);
console.log(`Caption: ${caption.split('\n')[0].slice(0, 60)}…`);

if (!confirm) {
  console.log('\nDRY RUN — nothing was published. Re-run with --confirm.\n');
  process.exit(0);
}

if (asReel) {
  const start = await fb(`${PAGE_ID}/video_reels`, {method: 'POST', params: {upload_phase: 'start'}});
  console.log(`  video id: ${start.video_id}`);

  const up = await fetch(`https://rupload.facebook.com/video-upload/${V}/${start.video_id}`, {
    method: 'POST',
    headers: {Authorization: `OAuth ${PAGE_TOKEN}`, file_url: url},
  });
  const upJson = await up.json();
  if (upJson.error) fail(`Upload phase: ${upJson.error.message}`);
  console.log('  uploaded from source URL');

  const fin = await fb(`${PAGE_ID}/video_reels`, {
    method: 'POST',
    params: {upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: caption},
  });
  console.log(`\n✔ PUBLISHED as Facebook Reel — ${fin.post_id || start.video_id}\n`);
} else {
  const r = await fb(`${PAGE_ID}/videos`, {method: 'POST', params: {file_url: url, description: caption}});
  console.log(`\n✔ PUBLISHED as Page video — ${r.id}\n`);
}
