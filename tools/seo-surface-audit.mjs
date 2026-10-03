/**
 * seo-surface-audit.mjs — SEO surface audit of the five public routes, measured
 * in a real browser rather than by reading the HTML.
 *
 * WHY A BROWSER AND NOT A PARSER
 * The head is easy to read off disk. The parts that decide whether a page can
 * rank are not: the heading tree only exists after main.ts renders, the gallery
 * <img> tags are built at runtime, and the nav is a client component. Reading
 * portfolio.html tells you the title; it tells you nothing about whether the
 * page has an h1, whether the LCP frame is lazy, or whether /services is linked
 * from anywhere. So: navigate, render, ask the DOM.
 *
 * THE ONE THING THAT WILL BITE YOU
 * Navigating fires Runtime.executionContextsCleared. Every Runtime.evaluate
 * issued against the *old* context returns the pre-navigation document — which
 * for about:blank is an empty page with no og tags and no canonical, and it
 * looks exactly like a page with catastrophic SEO. This script therefore
 * captures Runtime.executionContextCreated after the load event and pins every
 * later evaluate to that contextId. Skipping that step produced a full-page
 * audit of about:blank: zero og tags, zero images, 24 body words, on a page
 * that ships eight og tags and thirty-one images.
 *
 * WHAT IT MEASURES, per route
 *   - the live <title> and the bytes Google would see, with lengths
 *   - meta description length, plus cross-route duplicate detection
 *   - canonical, robots meta, OG property set (incl. image w/h/alt)
 *   - heading tree: every h1..h6 in document order, plus skipped-level checks
 *   - images: alt coverage, loading attr, fetchpriority, the LCP candidate
 *   - internal links: which of the five routes this page actually links to
 *   - JSON-LD, if any, parsed and reported
 *   - console output, because a JS throw can blank the whole body
 *
 * Usage:  node tools/seo-surface-audit.mjs [outFile] [origin]
 * Attaches to the Chrome already listening on CDP_PORT (default 9222).
 */
import fs from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9222);
const ORIGIN = process.argv[3] || process.env.SEO_ORIGIN || 'https://shutterhausvisuals.co.za';
const OUT = process.argv[2] || 'C:/Users/Operations 3/Documents/HERMES/seo-surface-audit.json';
const ROUTES = [
  ['/', 'index.html'],
  ['/portfolio', 'portfolio.html'],
  ['/about', 'about.html'],
  ['/services', 'services.html'],
  ['/contact', 'contact.html'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- CDP plumbing ------------------------------------------------------------

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.contextId = null;   // the CURRENT page's JS context; see note above
    this.console = [];
    this.onEvent = null;
  }
  static async attach(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && s.pending.has(m.id)) {
        const { res, rej } = s.pending.get(m.id);
        s.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else {
        if (m.method === 'Runtime.executionContextsCleared') s.contextId = null;
        if (m.method === 'Runtime.executionContextCreated') s.contextId = m.params.context.id;
        if (m.method === 'Runtime.consoleAPICalled') {
          const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
          s.console.push(m.params.type + ': ' + txt.slice(0, 160));
        }
        if (s.onEvent) s.onEvent(m);
      }
    };
    return s;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rej(new Error('timeout ' + method));
        }
      }, 45000);
    });
  }
  /** Evaluate in the CURRENT page context, and insist the answer is real. */
  async js(expr) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const params = {
        expression: `(()=>{${expr}})()`,
        returnByValue: true,
        awaitPromise: true,
      };
      if (this.contextId != null) params.contextId = this.contextId;
      const r = await this.send('Runtime.evaluate', params);
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
      const v = r.result?.value;
      if (v !== undefined) return v;
      // Stale/absent context: drop it and let the poll below recover.
      this.contextId = null;
      await sleep(600);
    }
    throw new Error('evaluate returned no value (stale context)');
  }
}

/**
 * Navigate and wait for the SPA to actually mount.
 *
 * The poll is not optional. `loadEventFired` fires when the module bundle has
 * been fetched and evaluated, but the gallery resolves DEMO_PHOTOS from a
 * timeout-guarded fetch ("[gallery] timed out, keeping bundled set" shows up
 * in the console), so the wall of frames lands AFTER load. Probing at load
 * measures a half-rendered page.
 */
