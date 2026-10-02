/**
 * Transfer weight per route, on a cold cache, at iPhone 16 (393px, DPR 3),
 * after scrolling the whole page so lazy images have actually loaded.
 *
 * The audit measured the live site at 1,624KB on /portfolio. Compare against
 * this to see what the 560w rung and the contact-figure derivative bought.
 *
 * Run: node tools/audit2-weight.mjs
 */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

const MEASURE = `(() => {
  const e = performance.getEntriesByType("resource");
  const bytes = e.reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0);
  const big = e.slice().sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))[0];
  const byExt = {};
  for (const r of e) {
    const ext = (r.name.split(".").pop() || "?").toLowerCase();
    byExt[ext] = (byExt[ext] || 0) + (r.transferSize || 0);
  }
  return {
    bytes, imgs: document.images.length, req: e.length,
    biggest: big ? big.name.split("/").pop() + " " + Math.round((big.transferSize || 0) / 1024) + "KB" : "-",
    byExt: Object.entries(byExt).sort((a,b)=>b[1]-a[1]).slice(0,5)
      .map(([k,v]) => k + " " + Math.round(v/1024) + "KB").join(", "),
    height: document.documentElement.scrollHeight,
  };
})()`;

console.log(`\n=== ${ORIGIN} — cold cache, iPhone 16 (393px @ DPR3), full scroll ===\n`);
console.log("route         total      reqs  imgs  height   breakdown");
const rows = [];
for (const route of ["", "portfolio", "about", "services", "contact"]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
  await send("Network.clearBrowserCache");
  await send("Page.navigate", { url: `${ORIGIN}/${route}` });
  await sleep(3800);
  await send("Runtime.evaluate", {
    expression: `(async () => {
      const step = innerHeight * 0.8;
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo(0, y); await new Promise(r => setTimeout(r, 160));
      }
      scrollTo(0, 0);
    })()`,
    awaitPromise: true,
  });
  await sleep(1500);
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: MEASURE });
  const d = r.result.value;
  if (!d) { console.log(`/${route}  MEASURE FAILED`); continue; }
  rows.push({ route: route || "home", ...d });
  console.log(`/${(route || "home").padEnd(12)} ${(Math.round(d.bytes / 1024) + "KB").padEnd(10)} ${String(d.req).padEnd(5)} ${String(d.imgs).padEnd(5)} ${(d.height + "px").padEnd(8)} ${d.byExt}`);
}
console.log("\nBiggest single asset per route:");
for (const r of rows) console.log(`  /${r.route.padEnd(11)} ${r.biggest}`);
ws.close();
process.exit(0);