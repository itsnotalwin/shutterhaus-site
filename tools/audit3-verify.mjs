/**
 * audit3-verify — targeted checks on the anomalies the sweep surfaced:
 *  - is the -542px / -959px "gap" real overlap, or just 2-col grid siblings?
 *  - what actually changes between 393 and 430 on /services?
 *  - portfolio 900px cap: how does the wall actually sit at 1440 / 1920?
 * Read-only.
 * Run: node tools/audit3-verify.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = "https://shutterhausvisuals.co.za";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("audit-v2/audit3", { recursive: true });

const targets = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
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
const ev = async (e) => {
  const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || "err").split("\n")[0]);
  return r.result.value;
};
const evRetry = async (e, t = 4) => { let l; for (let i = 0; i < t; i++) { try { return await ev(e); } catch (x) { l = x; await sleep(1000); } } throw l; };
await send("Page.enable"); await send("Runtime.enable");

async function waitForVW(w) { for (let i = 0; i < 60; i++) { try { if (await ev("document.documentElement.clientWidth") === w) return true; } catch {} await sleep(250); } return false; }
async function go(route, w) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700, screenWidth: w, screenHeight: 900 });
  await waitForVW(w);
  await send("Page.navigate", { url: ORIGIN + route });
  await sleep(2000);
  await evRetry("document.fonts.ready");
  await sleep(400);
}

const TOP = `(() => {
  const main = document.querySelector('main .page') || document.querySelector('main');
  const out = [];
  for (const ch of main.children) {
    const r = ch.getBoundingClientRect(), cs = getComputedStyle(ch);
    out.push({ sel: ch.tagName.toLowerCase()+'.'+(typeof ch.className==='string'?ch.className:''),
      x:Math.round(r.left), y:Math.round(r.top+scrollY), w:Math.round(r.width), h:Math.round(r.height),
      display:cs.display, gridCols: cs.gridTemplateColumns, flexDir: cs.flexDirection });
  }
  // do any two siblings visually overlap (real collision)?
  const overlaps = [];
  for (let i=0;i<main.children.length;i++) for (let j=i+1;j<main.children.length;j++) {
    const a=main.children[i].getBoundingClientRect(), b=main.children[j].getBoundingClientRect();
    const ox = Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const oy = Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if (ox>1 && oy>1) overlaps.push({ a: main.children[i].className, b: main.children[j].className, overlapX:Math.round(ox), overlapY:Math.round(oy) });
  }
  return { children: out, overlaps, mainDisplay: getComputedStyle(main).display, mainCols: getComputedStyle(main).gridTemplateColumns };
})()`;

const PKG = `(() => {
  const row = document.querySelector('.pkgrow'); if (!row) return null;
  const cs = getComputedStyle(row);
  const cards = [...row.children].map(c => { const r=c.getBoundingClientRect(); return { cls:c.className, x:Math.round(r.left), y:Math.round(r.top+scrollY), w:Math.round(r.width), h:Math.round(r.height) }; });
  return { cols: cs.gridTemplateColumns, display: cs.display, gap: cs.gap, n: cards.length, cards, rows: new Set(cards.map(c=>c.y)).size };
})()`;

const PF = `(() => {
  const wrap = document.querySelector('.portfolio'), rows = document.querySelector('.pf-rows');
  if (!rows) return null;
  const vw = document.documentElement.clientWidth;
  const wr = wrap.getBoundingClientRect(), rr = rows.getBoundingClientRect();
  const first = document.querySelector('.pf-cell'), fr = first.getBoundingClientRect();
  const cells = [...document.querySelectorAll('.pf-cell')];
  const cellW = cells.map(c => Math.round(c.getBoundingClientRect().width));
  return { vw, wrapX:Math.round(wr.left), wrapW:Math.round(wr.width), wrapMaxW:getComputedStyle(wrap).maxWidth,
    rowsX:Math.round(rr.left), rowsW:Math.round(rr.width), rowsMaxW:getComputedStyle(rows).maxWidth,
    gutL:Math.round(rr.left), gutR:Math.round(vw-rr.right),
    deadRightPct: +(((vw-rr.right)/vw)*100).toFixed(1),
    cellW: [...new Set(cellW)], cellCols: new Set(cells.map(c=>Math.round(c.getBoundingClientRect().left))).size,
    nCells: cells.length, firstCellW: Math.round(fr.width) };
})()`;

const results = {};
const jobs = [
  ["/about", [393, 768, 1024, 1920], TOP, "top"],
  ["/contact", [393, 768, 1024, 1920], TOP, "top"],
  ["/services", [393, 430, 768, 1920], PKG, "pkg"],
  ["/portfolio", [320, 393, 768, 1024, 1440, 1920], PF, "pf"],
];
for (const [route, widths, probe, kind] of jobs) {
  results[route] = results[route] || {};
  for (const w of widths) {
    try {
      await go(route, w);
      results[route][w] = await evRetry(probe);
      console.log(`  ${route} @${w}  ok`);
    } catch (e) { console.log(`  ${route} @${w}  !! ${String(e.message).slice(0,140)}`); }
  }
}
writeFileSync("audit-v2/audit3/verify.json", JSON.stringify(results, null, 1));

console.log("\n### TOP-LEVEL LAYOUT (does a real overlap exist?)");
for (const r of ["/about", "/contact"]) for (const w of Object.keys(results[r] || {})) {
  const d = results[r][w]; if (!d) continue;
  console.log(`\n  ${r} @${w}  main display=${d.mainDisplay} cols=${d.mainCols}`);
  for (const c of d.children) console.log(`     ${c.sel.padEnd(26)} x=${String(c.x).padStart(5)} y=${String(c.y).padStart(6)} w=${String(c.w).padStart(5)} h=${String(c.h).padStart(6)} ${c.display}`);
  console.log(`     OVERLAPS: ${d.overlaps.length ? JSON.stringify(d.overlaps) : "none (negative gap was a grid-sibling artifact)"}`);
}
console.log("\n### SERVICES package grid");
for (const w of Object.keys(results["/services"] || {})) {
  const d = results["/services"][w]; if (!d) continue;
  console.log(`  @${w}: ${d.n} cards in ${d.rows} row(s)  cols="${d.cols}" gap=${d.gap}  cardW=${[...new Set(d.cards.map(c=>c.w))]}`);
}
console.log("\n### PORTFOLIO wall");
for (const w of Object.keys(results["/portfolio"] || {})) {
  const d = results["/portfolio"][w]; if (!d) continue;
  console.log(`  @${w}: vw=${d.vw} wrap(${d.wrapW}px max ${d.wrapMaxW}) rows(${d.rowsW}px max ${d.rowsMaxW}) gutL=${d.gutL} gutR=${d.gutR} deadRight=${d.deadRightPct}% cells=${d.nCells} cellW=${d.cellW}`);
}
ws.close(); process.exit(0);
