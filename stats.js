// Read-only performance report for @claude.cheats. Publishes nothing.
import {loadEnv, graph} from './lib.js';

const env = loadEnv();
const list = await graph(env, `${env.IG_USER_ID}/media`, {
  params: {fields: 'id,caption,media_type,timestamp,permalink', limit: '100'},
});

const METRICS = 'views,reach,likes,comments,shares,saved,total_interactions';
const rows = [];
for (const m of list.data) {
  let ins = {};
  try {
    const r = await graph(env, `${m.id}/insights`, {params: {metric: METRICS}});
    for (const x of r.data) ins[x.name] = x.values?.[0]?.value ?? 0;
  } catch {}
  const hook = (m.caption || '').split('\n')[0].slice(0, 46);
  rows.push({
    when: m.timestamp?.slice(0, 16).replace('T', ' ') ?? '',
    type: m.media_type,
    hook,
    views: ins.views ?? 0,
    reach: ins.reach ?? 0,
    inter: ins.total_interactions ?? 0,
  });
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log('');
console.log(pad('POSTED', 17) + pad('TYPE', 12) + pad('HOOK', 48) + lpad('VIEWS', 7) + lpad('REACH', 7));
console.log('-'.repeat(93));
for (const r of rows) {
  console.log(pad(r.when, 17) + pad(r.type, 12) + pad(r.hook, 48) + lpad(r.views, 7) + lpad(r.reach, 7));
}
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log('-'.repeat(93));
console.log(pad(`TOTAL (${rows.length} posts)`, 77) + lpad(sum('views'), 7) + lpad(sum('reach'), 7));
console.log('');
