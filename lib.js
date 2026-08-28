// Shared helpers for the @claude.cheats publisher.
// Zero dependencies — Node 18+ native fetch, and a tiny .env reader so no
// npm install is needed.
//
// This is a deliberate copy of ig-publisher/lib.js, not a shared import.
// Two accounts, two tokens, two .env files — keeping the folders independent
// means a mistake in one account's setup can never touch the other's.

import {readFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function loadEnv(required = ['IG_USER_ID', 'IG_ACCESS_TOKEN']) {
  const path = join(HERE, '.env');
  // CI (GitHub Actions) has no .env — values arrive as repo secrets instead.
  if (!existsSync(path)) {
    const fromProcess = {};
    for (const k of ['IG_USER_ID', 'IG_ACCESS_TOKEN', 'AUTH_MODE', 'GRAPH_VERSION',
                     'FB_PAGE_ID', 'FB_PAGE_TOKEN', 'FB_APP_ID', 'FB_APP_SECRET']) {
      if (process.env[k]) fromProcess[k] = process.env[k];
    }
    const missingEnv = required.filter((k) => !fromProcess[k]);
    if (missingEnv.length) {
      fail(
        [
          'No .env file, and missing from the environment: ' + missingEnv.join(', '),
          'Locally: copy .env.example to .env and fill it in.',
          'In GitHub Actions: add them as repository secrets.',
        ].join(String.fromCharCode(10))
      );
    }
    fromProcess.GRAPH_VERSION = fromProcess.GRAPH_VERSION || 'v23.0';
    fromProcess.AUTH_MODE = (fromProcess.AUTH_MODE || 'instagram').toLowerCase();
    fromProcess.GRAPH_HOST =
      fromProcess.AUTH_MODE === 'facebook' ? 'graph.facebook.com' : 'graph.instagram.com';
    return fromProcess;
  }
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    env[trimmed.slice(0, i).trim()] = trimmed
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  const missing = required.filter((k) => !env[k]);
  if (missing.length) fail(`Missing in .env: ${missing.join(', ')}`);
  env.GRAPH_VERSION = env.GRAPH_VERSION || 'v23.0';
  env.AUTH_MODE = (env.AUTH_MODE || 'instagram').toLowerCase();
  env.GRAPH_HOST =
    env.AUTH_MODE === 'facebook' ? 'graph.facebook.com' : 'graph.instagram.com';
  return env;
}

export class Abort extends Error {}

for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (err) => {
    if (!(err instanceof Abort)) console.error(err);
    process.exitCode = 1;
  });
}

export function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exitCode = 1;
  throw new Abort(msg);
}

const base = (env) => `https://${env.GRAPH_HOST}/${env.GRAPH_VERSION}`;

/** GET/POST against the Graph API with useful error surfacing. */
export async function graph(env, path, {method = 'GET', params = {}} = {}) {
  const url = new URL(`${base(env)}/${path}`);
  const body = new URLSearchParams({...params, access_token: env.IG_ACCESS_TOKEN});
  let res;
  if (method === 'GET') {
    url.search = body.toString();
    res = await fetch(url);
  } else {
    res = await fetch(url, {method, body});
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(
      `Graph API ${res.status}: ${e.message || 'unknown error'}` +
        (e.error_user_msg ? `\n   ${e.error_user_msg}` : '') +
        (e.code ? `\n   (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})` : '')
    );
  }
  return json;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
