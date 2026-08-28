// Turn a short-lived Facebook user token into a NEVER-EXPIRING Page token.
//
//   node fb-longlived-token.mjs <short-lived-user-token>
//
// WHY THIS EXISTS
// ---------------
// Tokens minted in Graph API Explorer die at the next whole hour — not "in an
// hour", at the next hh:00:00 boundary. Ours was generated at ~04:45 PDT and
// was dead by 05:00, about fifteen minutes later. That is why the Facebook post
// failed while the two Instagram posts went out fine.
//
// The fix is a two-step exchange:
//   1. short-lived user token  --(app secret)-->  long-lived user token (60d)
//   2. long-lived user token   --(/{page}?fields=access_token)-->  PAGE token
// A Page token derived from a LONG-LIVED user token does not expire at all, so
// the daily 09:09 routine stops silently dropping the Facebook post.
//
// Needs FB_APP_ID and FB_APP_SECRET in .env. The secret is the app's master
// credential — put it in the file, never in a chat window.

import { readFileSync, writeFileSync } from 'node:fs';

const fail = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };
const userToken = process.argv[2];
if (!userToken) fail('Usage: node fb-longlived-token.mjs <short-lived-user-token>');

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const { FB_APP_ID, FB_APP_SECRET, FB_PAGE_ID } = env;
const V = env.GRAPH_VERSION || 'v23.0';

if (!FB_APP_ID || !FB_APP_SECRET) {
  fail(
    'Missing FB_APP_ID and/or FB_APP_SECRET in .env.\n' +
    '  Get them from developers.facebook.com → your app → App settings → Basic.\n' +
    '  The App Secret is hidden behind a "Show" button that asks for your password —\n' +
    '  reveal it yourself and paste it into .env. Do not put it in a chat window.'
  );
}

const get = async (path, params) => {
  const u = new URL(`https://graph.facebook.com/${V}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const j = await (await fetch(u)).json();
  if (j.error) fail(`Graph API: ${j.error.message} (code ${j.error.code})`);
  return j;
};

console.log('\n1. Exchanging short-lived user token for a long-lived one…');
const long = await get('oauth/access_token', {
  grant_type: 'fb_exchange_token',
  client_id: FB_APP_ID,
  client_secret: FB_APP_SECRET,
  fb_exchange_token: userToken,
});
const days = long.expires_in ? Math.round(long.expires_in / 86400) : null;
console.log(`   long-lived user token obtained${days ? ` (~${days} days)` : ' (no stated expiry)'}`);

console.log('2. Deriving the Page token from it…');
const page = await get(FB_PAGE_ID, { fields: 'id,name,category,access_token', access_token: long.access_token });
if (page.id !== FB_PAGE_ID) fail(`Resolved ${page.name} (${page.id}), expected ${FB_PAGE_ID}`);
console.log(`   ${page.name} — ${page.category}`);

console.log('3. Verifying the Page token never expires…');
const dbg = await get('debug_token', { input_token: page.access_token, access_token: page.access_token });
const d = dbg.data || {};
if (d.type !== 'PAGE') fail(`Token type is ${d.type}, expected PAGE`);
const neverExpires = d.expires_at === 0 || d.expires_at == null;
console.log(`   type=${d.type}  valid=${d.is_valid}  expires=${neverExpires ? 'NEVER' : new Date(d.expires_at * 1000).toISOString()}`);
if (!neverExpires) {
  console.warn('\n⚠ This Page token still carries an expiry. The user token was probably');
  console.warn('  already long-lived or the exchange did not apply. It will work, but it');
  console.warn('  will need refreshing again — re-run with a freshly minted user token.');
}

let s = readFileSync('.env', 'utf8');
s = s.replace(/^FB_PAGE_TOKEN=.*$/m, `FB_PAGE_TOKEN=${page.access_token}`);
writeFileSync('.env', s);
console.log('\n✔ Written to .env. Run:  node post-facebook.js --check\n');
