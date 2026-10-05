/**
 * Measure the portfolio wall's multi-column layout in real Chrome.
 * Run: node tools/measure-wall.mjs [baseUrl]
 *
 * The `verify.mjs` grid assertions predate the packed-column wall and read
 * `gridTemplateColumns` off `.pf-row`, a class the wall no longer emits at all.
 * This measures what actually decides whether the layout is correct: how many
 * columns the browser made, how evenly their bottoms line up, whether any frame
 * got split across a column break, and whether the page scrolls sideways.
 */
const BASE = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targets.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error("eval threw: " + expression);
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });

const PROBE = `(() => {
  const rows = document.querySelector('.pf-rows');
  if (!rows) return { err: 'no .pf-rows' };
  const cells = [...document.querySelectorAll('.pf-cell')];
  const boxes = cells.map((c) => {
    const r = c.getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) };
  });
  // Columns are identified by their left edge. Sub-pixel jitter is grouped by
  // rounding to the nearest 4px so two tracks 0.3px apart do not read as three.
  const byLeft = {};
  boxes.forEach((b) => { const k = Math.round(b.l / 4) * 4; (byLeft[k] = byLeft[k] || []).push(b); });
  const cols = Object.keys(byLeft).sort((a, b) => a - b).map((k) => byLeft[k]);
  const bottoms = cols.map((c) => Math.max(...c.map((x) => x.b)));
  const tallest = cols.map((c) => c.reduce((s, x) => s + x.h, 0));
  // A frame split across a column break shows up as a cell whose height is
  // materially shorter than its own image's natural ratio would give.
  const split = cells.filter((c) => {
    const img = c.querySelector('img');
    if (!img || !img.naturalHeight) return false;
    const rendered = c.getBoundingClientRect().width;
    if (!rendered) return false;
    const expected = rendered * (img.naturalHeight / img.naturalWidth);
    return Math.abs(expected - c.getBoundingClientRect().height) > 4;
  }).length;
  return {
    total: cells.length,
    colCount: cols.length,
    perCol: cols.map((c) => c.length),
    cellW: [...new Set(boxes.map((b) => b.w))],
    colBottoms: bottoms,
    bottomSpread: bottoms.length ? Math.max(...bottoms) - Math.min(...bottoms) : 0,
    cssColumnCount: getComputedStyle(rows).columnCount,
    cssColumnGap: getComputedStyle(rows).columnGap,
    maxWidth: getComputedStyle(rows).maxWidth,
    wallH: Math.round(rows.getBoundingClientRect().height),
    pageH: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    selfScrollers: [...document.querySelectorAll('.pf-rows, .pf-cell, .pf-row')]
      .filter((e) => e.scrollHeight > e.clientHeight + 1).length,
    splitFrames: split,
    imgs: document.querySelectorAll('.pf-cell img').length,
    dataN: cells.filter((c) => c.dataset.n).length,
  };
})()`;

const VIEWPORTS = [
  [1920, 1080], [1600, 1000], [1440, 900], [1280, 900],
  [1024, 800], [900, 800], [768, 900], [700, 900],
  [390, 844], [360, 780],
];

const out = [];
for (const [w, h] of VIEWPORTS) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  await send("Page.navigate", { url: `${BASE}/portfolio.html` });
  await sleep(2200);
  await evaluate(`location.hash = '#/portfolio'`);
  await sleep(1800);
  let m;
  try {
    m = await evaluate(PROBE);
  } catch (e) {
    m = { err: String(e).slice(0, 160) };
  }
  out.push({ viewport: `${w}x${h}`, ...m });
}

console.log(JSON.stringify(out, null, 1));

// Verdict, so this is a gate and not just a dump.
let bad = 0;
for (const r of out) {
  const w = parseInt(r.viewport, 10);
  const want = w <= 760 ? 2 : 3;
  const ok = !r.err && r.total === 30 && r.colCount === want && r.overflowX <= 0 &&
    r.selfScrollers === 0 && r.splitFrames === 0 && r.imgs === 30 && r.dataN === 30;
  if (!ok) bad++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${r.viewport.padEnd(9)} cols=${r.colCount}/${want} cells=${r.total} imgs=${r.imgs} ` +
    `cellW=${JSON.stringify(r.cellW)} bottomSpread=${r.bottomSpread}px split=${r.splitFrames} ` +
    `scrollX=${r.overflowX} selfScroll=${r.selfScrollers} wallH=${r.wallH} pageH=${r.pageH}` +
    (r.err ? ` ERR=${r.err}` : ""),
  );
}
console.log(bad === 0 ? "\nALL VIEWPORTS PASS" : `\n${bad} VIEWPORT(S) FAILED`);
ws.close();
process.exit(bad === 0 ? 0 : 1);
