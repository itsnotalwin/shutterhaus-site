/**
 * Measure the PORTFOLIO wall — same shape of report as probe-gap.mjs, but for
 * the 3-column wall on #/portfolio.
 *
 * This one is different from the home strip in a way that matters: 50 frames
 * in 3 columns is a long page, so a ragged bottom is not a local blemish —
 * it is thousands of pixels of white on a page the visitor has to scroll.
 *
 * Usage: node tools/probe-wall.mjs <baseUrl> [width]
 */

import { writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:4173";
const W = Number(process.argv[3] || 1440);
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
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
  height: 900,
  deviceScaleFactor: 1,
  mobile: W < 640,
});
await send("Page.navigate", { url: `${BASE}#/portfolio` });
await sleep(2800);

// Walk the page so every lazy frame is actually fetched before we measure.
await send("Runtime.evaluate", {
  expression: `(() => {
    let y = 0;
    const step = () => {
      y += 800;
      if (y > document.body.scrollHeight) return;
      scrollTo(0, y);
      setTimeout(step, 60);
    };
    step();
  })()`,
});
await sleep(6000);

const res = await send("Runtime.evaluate", {
  expression: `(() => {
    const grid = document.querySelector('.grid--wall');
    if (!grid) return JSON.stringify({ err: 'no .grid--wall' });
    const cells = Array.from(grid.querySelectorAll('.cell'));
    const cols = new Map();
    for (const c of cells) {
      const r = c.getBoundingClientRect();
      const x = Math.round(r.x);
      if (!cols.has(x)) cols.set(x, { x, w: Math.round(r.width), n: 0, top: r.y + scrollY, bottom: r.y + r.height + scrollY });
      const col = cols.get(x);
      col.n++;
      col.bottom = Math.max(col.bottom, r.y + r.height + scrollY);
      col.top = Math.min(col.top, r.y + scrollY);
    }
    const list = Array.from(cols.values()).sort((a, b) => a.x - b.x);
    const gridR = grid.getBoundingClientRect();
    const gr = gridR.y + scrollY;
    const gh = gridR.height;
    const heights = list.map((c) => c.bottom - c.top);
    const maxH = Math.max(...heights);
    const docH = document.documentElement.scrollHeight;
    const cta = grid.parentElement.querySelector('.cta');
    const ctaR = cta ? cta.getBoundingClientRect() : null;
    return JSON.stringify({
      cells: cells.length,
      cols: list.length,
      gridTop: Math.round(gr),
      gridHeight: Math.round(gh),
      docHeight: Math.round(docH),
      ctaTop: ctaR ? Math.round(ctaR.y + scrollY) : null,
      // White space between the SHORTEST column's bottom and the section's end.
      tailWhite: Math.round(gr + gh - Math.max(...heights)),
      perCol: list.map((c, i) => ({
        x: c.x, w: c.w, n: c.n, h: Math.round(heights[i]), endsShortBy: Math.round(maxH - heights[i]),
      })),
      screensTall: +(docH / 900).toFixed(1),
    });
  })()`,
  returnByValue: true,
});

const raw = res.result?.result?.value;
if (!raw) {
  console.log("RAW", JSON.stringify(res).slice(0, 300));
} else {
  const d = JSON.parse(raw);
  if (d.err) {
    console.log("ERR " + d.err);
  } else {
    console.log(
      `width=${W}  cells=${d.cells}  cols=${d.cols}  ` +
        `doc=${d.docHeight}px (${d.screensTall} screens)`,
    );
    for (const c of d.perCol) {
      console.log(
        `  col x=${c.x} w=${c.w} n=${c.n} h=${c.h} endsShortBy=${c.endsShortBy}`,
      );
    }
    console.log(`  white tail below shortest column: ${d.tailWhite}px`);
    if (d.ctaTop) console.log(`  grid bottom -> CTA: ${d.ctaTop - (d.gridTop + d.gridHeight)}px`);
  }
}

await fetch(`${CDP}/json/close/${t.id}`);
ws.close();
