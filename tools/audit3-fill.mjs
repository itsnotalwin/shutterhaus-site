/**
 * Do the pages FILL the screen on a large monitor?
 *
 * Alwin's brief: "BOTH MOBILE AND DESKOP VERSIONS FILL SCREENS". This measures
 * how much of the viewport the actual content occupies at every width, and
 * flags the dead space that a cap or a short column leaves behind.
 *
 * "Fill" is measured as: content right edge vs viewport width, and content
 * height vs viewport height (a portfolio is meant to exceed the fold; an
 * about page is not). Dead space on the right is the thing that reads as
 * unfinished.
 *
 * Run: node tools/audit3-fill.mjs
 */
import { mkdirSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
mkdirSync("audit-v2/audit3", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const created = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
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
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });

const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const main = document.querySelector('main') || document.body;
  // rightmost painted content, ignoring the fixed header's full-width box
  let right = 0, widest = null;
  for (const el of main.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right > right) { right = r.right; widest = el; }
  }
  const wrap = main.getBoundingClientRect();
  const used = Math.round(right);
  return {
    vw,
    docH: document.documentElement.scrollHeight,
    foldFill: +(Math.min(vh, document.documentElement.scrollHeight) / vh).toFixed(2),
    rightEdgeUsed: used,
    deadRight: Math.round(vw - used),
    deadRightPct: +(((vw - used) / vw) * 100).toFixed(1),
    widestClass: widest ? (widest.className || widest.tagName).toString().slice(0, 40) : null,
    mainWidth: Math.round(wrap.width),
  };
})()`;

for (const w of [393, 768, 1440, 1920]) {
  console.log(`\n===== ${w}px =====`);
  for (const route of ["", "portfolio", "about", "services", "contact"]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 });
    await send("Page.navigate", { url: `${ORIGIN}/${route}` });
    await sleep(2800);
    const r = await send("Runtime.evaluate", { returnByValue: true, expression: PROBE });
    const d = r.result.value;
    const flag = d.deadRightPct > 20 ? "  <-- VOID" : "";
    console.log(`  /${(route || "home").padEnd(11)} contentRight=${String(d.rightEdgeUsed).padEnd(5)}/${String(d.vw).padEnd(5)} dead=${String(d.deadRightPct + "%").padEnd(7)} docH=${String(d.docH).padEnd(6)} widest=${d.widestClass}${flag}`);
  }
}
ws.close();
process.exit(0);