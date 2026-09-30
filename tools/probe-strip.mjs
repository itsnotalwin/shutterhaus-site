/**
 * Measure the selected-work strip's columns.
 *
 * Alwin: "home page slides seem uneven and not like it should be."
 *
 * `columns` fills top-to-bottom, column 1 first, so an uneven total height is
 * expected — the question is whether the COLUMNS are uneven (ragged bottoms) or
 * just unequal in length. This reports the real numbers: each column's width,
 * its content height, and where the column boundary falls. A masonry wall is
 * fine having columns of different lengths; it is NOT fine having a column
 * that stops 300px short of its neighbour.
 *
 * Usage: node tools/probe-strip.mjs <baseUrl> [route]
 */

import { writeFileSync } from "node:fs";

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const BASE = process.argv[2] || "http://127.0.0.1:4173";
const ROUTE = process.argv[3] || "home";
const W = Number(process.argv[4] || 1440);
const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await new Promise((r) => (ws.onopen = r));

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: H,
  deviceScaleFactor: 1,
  mobile: W < 640,
});
await send("Page.navigate", { url: `${BASE}#/${ROUTE}` });
await sleep(2600);

// Walk down the page so lazy images have real heights, then report.
const r = await send("Runtime.evaluate", {
  expression: `(() => {
    const grid = document.querySelector('.hstrip__grid');
    if (!grid) return null;
    const cs = getComputedStyle(grid);
    const gr = grid.getBoundingClientRect();
    // Cells can sit directly under the grid (older layout) or inside a
    // per-column wrapper — group by x either way.
    const cells = Array.from(grid.querySelectorAll('.cell')).map(c => {
      const cr = c.getBoundingClientRect();
      const img = c.querySelector('img');
      return {
        x: Math.round(cr.x), w: Math.round(cr.width), h: Math.round(cr.height),
        top: Math.round(cr.y), src: (img?.currentSrc || '').split('/').pop() || '',
        nat: img ? img.naturalWidth + 'x' + img.naturalHeight : '',
      };
    });
    // Group cells into columns by their x position.
    const byX = new Map();
    for (const c of cells) {
      const k = c.x;
      if (!byX.has(k)) byX.set(k, []);
      byX.get(k).push(c);
    }
    const cols = Array.from(byX.entries()).sort((a, b) => a[0] - b[0]).map(([x, items]) => {
      const top = Math.min(...items.map(i => i.top));
      const bottom = Math.max(...items.map(i => i.top + i.h));
      return { x, count: items.length, w: items[0].w, top, bottom, height: bottom - top };
    });
    return JSON.stringify({
      display: cs.display,
      columnCount: cs.columnCount,
      columnGap: cs.columnGap,
      gridW: Math.round(gr.width),
      cols,
      cells,
    });
  })()`,
  returnByValue: true,
});
const raw = r.result?.result?.value;
if (!raw) {
  console.log("no .hstrip__grid found on " + ROUTE);
  await fetch(`${CDP}/json/close/${t.id}`);
  ws.close();
  process.exit(1);
}
const d = JSON.parse(raw);

console.log(`route=${ROUTE} width=${W}`);
console.log(`display=${d.display} column-count=${d.columnCount} gap=${d.columnGap} grid=${d.gridW}px`);
console.log(`cells=${d.cells.length}`);
for (const c of d.cols) {
  console.log(
    `  col x=${c.x} w=${c.w} n=${c.count} top=${c.top} bottom=${c.bottom} height=${c.height}`,
  );
}
if (d.cols.length) {
  const hs = d.cols.map((c) => c.height);
  const min = Math.min(...hs);
  const max = Math.max(...hs);
  console.log(`column heights: ${hs.join(", ")}`);
  console.log(`shortest column is ${max - min}px behind the tallest`);
  console.log(`ragged bottom (how far each stops short): ${hs.map((h) => max - h).join(", ")}`);
  const ws2 = d.cols.map((c) => c.w);
  console.log(`column widths: ${ws2.join(", ")}  -> ${new Set(ws2).size === 1 ? "equal" : "UNEQUAL"}`);
}

await fetch(`${CDP}/json/close/${t.id}`);
ws.close();
