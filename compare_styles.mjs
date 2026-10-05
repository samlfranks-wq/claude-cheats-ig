// Read-only: compares @claude.cheats Reels by video style. Publishes nothing.
//
//   node compare_styles.mjs            report + append a snapshot to style-stats.jsonl
//   node compare_styles.mjs --since 2026-09-09
//
// Style comes from each queue item's note (matched to the IG post by caption):
//   plug-strip  = the reference-style rebuild (POWER v3, FINES, LEAKS ... power3/fines/leaks renderers)
//   full-anim   = full-bleed papercraft scenes, no presenter (BOUNCER, after nocodealex)
//   bots        = the established cream-stage format (stagekit / permission template)
//   presenter   = Sam's clone / character in front of the animation (posh, hooks40, trim)
// Views keep growing for days, so posts younger than MIN_AGE_H are listed but kept OUT of the
// verdict. Built 2026-10-05 for the plug-strip A/B week (6, 9, 12 Oct).
import {loadEnv, graph} from './lib.js';
import {readFileSync, appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const MIN_AGE_H = 48;
const argv = process.argv.slice(2);
const since = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : '2026-09-09';

const env = loadEnv();
const q = JSON.parse(readFileSync('queue.json', 'utf8'));
const items = Array.isArray(q) ? q : q.items;
const first = (s) => (s || '').split('\n')[0].trim().slice(0, 60).toLowerCase();
const byCaption = new Map(items.map((i) => [first(i.caption), i]));

// The three presenter videos (Sam's clone / the posh character). Every other Reel since 2026-09-09 was
// built in the cream-stage bot toolkit (classic or the 25 Sep fast template), whatever its note says.
const PRESENTER = ["i've seen how you talk to claude", 'your page is dead because you post', 'claude ignored your claude.md'];
function styleOf(note = '', hook = '') {
  if (/full-animation/i.test(note)) return 'full-anim';
  if (/plug-strip|POWER v3|power3|README-plug/i.test(note)) return 'plug-strip';
  if (PRESENTER.some((p) => hook.startsWith(p)) || /presenter|seedance|posh/i.test(note)) return 'presenter';
  return 'bots';
}
const durCache = {};
function duration(url) {
  if (!url) return null;
  if (url in durCache) return durCache[url];
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url],
      {timeout: 30000}).toString().trim();
    return (durCache[url] = parseFloat(out) || null);
  } catch { return (durCache[url] = null); }
}

const list = await graph(env, `${env.IG_USER_ID}/media`, {params: {fields: 'id,caption,media_type,timestamp', limit: '100'}});
const now = Date.now();
const rows = [];
for (const m of list.data) {
  if (m.media_type !== 'VIDEO' || m.timestamp.slice(0, 10) < since) continue;
  const ins = {};
  try {
    const r = await graph(env, `${m.id}/insights`, {params: {metric: 'views,reach,saved,shares,likes,comments,ig_reels_avg_watch_time'}});
    for (const x of r.data) ins[x.name] = x.values?.[0]?.value ?? x.total_value?.value ?? 0;
  } catch {}
  const qi = byCaption.get(first(m.caption));
  const dur = qi ? duration(qi.url) : null;
  const avg = (ins.ig_reels_avg_watch_time ?? 0) / 1000;
  rows.push({
    id: m.id, when: m.timestamp, ageH: (now - Date.parse(m.timestamp)) / 36e5,
    style: styleOf(qi?.note, first(m.caption)), file: qi ? qi.url.split('/').pop() : '?',
    hook: first(m.caption).slice(0, 38),
    views: ins.views ?? 0, reach: ins.reach ?? 0, saves: ins.saved ?? 0, shares: ins.shares ?? 0,
    likes: ins.likes ?? 0, comments: ins.comments ?? 0, avg, dur, comp: dur ? avg / dur : null,
  });
}

const pad = (s, n) => String(s).padEnd(n), lp = (s, n) => String(s).padStart(n);
console.log('\n' + pad('POSTED', 12) + pad('STYLE', 11) + pad('HOOK', 40) + lp('AGE', 5) + lp('VIEWS', 7) + lp('AVG s', 7) + lp('COMP', 6) + lp('SAVE', 5) + lp('SHR', 4));
for (const r of rows) {
  const young = r.ageH < MIN_AGE_H ? '*' : ' ';
  console.log(pad(r.when.slice(0, 10), 12) + pad(r.style, 11) + pad(r.hook, 40) + lp(Math.round(r.ageH) + 'h' + young, 5) +
    lp(r.views, 7) + lp(r.avg.toFixed(1), 7) + lp(r.comp == null ? '-' : Math.round(r.comp * 100) + '%', 6) + lp(r.saves, 5) + lp(r.shares, 4));
}
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
console.log(`\n* = younger than ${MIN_AGE_H}h, left out of the comparison below\n`);
console.log(pad('STYLE', 12) + lp('POSTS', 6) + lp('MED VIEWS', 10) + lp('MED AVG s', 10) + lp('MED COMP', 9) + lp('SAVES/1k REACH', 15));
for (const st of ['plug-strip', 'full-anim', 'bots', 'presenter']) {
  const g = rows.filter((r) => r.style === st && r.ageH >= MIN_AGE_H);
  if (!g.length) { console.log(pad(st, 12) + lp(0, 6) + '   (no posts old enough yet)'); continue; }
  const reach = g.reduce((a, r) => a + r.reach, 0), saves = g.reduce((a, r) => a + r.saves, 0);
  const comps = g.map((r) => r.comp).filter((x) => x != null);
  console.log(pad(st, 12) + lp(g.length, 6) + lp(Math.round(med(g.map((r) => r.views))), 10) + lp(med(g.map((r) => r.avg)).toFixed(1), 10) +
    lp(comps.length ? Math.round(med(comps) * 100) + '%' : '-', 9) + lp(reach ? (saves / reach * 1000).toFixed(1) : '-', 15));
}
appendFileSync('style-stats.jsonl', JSON.stringify({at: new Date().toISOString(), rows}) + '\n');
console.log('\nsnapshot appended to style-stats.jsonl\n');
