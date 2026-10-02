/**
 * What does the portfolio wall actually render at each width?
 *
 * npm run verify reported "14 rows, 2/2/2/..." and "three CSS tracks per row (2)"
 * — i.e. the wall is now 2-up, not the 10-rows-of-3 the verify gate still
 * asserts. Confirm whether that is phone-only (correct) or leaking onto desktop
 * (a regression), and record frames-per-row, rows, tile size and evenness.
 *
 * Run: node tools/audit2-wall.mjs   (needs Chrome already on CDP_PORT, default 9222)
 */
import { writeFileSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = "https://shutterhausvisuals.co.za";
const WIDTHS = [320, 393, 768, 1024, 1440];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`${CDP}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) {
    const p = pending.get(x.id); pending.delete(x.id);
    x.error ? p.reject(new Error(JSON.stringify(x.error))) : p.resolve(x.result);
  }
};
const send = (m, p = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
await send("Page.enable");
await send("Runtime.enable");

const EXPR = `(() => {
  const rows = [...document.querySelectorAll('.pf-row')];
  const tracks = rows.length
    ? getComputedStyle(rows[0]).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  const first = rows[0]?.querySelectorAll('.pf-cell').length ?? 0;
  // evenness: spread of cell heights within a row (0 = perfectly level)
  let worst = 0;
  for (const r of rows) {
    const hs = [...r.querySelectorAll('.pf-cell')].map(c => c.getBoundingClientRect().height);
    if (hs.length) worst = Math.max(worst, Math.max(...hs) - Math.min(...hs));
  }
  const tile = rows[0]?.querySelector('.pf-cell')?.getBoundingClientRect();
  const wall = document.querySelector('.pf-rows')?.getBoundingClientRect();
  const firstImg = document.querySelector('.pf-cell img');
  return {
    rows: rows.length,
    frames: document.querySelectorAll('.pf-cell').length,
    colsPerRow: tracks,
    cellsInFirstRow: first,
    tileW: tile ? Math.round(tile.width) : 0,
    tileH: tile ? Math.round(tile.height) : 0,
    wallH: wall ? Math.round(wall.height) : 0,
    rowSpreadPx: Math.round(worst * 100) / 100,
    imgNaturalW: firstImg?.naturalWidth ?? 0,
    imgBoxW: firstImg ? Math.round(firstImg.getBoundingClientRect().width) : 0,
    docHeight: document.documentElement.scrollHeight,
  };
})()`;

const out = [];
for (const w of WIDTHS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w, height: w < 700 ? 852 : 900, deviceScaleFactor: 1, mobile: w < 700,
  });
  await send("Page.navigate", { url: `${ORIGIN}/portfolio` });
  await sleep(3000);
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: EXPR });
  out.push({ viewport: w, ...r.result.value });
}

console.log("\n=== PORTFOLIO WALL, live site, by viewport width ===\n");
console.table(out);
const d = out.find((o) => o.viewport === 1440);
const p = out.find((o) => o.viewport === 393);
console.log(`\nDesktop 1440: ${d.colsPerRow} per row, ${d.rows} rows, ${d.frames} frames, tile ${d.tileW}px`);
console.log(`Phone   393: ${p.colsPerRow} per row, ${p.rows} rows, ${p.frames} frames, tile ${p.tileW}px`);
console.log(`\nEvenness (row spread must be 0): desktop ${d.rowSpreadPx}px, phone ${p.rowSpreadPx}px`);
console.log(`\nVERDICT: the gate wants 10 rows x 3 = 30 frames. Live desktop is ${d.rows} x ${d.colsPerRow} = ${d.frames}.`);
writeFileSync("C:/Users/Operations 3/Documents/WEBSITE/shutterhaus-site/audit-v2/wall.json", JSON.stringify(out, null, 2));
ws.close(); process.exit(0);