// YouTube helpers for the @claude.cheats publisher.
// Zero dependencies — Node 18+ native fetch. This is a deliberate copy of
// yt-publisher/lib.js rather than a shared import: two channels, two OAuth
// clients, two .env files, so a mistake on one account cannot touch the other.
//
// Kept separate from lib.js (Instagram/Facebook) so the IG publish path is
// untouched by anything YouTube does.

import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ENV_PATH = join(HERE, '.env');

export class Abort extends Error {}

export function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exitCode = 1;
  throw new Abort(msg);
}

const KEYS = ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN',
              'YT_CHANNEL_ID', 'YT_CATEGORY_ID', 'YT_PRIVACY'];

// Environment and .env are merged, never one or the other: GitHub Actions ships
// no .env (secrets arrive in the environment), while locally the file wins for
// every key it actually sets.
export function loadYtEnv(required = ['YT_CLIENT_ID', 'YT_CLIENT_SECRET']) {
  const env = {};
  for (const k of KEYS) if (process.env[k]) env[k] = process.env[k].trim();
  if (existsSync(ENV_PATH)) {
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const key = t.slice(0, i).trim();
      const value = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (value && KEYS.includes(key)) env[key] = value;
    }
  }
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    fail([
      'Missing YouTube credentials: ' + missing.join(', '),
      'Locally: fill them into .env (see .env.example), then run:  node yt-auth.js',
      'In GitHub Actions: add them as repository secrets.',
    ].join('\n'));
  }
  env.YT_CATEGORY_ID = env.YT_CATEGORY_ID || '28';   // 28 = Science & Technology
  env.YT_PRIVACY = (env.YT_PRIVACY || 'public').toLowerCase();
  return env;
}

/** True when YouTube uploading is configured here — used to skip quietly. */
export function ytConfigured() {
  const have = (k) => {
    if (process.env[k]) return true;
    if (!existsSync(ENV_PATH)) return false;
    return new RegExp(`^${k}=\\S+`, 'm').test(readFileSync(ENV_PATH, 'utf8'));
  };
  return have('YT_CLIENT_ID') && have('YT_CLIENT_SECRET') && have('YT_REFRESH_TOKEN');
}

/** Write one key back into .env, preserving comments and ordering. */
export function setEnvValue(key, value) {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split('\n') : [];
  let found = false;
  const out = lines.map((line) => {
    const t = line.trim();
    if (t.startsWith('#') || !t.includes('=')) return line;
    if (t.slice(0, t.indexOf('=')).trim() !== key) return line;
    found = true;
    return `${key}=${value}`;
  });
  if (!found) out.push(`${key}=${value}`);
  writeFileSync(ENV_PATH, out.join('\n'));
}

/** Google access tokens last ~1h; the refresh token is the durable credential. */
export async function getAccessToken(env) {
  if (!env.YT_REFRESH_TOKEN) fail('No YT_REFRESH_TOKEN. Run:  node yt-auth.js');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id: env.YT_CLIENT_ID,
      client_secret: env.YT_CLIENT_SECRET,
      refresh_token: env.YT_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = body.error === 'invalid_grant'
      ? '\n\nThe refresh token is dead. Usual cause: the OAuth consent screen is\n' +
        'still in "Testing", which expires tokens after 7 days. Set it to\n' +
        '"In production", then re-run:  node yt-auth.js'
      : '';
    fail(`Token refresh failed (${res.status}): ${JSON.stringify(body)}${hint}`);
  }
  return body.access_token;
}

/** YouTube has no upload-from-URL, unlike Instagram — bytes pass through here. */
export async function fetchVideo(url) {
  let buf;
  if (/^https?:/i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) fail(`Could not fetch video (${res.status}): ${url}`);
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    if (!existsSync(url)) fail(`Video file not found: ${url}`);
    buf = readFileSync(url);
  }
  if (buf.length < 10_000) fail(`Video at ${url} is only ${buf.length} bytes — wrong URL?`);
  return buf;
}

/** Resumable upload: open a session, then PUT the bytes. One PUT is fine at ~5 MB. */
export async function uploadVideo({token, bytes, snippet, status}) {
  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': String(bytes.length),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify({snippet, status}),
    }
  );
  if (!init.ok) fail(`Could not open upload session (${init.status}): ${(await init.text()).slice(0, 500)}`);
  const location = init.headers.get('location');
  if (!location) fail('Upload session opened but returned no Location header.');
  const put = await fetch(location, {
    method: 'PUT',
    headers: {'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length)},
    body: bytes,
  });
  const out = await put.json().catch(() => ({}));
  if (!put.ok) fail(`Upload failed (${put.status}): ${JSON.stringify(out).slice(0, 500)}`);
  return out;
}

/** Custom thumbnail. Needs a phone-verified channel; never fatal if refused. */
export async function setThumbnail({token, videoId, url}) {
  let bytes;
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) return {skipped: `cover fetch ${res.status}`};
    bytes = Buffer.from(await res.arrayBuffer());
  } else {
    if (!existsSync(url)) return {skipped: `cover file not found: ${url}`};
    bytes = readFileSync(url);
  }
  const up = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg'},
    body: bytes,
  });
  if (!up.ok) return {skipped: `${up.status} ${(await up.text()).slice(0, 160)}`};
  return {ok: true};
}

// A YouTube title is a headline, not the opening line of an Instagram caption —
// those are long, multi-sentence, and get chopped mid-word at 100 chars. Queue
// items should carry `ytTitle`; this only falls back when one is missing.
export function buildSnippet({caption, categoryId, title: explicitTitle, tags}) {
  let first = (explicitTitle || '').trim();
  if (!first) {
    const line = caption.split('\n')[0].trim();
    const sentence = line.split(/(?<=[.!?])\s/)[0];      // first sentence, not the whole hook
    first = sentence.length <= 95 ? sentence : line;
    console.warn('  warning: no ytTitle on this queue item — derived one from the caption.');
  }
  let title = first.length > 100 ? `${first.slice(0, 97).trimEnd()}...` : first;
  // Shorts are classified by aspect ratio and length, but #Shorts in the title
  // is still the reliable signal while that classification settles.
  if (!/#shorts/i.test(title) && title.length <= 91) title = `${title} #Shorts`;
  return {
    title,
    description: caption.slice(0, 5000),
    categoryId: String(categoryId),
    tags: tags && tags.length ? tags : undefined,
  };
}
