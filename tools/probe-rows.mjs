/**
 * Verify the portfolio wall is genuinely justified.
 *
 * Alwin: "portfolio page layout is concerning tis not clean", then choosing
 * "justified rows — no gaps, no cropping, rows stay aligned".
 *
 * Three things must hold, and each one has a way to fail quietly:
 *
 *  1. ROWS ARE FLUSH      — every frame in a row has the same height, and each
 *                           row's right edge lands on the same x. The previous
 *                           `display:contents` grid failed exactly here.
 *  2. NOTHING IS CROPPED   — rendered ratio matches natural ratio, so the row
 *                           maths did not silently squeeze any frame.
 *  3. NOT TOO MANY PIXELS  — a row filled to within a couple of px of the
 *                           content width. A row 40px short is a visible gap.
 *
 * usage: CDP_PORT=9333 node tools/probe-rows.mjs <url> [width]
 */

import { writeFileSync } from "node:fs";

const url = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const width = Number(process.argv[3] ?? 1440);
const route = `${url}/#/portfolio`;

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const t = await (await fetch(`${CDP}/json/new?${encodeURIComponent(route)}`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);

let id = 0;
const waiting = new Map();
const events = [];

ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  } else if (msg.method) {
    events.push(msg.method);
  }
};

await new Promise((r) => (ws.onopen = r));

function send(method, params = {}) {
  const i = ++id;
  return new Promise((res) => {
    waiting.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

await send("Emulation.setDeviceMetricsOverride", {
  width,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Runtime.enable", {});
await send("Page.navigate", { url: `${url}/#/portfolio` });
await new Promise((r) => setTimeout(r, 2500));

const expr = `(() => {
  const rows = Array.from(document.querySelectorAll('.pf-row'));
  const out = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('.pf-row__cell'));
    const heights = cells.map(c => Math.round(c.getBoundingClientRect().height));
    const rights = cells.map(c => Math.round(c.getBoundingClientRect().right));
    const lefts = cells.map(c => Math.round(c.getBoundingClientRect().left));
    const ratios = cells.map(c => {
      const img = c.querySelector('img');
      if (!img) return null;
      const b = img.getBoundingClientRect();
      return +(b.width / b.height).toFixed(3);
    });
    const naturals = cells.map(c => {
      const img = c.querySelector('img');
      return img ? +(img.naturalWidth / img.naturalHeight).toFixed(3) : null;
    });
    out.push({
      n: cells.length,
      rowH: Math.round(row.getBoundingClientRect().height),
      // Within a row, all frames share ONE height. Any spread is ragged.
      heightSpread: Math.max(...heights) - Math.min(...heights),
      // Do NOT spread the rights within a row: cells sit side by side, so
      // their right edges are meant to differ. What matters is whether the
      // LAST cell in the row lands on the content edge.
      lastRight: Math.round(row.getBoundingClientRect().right),
      rowLeft: Math.round(row.getBoundingClientRect().left),
      rowRightW: Math.round(row.getBoundingClientRect().width),
      sumCells: cells.reduce((a, c) => a + c.getBoundingClientRect().width, 0),
      firstLeft: Math.min(...lefts),
      ratios,
      naturals,
      maxRatioDrift: Math.max(...ratios.map((r, i) => r && naturals[i] ? Math.abs(r / naturals[i] - 1) : 0)),
    });
  }
  return JSON.stringify({
    rows: out,
    cells: document.querySelectorAll('.pf-cell').length,
    contentRight: Math.round((document.querySelector('.grid--wall') || document.body).getBoundingClientRect().right),
    contentLeft: Math.round((document.querySelector('.grid--wall') || document.body).getBoundingClientRect().left),
    contentWidth: Math.round((document.querySelector('.grid--wall') || document.body).getBoundingClientRect().width),
    rowWidthBox: Math.round((document.querySelector('.pf-row') || document.body).getBoundingClientRect().width),
    cssGut: getComputedStyle(document.querySelector('.pf-row')).gap,
    gridBoxW: Math.round(document.querySelector('.grid--wall').getBoundingClientRect().width),
    mainClientW: document.querySelector('.main') ? document.querySelector('.main').clientWidth : null,
    mainPadL: document.querySelector('.main') ? getComputedStyle(document.querySelector('.main')).paddingLeft : null,
    mainPadR: document.querySelector('.main') ? getComputedStyle(document.querySelector('.main')).paddingRight : null,
    innerW: window.innerWidth,
    gridDisplay: getComputedStyle(document.querySelector('.grid--wall')).display,
    gridCols: getComputedStyle(document.querySelector('.grid--wall')).gridTemplateColumns,
    firstRowBoxW: Math.round(document.querySelector('.pf-row').getBoundingClientRect().width),
    lastCellStyleW: document.querySelector('.pf-row .pf-row__cell:last-child').style.flexBasis,

  });
})()`;

const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
const data = JSON.parse(r.result.result.value);

writeFileSync(`shots/rows-${width}.json`, JSON.stringify(data, null, 2));

let fail = 0;
const ok = (c, msg) => {
  console.log(`${c ? "ok   " : "FAIL "} ${msg}`);
  if (!c) fail++;
};

console.log(`width=${width}  rows=${data.rows.length}  cells=${data.cells}`);
ok(data.cells === 50, `all 50 frames present (${data.cells})`);

const spreadHeights = data.rows.map((r) => r.heightSpread);
const drifts = data.rows.map((r) => r.maxRatioDrift);

ok(Math.max(...spreadHeights) <= 1, `every frame in a row shares one height (max spread ${Math.max(...spreadHeights)}px)`);
ok(Math.max(...drifts) <= 0.01, `no frame is cropped or stretched (max ratio drift ${(Math.max(...drifts) * 100).toFixed(2)}%)`);

const gridRight = data.contentRight;
const off = data.rows.filter((r) => Math.abs(gridRight - r.lastRight) > 2 ||
                                    Math.abs(r.rowRightW - data.contentWidth) > 2);
ok(off.length === 0, `every row ends flush right (${off.length} rows off)`);
off.forEach((r) => console.log(`      row of ${r.n} ends ${data.contentRight - r.lastRight}px off`));

const lefts = data.rows.map((r) => r.firstLeft);
ok(Math.max(...lefts) - Math.min(...lefts) <= 1, `every row starts on the same left edge (spread ${Math.max(...lefts) - Math.min(...lefts)}px)`);

const heights = data.rows.map((r) => r.rowH);
ok(Math.max(...heights) - Math.min(...heights) <= Math.max(...heights) * 0.5, `row heights are even (${Math.min(...heights)}-${Math.max(...heights)}px)`);

console.log(fail ? `\n${fail} check(s) failed` : "\nwall is justified");
await fetch(`${CDP}/json/close/${t.id}`);
process.exit(fail ? 1 : 0);