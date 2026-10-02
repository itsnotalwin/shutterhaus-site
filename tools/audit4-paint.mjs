/**
 * Paint timing per route, cold cache, iPhone 16 (393px @ DPR 3).
 *
 * Reports FCP and LCP from the real PerformanceObserver stream. Used to decide
 * whether deferring the Supabase SDK out of the critical path actually helps,
 * rather than assuming it does — the dynamic import saves no bytes here, so the
 * only possible benefit is that first paint no longer waits on the module graph.
 *
 * Run: node tools/audit4-paint.mjs
 */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
const RUNS = Number(process.env.RUNS ?? 5);
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

const PROBE = `new Promise((resolve) => {
  const out = { fcp: null, lcp: null, dcl: null, bytes: 0 };
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) out.dcl = Math.round(nav.domInteractiveEventEnd);
  out.bytes = performance.getEntriesByType('resource')
    .reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0);
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') out.fcp = Math.round(e.startTime);
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => {
    const es = l.getEntries();
    if (es.length) out.lcp = Math.round(es[es.length - 1].startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  setTimeout(() => resolve(out), 3500);
})`;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`\n=== ${ORIGIN} — ${RUNS} cold runs, iPhone 16 ===\n`);
console.log("route        FCP      LCP      DCL      transfer");
for (const route of ["", "portfolio", "about", "services", "contact"]) {
  const f = [], l = [], d = [], b = [];
  for (let i = 0; i < RUNS; i++) {
    await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Network.clearBrowserCache");
    await send("Page.navigate", { url: `${ORIGIN}/${route}` });
    const r = await send("Runtime.evaluate", { returnByValue: true, expression: PROBE, awaitPromise: true });
    const v = r.result.value;
    if (v.fcp != null) f.push(v.fcp);
    if (v.lcp != null) l.push(v.lcp);
    if (v.domInteractive != null) d.push(v.domInteractive);
    b.push(v.bytes);
  }
  console.log(`/${(route || "home").padEnd(11)} ${String(median(f) + "ms").padEnd(8)} ${String(median(l) + "ms").padEnd(8)} ${String(median(d) + "ms").padEnd(8)} ${Math.round(median(b) / 1024) + "KB"}`);
}
ws.close();
process.exit(0);