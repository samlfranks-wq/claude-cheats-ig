// Publish an Instagram carousel (2-10 images/videos) from public URLs.
//
//   node post-carousel.js --urls "url1,url2,..." --caption "text #tag" [--confirm]
//   node catbox-upload.mjs dist/slide-*.mp4 2>/dev/null | node post-carousel.js --caption "..." [--confirm]
//
// Without --confirm it creates every child container, waits for Instagram to
// finish processing each one, then stops — so you can see all 6 were accepted
// before anything goes public. Re-run with --confirm to actually publish.
//
// URLs MUST be direct, publicly-fetchable file links (Content-Type: video/mp4
// or image/jpeg, not an HTML download page) — Instagram fetches them
// server-side. Use catbox-upload.mjs, not gofile-upload.mjs, to host the
// files for this step.

import {loadEnv, graph, sleep, fail} from './lib.js';
import {readFileSync} from 'node:fs';

// --- args ---------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};
const confirm = argv.includes('--confirm');

const captionFile = arg('caption-file');
const rawCaption = captionFile ? readFileSync(captionFile, 'utf8') : arg('caption') ?? '';

// --- gather URLs: --urls flag, or stdin (from catbox-upload.mjs, or bare
// URLs one per line) --------------------------------------------------
async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

let items = []; // {name, url, kind}

const urlsArg = arg('urls');
if (urlsArg) {
  items = urlsArg.split(',').map((u, i) => ({name: `item-${i + 1}`, url: u.trim()}));
} else {
  const stdin = (await readStdin()).trim();
  if (!stdin) {
    fail(
      'No URLs given. Pass --urls "url1,url2,..." or pipe lines from catbox-upload.mjs\n' +
        '  (each line either "name<TAB>url" or a bare URL).'
    );
  }
  items = stdin
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [a, b] = line.split('\t');
      return b ? {name: a, url: b.trim()} : {name: `item-${i + 1}`, url: a.trim()};
    });
}

// keep filenames in order (slide-01, slide-02, ...) even if upload finished
// out of sequence — safety net, uploads are already sequential upstream.
items.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));

for (const it of items) {
  if (!/^https:\/\//.test(it.url)) fail(`Not a public https URL: ${it.url}`);
  if (/gofile\.io\/d\//.test(it.url)) {
    fail(
      `${it.url}\n   This is a GoFile download PAGE, not a direct file link — Instagram's\n` +
        `   server-side fetch will get HTML back and reject it. Host with\n` +
        `   catbox-upload.mjs instead (produces files.catbox.moe/... direct links).`
    );
  }
}

if (items.length < 2) fail(`Instagram carousels need 2-10 items; got ${items.length}.`);
if (items.length > 10) fail(`Instagram carousels allow at most 10 items; got ${items.length}.`);

const VIDEO_EXT = /\.(mp4|mov)(\?|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)(\?|$)/i;
for (const it of items) {
  it.kind = VIDEO_EXT.test(it.url) ? 'video' : IMAGE_EXT.test(it.url) ? 'image' : null;
  if (!it.kind) fail(`Can't tell if this is a photo or video from the URL: ${it.url}`);
}

// House style: hashtags always lowercase.
const caption = rawCaption.replace(/#[\w]+/g, (t) => t.toLowerCase());
if (caption !== rawCaption) console.log('· lowercased hashtags to match house style');
if (caption.length > 2200) fail(`Caption is ${caption.length} chars; Instagram allows 2200.`);
const tagCount = (caption.match(/#\w+/g) || []).length;
if (tagCount > 30) fail(`${tagCount} hashtags; Instagram allows 30.`);

const env = loadEnv();

console.log(`\n${items.length}-item carousel for ${env.GRAPH_HOST}:`);
items.forEach((it, i) => console.log(`  ${i + 1}. [${it.kind}] ${it.name}  ${it.url}`));

// --- 1. create each child container -------------------------------------
console.log('\nCreating child containers…');
const children = [];
for (const it of items) {
  const params =
    it.kind === 'video'
      ? {media_type: 'VIDEO', video_url: it.url, is_carousel_item: 'true'}
      : {image_url: it.url, is_carousel_item: 'true'};
  const c = await graph(env, `${env.IG_USER_ID}/media`, {method: 'POST', params}).catch((e) =>
    fail(`${it.name}: ${e.message}`)
  );
  children.push({...it, id: c.id});
  console.log(`  ${it.name}  ->  container ${c.id}`);
}

// Polls a container's status_code until Instagram finishes processing it.
// Used for both child items AND the parent carousel container itself — the
// parent gets its own async processing pass after `children` is set, and
// publishing before THAT finishes fails with "Media ID is not available"
// even though every child already reported FINISHED individually.
async function waitUntilFinished(id, label) {
  process.stdout.write(`  ${label}`);
  let status = null;
  for (let i = 0; i < 60; i++) {
    const s = await graph(env, id, {params: {fields: 'status_code,status'}});
    status = s.status_code;
    if (status === 'FINISHED') break;
    if (status === 'ERROR') fail(`\n${label} was rejected: ${s.status || 'no detail given'}`);
    process.stdout.write('.');
    await sleep(5000);
  }
  if (status !== 'FINISHED') fail(`\n${label} still "${status}" after 5 minutes — try again later.`);
  console.log('  ✔');
}

// --- 2. wait for each child to finish processing -------------------------
// Images are usually near-instant; videos take longer. Poll everything the
// same way so we never race a slow child into the parent container.
console.log('\nWaiting for Instagram to process each item…');
for (const c of children) {
  await waitUntilFinished(c.id, c.name);
}

// --- 3. create the parent carousel container ------------------------------
console.log('\nCreating carousel container…');
const carousel = await graph(env, `${env.IG_USER_ID}/media`, {
  method: 'POST',
  params: {
    media_type: 'CAROUSEL',
    caption,
    children: children.map((c) => c.id).join(','),
  },
}).catch((e) => fail(e.message));
console.log(`  carousel container: ${carousel.id}`);

// The parent needs its own FINISHED pass before publish will accept it.
console.log('\nWaiting for Instagram to assemble the carousel…');
await waitUntilFinished(carousel.id, 'carousel');

// --- 4. publish (only on explicit confirmation) --------------------------
if (!confirm) {
  console.log(
    '\nDRY RUN — nothing was published.\n' +
      `All ${items.length} items are validated and staged as carousel ${carousel.id}.\n` +
      'Re-run the same command with --confirm to publish it\n' +
      '(container expires in 24 hours).\n'
  );
  process.exit(0);
}

const published = await graph(env, `${env.IG_USER_ID}/media_publish`, {
  method: 'POST',
  params: {creation_id: carousel.id},
}).catch((e) => fail(e.message));

const link = await graph(env, published.id, {params: {fields: 'permalink'}}).catch(() => null);
console.log(`\n✔ PUBLISHED — media id ${published.id}`);
if (link?.permalink) console.log(`  ${link.permalink}\n`);
