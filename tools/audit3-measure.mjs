/**
 * audit3-measure — full measurement sweep of the LIVE site.
 * 7 viewports x 5 routes. Read-only, no source touched.
 * Run: node tools/audit3-measure.mjs [routeFilter] [widths]
 *   e.g. node tools/audit3-measure.mjs /services
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const PROBE = readFileSync(new URL("./audit3-probe.js", import.meta.url), "utf8");
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
const evaluate = async (e) => {
  const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    const ex = r.exceptionDetails.exception || {};
    throw new Error((ex.description || r.exceptionDetails.text || "eval failed").split("\n")[0]);
  }
  return r.result.value;
};
// retry across the "Inspected target navigated or closed" race
const evaluateRetry = async (e, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await evaluate(e); } catch (err) { last = err; await sleep(1200); }
  }
  throw last;
};
await send("Page.enable"); await send("Runtime.enable");

// wait until the emulated viewport has ACTUALLY taken effect
async function waitForVW(w) {
  for (let i = 0; i < 60; i++) {
    try {
      const v = await evaluate("document.documentElement.clientWidth");
      if (v === w) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

const WIDTHS = [320, 393, 430, 768, 1024, 1440, 1920];
const ROUTES = ["/", "/portfolio", "/about", "/services", "/contact"];
const rFilter = process.argv[2];
const wFilter = process.argv[3] ? process.argv[3].split(",").map(Number) : null;
const routes = rFilter ? [rFilter] : ROUTES;
const widths = wFilter || WIDTHS;
const OUTFILE = "audit-v2/audit3/measure.json";

let out = {};
try { out = JSON.parse(readFileSync(OUTFILE, "utf8")); } catch {}
let failures = 0;

for (const route of routes) {
  out[route] = out[route] || {};
  for (const w of widths) {
    try {
      await send("Emulation.setDeviceMetricsOverride", {
        width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700,
        screenWidth: w, screenHeight: 900,
      });
      const settled = await waitForVW(w);
      await send("Page.navigate", { url: ORIGIN + route });
      await sleep(1800);
      await evaluateRetry("document.fonts.ready");
      await sleep(400);
      await evaluateRetry("Promise.race([Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))), new Promise(r=>setTimeout(r,3000))])").catch(() => {});
      await sleep(200);
      const d = await evaluateRetry(PROBE);
      d._settled = settled;
      out[route][w] = d;
      const ovf = d.overflow.docScrollW > d.vw + 1;
      console.log(`  ${route.padEnd(11)} ${String(w).padStart(4)}px  vw=${d.vw}  doc=${d.docH}px  scrollW=${d.overflow.docScrollW}  ${ovf ? "*** H-OVERFLOW ***" : "ok"}`);
    } catch (e) {
      failures++;
      console.log(`  ${route.padEnd(11)} ${String(w).padStart(4)}px  !! FAILED: ${String(e.message).slice(0, 200)}`);
    }
    writeFileSync(OUTFILE, JSON.stringify(out, null, 1));
  }
}
console.log(`\nwrote ${OUTFILE}  (${failures} failures)`);
ws.close(); process.exit(0);