async function nav(s, url) {
  // This Chrome is shared with whatever else is running on the box, and a
  // navigation can fail at the network layer and land on
  // chrome-error://chromewebdata/ instead of throwing. That page has no og
  // tags, no canonical and two images, so a single failure reads exactly like
  // a catastrophically bad page and poisons the whole audit. Verify we arrived,
  // and retry rather than reporting an error page as a real measurement.
  let lastHref = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    s.console.length = 0;
    const loaded = new Promise((res) => {
      s.onEvent = (m) => { if (m.method === 'Page.loadEventFired') res(); };
      setTimeout(res, 20000);
    });
    await s.send('Page.navigate', { url });
    await loaded;
    s.onEvent = null;
    for (let i = 0; i < 60; i++) {
      try {
        const n = await s.js('return document.querySelectorAll("img").length + (document.querySelector(".main")?.innerHTML.length || 0)');
        if (n > 400) break;
      } catch (e) { /* context still settling */ }
      await sleep(250);
    }
    await sleep(2500);
    lastHref = await s.js('return location.href');
    process.stderr.write('  [nav] ' + url + ' -> ' + lastHref + ' (attempt ' + attempt + ')\n');
    if (lastHref.startsWith(url.replace(/\/$/, '')) || new URL(lastHref).pathname === new URL(url).pathname) return;
    process.stderr.write('nav retry ' + attempt + ' for ' + url + ' (landed ' + lastHref + ')\n');
    await sleep(2500);
  }
  throw new Error('could not load ' + url + ' (last href ' + lastHref + ')');
}

// --- the in-page probe -------------------------------------------------------
// One function, run per route. Everything is computed in the page so we read
// the rendered document, not the source string.
const PROBE = `
const q = (s) => Array.from(document.querySelectorAll(s));
const meta = (sel) => { const el = document.querySelector(sel); return el ? el.getAttribute('content') : null; };

// --- head ---
const title = document.title;
const desc = meta('meta[name="description"]');
const canonical = document.querySelector('link[rel="canonical"]')?.href || null;
const robotsMeta = meta('meta[name="robots"]');
const lang = document.documentElement.getAttribute('lang');
const viewport = meta('meta[name="viewport"]');

// every og:* and twitter:*, keyed, so nothing silently drops out
const og = {};
q('meta[property^="og:"]').forEach(m => og[m.getAttribute('property')] = m.getAttribute('content'));
const tw = {};
q('meta[name^="twitter:"]').forEach(m => tw[m.getAttribute('name')] = m.getAttribute('content'));

// --- heading tree, document order ---
const heads = q('h1,h2,h3,h4,h5,h6').map(h => ({
  tag: h.tagName.toLowerCase(),
  text: (h.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
  inMain: !!h.closest('main'),
}));
const skips = [];
for (let i = 1; i < heads.length; i++) {
  const prev = +heads[i-1].tag[1], cur = +heads[i].tag[1];
  if (cur > prev + 1) skips.push({ from: heads[i-1].tag, to: heads[i].tag, at: heads[i].text });
}

// --- images ---
const imgs = q('img').map((im, i) => {
  const r = im.getBoundingClientRect();
  return {
    i,
    src: (im.currentSrc || im.src || '').split('/').pop().slice(0, 52),
    alt: im.getAttribute('alt'),
    hasAltAttr: im.hasAttribute('alt'),
    loading: im.getAttribute('loading'),
    fetchpriority: im.getAttribute('fetchpriority'),
    decoding: im.getAttribute('decoding'),
    w: im.naturalWidth || 0, h: im.naturalHeight || 0,
    top: Math.round(r.top + window.scrollY),
    inViewport: r.top < window.innerHeight && r.bottom > 0,
  };
});
// The LCP candidate: the largest-area image that starts in or near the first
// viewport. Natural px, because that is what has to download.
const lcp = imgs
  .filter(m => m.top < 1400 && m.w > 0)
  .sort((a, b) => (b.w * b.h) - (a.w * a.h))[0] || null;

// --- internal links ---
const links = q('a[href]').map(a => ({
  href: a.getAttribute('href'),
  abs: a.href,
  text: (a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
}));
const PATHS = ['/', '/portfolio', '/about', '/services', '/contact'];
const linkedPages = {};
for (const p of PATHS) {
  linkedPages[p] = links.filter(l => {
    try {
      const u = new URL(l.abs, location.origin);
      if (u.origin !== location.origin) return false;
      const path = u.pathname.replace(/\\.html$/, '') || '/';
      return path === p;
    } catch (e) { return false; }
  }).length;
}

// --- structured data ---
const ld = q('script[type="application/ld+json"]').map(s => {
  try { return { ok: true, data: JSON.parse(s.textContent) }; }
  catch (e) { return { ok: false, err: String(e), raw: s.textContent.slice(0, 200) }; }
});

return {
  url: location.href,
  title, titleLen: title.length,
  desc, descLen: desc ? desc.length : 0,
  canonical, robotsMeta, lang, viewport,
  og, tw,
  heads, skips,
  h1Count: heads.filter(h => h.tag === 'h1').length,
  imgs, lcp, links, linkedPages, ld,
  bodyWords: (document.body.innerText || '').replace(/\\s+/g, ' ').trim().split(' ').filter(Boolean).length,
};
`;

// --- run ---------------------------------------------------------------------

const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const s = await Session.attach(t.webSocketDebuggerUrl);
for (const d of ['Page', 'Runtime', 'Log']) {
  try { await s.send(d + '.enable'); } catch (e) { /* optional */ }
}
await s.send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
});

