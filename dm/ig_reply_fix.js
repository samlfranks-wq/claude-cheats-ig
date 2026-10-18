// Instagram web nested-reply fix (2026-10-18). Paste into the page (javascript_tool) on instagram.com/p/<code>/ once per page load.
//
// Bug: instagram.com stores comment IDs as JS numbers. IDs above 2^53 (all of them, ~1.8e16) get rounded, so the
// comment_create request carries replied_to_comment_id = the rounded ID (e.g. ...823 -> ...824) and Instagram posts
// the "reply" as a loose top-level comment. Only IDs that happen to be exactly representable thread correctly.
// Fix: before each reply, set window.__fix to the parent comment's exact ID (from its permalink a[href*="/c/<id>/"]);
// this hook rewrites the rounded ID back to the exact one in the outgoing request and logs Instagram's response.
//
// Per reply:  window.__fix = '<exact parent id>'; window.__log = [];  -> click that comment's Reply -> type -> Enter
// Then check: the last window.__log entry has no "errors" and its replied_to_comment_id equals window.__fix.
// Verify after a reload: the parent shows "View all N replies" directly under it.
window.__fix = null; window.__log = [];
if (!window.__fixHook) {
  window.__fixHook = 1;
  const patch = (s) => {
    if (!window.__fix || typeof s !== 'string' || !/replied_to_comment_id/.test(decodeURIComponent(s))) return s;
    const wrong = String(Number(window.__fix));
    return s.split(wrong).join(window.__fix);
  };
  const fixBody = (b) => {
    if (typeof b === 'string') return patch(b);
    if (b instanceof URLSearchParams) return new URLSearchParams(patch(b.toString()));
    if (b instanceof FormData) { const f = new FormData(); for (const [k, v] of b.entries()) f.append(k, typeof v === 'string' ? patch(v) : v); return f; }
    return b;
  };
  const of = window.fetch;
  window.fetch = async function (input, init) {
    if (init && init.body) init = { ...init, body: fixBody(init.body) };
    const r = await of.call(this, input, init);
    try { r.clone().text().then((t) => { if (/comment_create/.test(t)) window.__log.push({ req: String(init && init.body), res: t }); }); } catch (e) {}
    return r;
  };
  const os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (b) {
    const nb = fixBody(b);
    this.addEventListener('load', () => { try { const t = String(this.responseText); if (/comment_create/.test(t)) window.__log.push({ req: String(nb), res: t }); } catch (e) {} });
    return os.call(this, nb);
  };
}
// Exact parent IDs for every comment on the page:
// [...document.querySelectorAll('a[href*="/c/"]')].map(a => [a.closest('li, div')?.innerText.split('\n')[0], a.getAttribute('href').match(/\/c\/(\d+)/)[1]])
