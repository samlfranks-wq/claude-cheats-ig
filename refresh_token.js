// Extend the Instagram long-lived token by another 60 days, before it can expire.
//
//   node refresh_token.js            refresh, write .env, update the GitHub secret
//   node refresh_token.js --dry      only report how long the current token has left
//
// Why: the token lasts 60 days and nothing refreshed it, so on 2026-09-28 it expired and
// every scheduled "Publish one Reel" run failed with Graph API code 190 until a human
// noticed. Instagram-Login tokens can be refreshed via GET /refresh_access_token as long as
// they are at least 24 h old and NOT yet expired - an expired one cannot be revived, so this
// must run well inside the 60 days (weekly is plenty). Zero dependencies, same .env as post.js.
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '.env');
const env = readFileSync(envPath, 'utf8');
const tok = (env.match(/^IG_ACCESS_TOKEN=(.*)$/m) || [])[1]?.trim();
if (!tok) { console.error('No IG_ACCESS_TOKEN in .env'); process.exit(1); }
const dry = process.argv.includes('--dry');

const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(tok)}`;
const r = await fetch(dry ? `https://graph.instagram.com/me?fields=username&access_token=${encodeURIComponent(tok)}` : url);
const j = await r.json();
if (!r.ok || j.error) {
  console.error(`Instagram refused: ${j.error?.message || r.status}`);
  console.error('If the token already expired it cannot be refreshed - generate a new one and run update_token.ps1.');
  process.exit(1);
}
if (dry) { console.log(`token valid for @${j.username}`); process.exit(0); }

const days = Math.round(j.expires_in / 86400);
writeFileSync(envPath, env.replace(/^IG_ACCESS_TOKEN=.*$/m, `IG_ACCESS_TOKEN=${j.access_token}`));
execFileSync('gh', ['secret', 'set', 'IG_ACCESS_TOKEN'], {cwd: here, input: j.access_token, stdio: ['pipe', 'ignore', 'inherit']});
console.log(`${new Date().toISOString()} refreshed: valid for ${days} more days; .env and GitHub secret updated`);
