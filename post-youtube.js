// Upload one video to the Claude Cheats YOUTUBE channel as a Short.
//
//   node post-youtube.js --check
//   node post-youtube.js --url <video-url> --caption "..." [--title "..."] [--cover <jpg>] [--confirm]
//
// Without --confirm this is a dry run: it shows exactly what would be sent and
// uploads nothing — the same safety rule as the Instagram and Facebook posters.

import {readFileSync} from 'node:fs';
import {loadYtEnv, getAccessToken, fetchVideo, uploadVideo, setThumbnail, buildSnippet, fail, Abort} from './yt-lib.js';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : argv[i + 1]; };
const confirm = argv.includes('--confirm');

async function main() {
  const env = loadYtEnv(['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN']);

  // --check: prove the credentials resolve to the intended channel before any upload.
  if (argv.includes('--check')) {
    const token = await getAccessToken(env);
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      {headers: {Authorization: `Bearer ${token}`}});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) fail(`Channel lookup failed (${r.status}): ${JSON.stringify(j).slice(0, 300)}`);
    const ch = j.items?.[0];
    if (!ch) fail('Token is valid but owns no channel. Re-run yt-auth.js and pick the Brand Account.');
    console.log(`\n✔ Authorised channel: ${ch.snippet.title} (${ch.id})`);
    console.log(`  Subscribers: ${ch.statistics?.subscriberCount ?? 'n/a'}   Videos: ${ch.statistics?.videoCount ?? 0}`);
    console.log(`  Uploads will be: ${env.YT_PRIVACY}, category ${env.YT_CATEGORY_ID}`);
    if (env.YT_CHANNEL_ID && env.YT_CHANNEL_ID !== ch.id) {
      fail(`.env pins YT_CHANNEL_ID=${env.YT_CHANNEL_ID}, but this token authorises ${ch.id}.\n` +
           '  Wrong channel — re-run yt-auth.js and choose the Claude Cheats one.');
    }
    console.log('');
    return;
  }

  const url = arg('url');
  const captionFile = arg('caption-file');
  const caption = captionFile ? readFileSync(captionFile, 'utf8') : (arg('caption') || '');
  const cover = arg('cover');

  if (!url) fail('Missing --url');
  if (!caption) fail('Missing --caption or --caption-file');
  if (/gofile\.io\/d\//.test(url)) fail('gofile.io/d/ links are HTML pages, not files. Use the catbox URL.');

  const snippet = buildSnippet({caption, title: arg('title'), categoryId: env.YT_CATEGORY_ID});
  const status = {privacyStatus: env.YT_PRIVACY, selfDeclaredMadeForKids: false};

  console.log(`\ntitle    ${snippet.title}`);
  console.log(`category ${snippet.categoryId}   privacy ${status.privacyStatus}`);
  console.log(`video    ${url}`);
  console.log(`desc     ${snippet.description.length} chars`);

  if (!confirm) {
    console.log('\nDRY RUN — nothing uploaded. Re-run with --confirm.\n');
    return;
  }

  // Identity guard: never upload before confirming which channel the token owns.
  const token = await getAccessToken(env);
  const who = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    {headers: {Authorization: `Bearer ${token}`}}).then((r) => r.json()).catch(() => ({}));
  const ch = who.items?.[0];
  if (!ch) fail('Could not confirm the channel this token owns — refusing to upload.');
  if (env.YT_CHANNEL_ID && env.YT_CHANNEL_ID !== ch.id) {
    fail(`REFUSING TO UPLOAD — token authorises "${ch.snippet.title}" (${ch.id}),\n` +
         `  but .env pins YT_CHANNEL_ID=${env.YT_CHANNEL_ID}.`);
  }
  console.log(`channel  ${ch.snippet.title} (${ch.id})`);

  const bytes = await fetchVideo(url);
  console.log(`fetched  ${(bytes.length / 1048576).toFixed(2)} MB, uploading...`);

  const video = await uploadVideo({token, bytes, snippet, status});
  console.log(`\n✔ PUBLISHED — https://youtube.com/watch?v=${video.id}`);

  if (cover) {
    const t = await setThumbnail({token, videoId: video.id, url: cover});
    console.log(t.ok ? '  thumbnail set' : `  thumbnail skipped: ${t.skipped}`);
  }

  const actual = video.status?.privacyStatus;
  if (actual && actual !== env.YT_PRIVACY) {
    console.log(`\nNOTE: requested "${env.YT_PRIVACY}" but YouTube returned "${actual}".\n` +
      'That is the unverified-project lock. The upload is fine — flip it to public in\n' +
      'YouTube Studio, or complete the API compliance audit to remove the restriction.');
  }
  console.log('');
}

main().catch((e) => {
  if (!(e instanceof Abort)) console.error(`\n✖ ${e.message}\n`);
  process.exitCode = 1;
});
