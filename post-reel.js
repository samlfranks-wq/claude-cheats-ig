// Publish a single vertical Reel to @claude.cheats from a public video URL.
//
//   node post-reel.js --url "https://.../reel.mp4" --caption-file caption.txt [--cover "https://.../cover.jpg"] [--confirm]
//
// Without --confirm it creates and validates the container, then stops — so you
// can confirm Instagram accepted the video before anything goes public.
//
// Why a separate script from post-carousel.js: a Reel is media_type=REELS with
// a single video_url, not a parent container wrapping children. It also takes
// cover_url, which carousels don't — without it Instagram picks its own poster
// frame, which on our renders lands wherever the cut happens to be.

import { loadEnv, graph, sleep, fail } from './lib.js';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};

const url = arg('url');
const cover = arg('cover');
const captionFile = arg('caption-file');
const confirm = argv.includes('--confirm');
const shareToFeed = !argv.includes('--no-feed');

// --trial [manual|performance] publishes a Trial Reel: shown only to
// non-followers, so it tests a format without spending a feed slot.
//   manual      = stays a trial until it is graduated in the Instagram app
//   performance = Instagram auto-graduates it if it performs
const trialIdx = argv.indexOf('--trial');
const trial = trialIdx === -1 ? null : (argv[trialIdx + 1] || 'manual').toLowerCase();
if (trial && !['manual', 'performance'].includes(trial)) {
  fail(`--trial must be "manual" or "performance", got "${trial}"`);
}
const STRATEGY = trial === 'performance' ? 'SS_PERFORMANCE' : 'MANUAL';

if (!url) fail('Missing --url. Usage: node post-reel.js --url <video-url> --caption-file <file> [--confirm]');
if (!/^https:\/\//.test(url)) fail('--url must be a public https URL Instagram can fetch.');
if (cover && !/^https:\/\//.test(cover)) fail('--cover must be a public https URL.');
if (/gofile\.io\/d\//.test(url)) {
  fail('That is a GoFile download PAGE, not a direct file link — Instagram fetches server-side\n' +
       '   and will get HTML back. Host with catbox-upload.mjs instead.');
}

const rawCaption = captionFile ? readFileSync(captionFile, 'utf8') : arg('caption') ?? '';
// House style: hashtags always lowercase.
const caption = rawCaption.replace(/#[\w]+/g, (t) => t.toLowerCase());
if (caption !== rawCaption) console.log('· lowercased hashtags to match house style');
if (caption.length > 2200) fail(`Caption is ${caption.length} chars; Instagram allows 2200.`);
const tagCount = (caption.match(/#\w+/g) || []).length;
if (tagCount > 30) fail(`${tagCount} hashtags; Instagram allows 30.`);

const env = loadEnv();

console.log(`\nCreating ${trial ? 'TRIAL ' : ''}Reel container…\n  video: ${url}`);
if (cover) console.log(`  cover: ${cover}`);
if (trial) console.log(`  trial: graduation = ${STRATEGY}`);

const baseParams = {
  media_type: 'REELS',
  video_url: url,
  caption,
  share_to_feed: String(shareToFeed),
  ...(cover ? { cover_url: cover } : {}),
};

// snake_case is what the API actually accepts (verified 2026-07-30 — camelCase
// is rejected, despite being widely quoted online). The fallback stays in case
// Meta changes it; a wrong key is rejected outright, so we can never silently
// post a normal reel when a trial was asked for.
const makeContainer = async () => {
  if (!trial) return graph(env, `${env.IG_USER_ID}/media`, { method: 'POST', params: baseParams });
  const variants = [{ graduation_strategy: STRATEGY }, { graduationStrategy: STRATEGY }];
  let lastErr;
  for (const v of variants) {
    try {
      return await graph(env, `${env.IG_USER_ID}/media`, {
        method: 'POST',
        params: { ...baseParams, trial_params: JSON.stringify(v) },
      });
    } catch (e) {
      // Only a key-name rejection is worth retrying with the other casing. Any
      // other error is the real answer - e.g. "Trial reel not enough followers"
      // (subcode 2207081): trial reels need the account over Instagram's
      // follower threshold. Retrying used to bury that under a misleading
      // "Unexpected key graduationStrategy" from the fallback attempt.
      if (!/Unexpected key/i.test(e.message)) throw e;
      lastErr = e;
      console.log(`  · ${Object.keys(v)[0]} rejected, trying alternative casing`);
    }
  }
  throw lastErr;
};

const container = await makeContainer().catch((e) => fail(e.message));

console.log(`  container: ${container.id}`);

// Reels transcode asynchronously; publishing before FINISHED fails.
process.stdout.write('  processing');
let status = null;
for (let i = 0; i < 60; i++) {
  await sleep(5000);
  const s = await graph(env, container.id, { params: { fields: 'status_code,status' } });
  status = s.status_code;
  if (status === 'FINISHED') break;
  if (status === 'ERROR') fail(`Instagram rejected the video: ${s.status || 'no detail given'}`);
  process.stdout.write('.');
}
console.log('');
if (status !== 'FINISHED') fail(`Still "${status}" after 5 minutes — try again later.`);
console.log('✔ Video accepted and processed by Instagram.');

if (!confirm) {
  console.log(
    '\nDRY RUN — nothing was published.\n' +
      `Reel is validated and staged as container ${container.id}.\n` +
      'Re-run with --confirm to publish (container expires in 24 hours).\n'
  );
  process.exit(0);
}

const published = await graph(env, `${env.IG_USER_ID}/media_publish`, {
  method: 'POST',
  params: { creation_id: container.id },
}).catch((e) => fail(e.message));

const link = await graph(env, published.id, { params: { fields: 'permalink' } }).catch(() => null);
console.log(`\n✔ PUBLISHED — media id ${published.id}`);
if (link?.permalink) console.log(`  ${link.permalink}\n`);