// Join the origin and the filename with exactly one slash. `ORIGIN + file`
// silently produced "https://shutterhausvisuals.co.zaindex.html" — Chrome
// dutifully reported a network error for a domain that does not exist, and the
// error page has no og tags and no canonical, so the whole audit came back
// looking like a catastrophically unoptimised site. It was a missing slash.
const pageUrl = (file) => ORIGIN.replace(/\/+$/, '') + '/' + file;

const out = {};
for (const [route, file] of ROUTES) {
  await nav(s, pageUrl(file));
  out[route] = await s.js(PROBE);
  out[route].consoleLog = s.console.slice(0, 8);
  process.stderr.write('audited ' + route + '\n');
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

// --- report ------------------------------------------------------------------
const L = (...a) => console.log(...a);
L('\n================ SEO AUDIT: ' + ORIGIN + ' ================\n');
const titles = {}, descs = {};
for (const [r] of ROUTES) { titles[r] = out[r].title; descs[r] = out[r].desc; }

L('ROUTE            TITLE                                             T   DESC  D   H1 SKIP  WORDS');
L('-'.repeat(108));
for (const [r] of ROUTES) {
  const o = out[r];
  L(
    r.padEnd(16) +
    (o.title.length > 48 ? o.title.slice(0, 45) + '...' : o.title).padEnd(50) +
    ` ${String(o.titleLen).padStart(3)}  ${String(o.descLen).padStart(4)}  ${String(o.h1Count).padStart(2)}  ${String(o.skips.length).padStart(3)}  ${String(o.bodyWords).padStart(5)}`
  );
}
const dup = (obj) => {
  const seen = new Map();
  for (const [k, v] of Object.entries(obj)) {
    if (!v) continue;
    if (!seen.has(v)) seen.set(v, []);
    seen.get(v).push(k);
  }
  return [...seen.entries()].filter(([, ks]) => ks.length > 1);
};
const dupT = dup(titles), dupD = dup(descs);
L('\nDUPLICATE TITLES: ' + (dupT.length ? dupT.map(([, k]) => k.join('=')).join(', ') : 'none'));
L('DUPLICATE DESCRIPTIONS: ' + (dupD.length ? dupD.map(([, k]) => k.join('=')).join(', ') : 'none'));

for (const [r] of ROUTES) {
  const o = out[r];
  L('\n---- ' + r + ' ----');
  L('  canonical    : ' + o.canonical);
  L('  robots meta  : ' + (o.robotsMeta ?? 'ABSENT'));
  L('  lang         : ' + o.lang);
  L('  og (' + Object.keys(o.og).length + ')     : ' + Object.keys(o.og).join(' '));
  L('  twitter (' + Object.keys(o.tw).length + ') : ' + Object.keys(o.tw).join(' '));
  L('  headings(' + String(o.heads.length).padStart(3) + '): ' + o.heads.map((h) => h.tag).join(' '));
  if (o.skips.length) L('  !! SKIPPED LEVELS: ' + JSON.stringify(o.skips));
  const noAlt = o.imgs.filter((i) => !i.hasAltAttr);
  const emptyAlt = o.imgs.filter((i) => i.hasAltAttr && !String(i.alt || '').trim());
  L('  images: ' + o.imgs.length + ' | no alt attr: ' + noAlt.length + ' | alt="" : ' + emptyAlt.length);
  L('    eager: ' + o.imgs.filter((i) => i.loading !== 'lazy').length +
    ' | lazy: ' + o.imgs.filter((i) => i.loading === 'lazy').length +
    ' | fp=high: ' + o.imgs.filter((i) => i.fetchpriority === 'high').length);
  if (o.lcp) L('    LCP cand: ' + o.lcp.src + ' (' + o.lcp.w + 'x' + o.lcp.h + ') loading=' + o.lcp.loading + ' fp=' + o.lcp.fetchpriority + ' alt="' + String(o.lcp.alt).slice(0, 40) + '"');
  if (noAlt.length) L('    NO-ALT: ' + noAlt.slice(0, 5).map((i) => i.src).join(' | '));
  if (emptyAlt.length) L('    EMPTY-ALT: ' + emptyAlt.slice(0, 5).map((i) => i.src).join(' | '));
  L('  links to: ' + Object.entries(o.linkedPages).map(([k, v]) => k + '=' + v).join(' '));
  L('  JSON-LD: ' + o.ld.length + (o.ld.length ? ' ok=' + o.ld.map((x) => x.ok) : ''));
  if (o.consoleLog.length) L('  console: ' + o.consoleLog.join(' ;; '));
}

L('\nINBOUND (row page -> column targets)');
const pages = ROUTES.map((r) => r[0]);
L('             ' + pages.map((p) => p.padStart(11)).join(''));
for (const [r] of ROUTES) {
  L('  from ' + r.padEnd(9) + pages.map((p) => String(out[r].linkedPages[p]).padStart(11)).join(''));
}
process.exit(0);
