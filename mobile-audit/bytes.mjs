// Cold-cache byte measurement + true served-file dimensions.
const BASE = "https://shutterhausvisuals.co.za/";
const CDP = "http://127.0.0.1:9334";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import("node:fs/promises");

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const byId = new Map();       // requestId -> url
const done = new Map();       // requestId -> encodedDataLength
const resp = new Map();       // requestId -> {mime,status,fromCache}
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === "Network.requestWillBeSent") byId.set(msg.params.requestId, msg.params.request.url);
  if (msg.method === "Network.responseReceived")
    resp.set(msg.params.requestId, { mime: msg.params.response.mimeType, status: msg.params.response.status,
      disk: !!msg.params.response.fromDiskCache, pref: !!msg.params.response.fromPrefetchCache });
  if (msg.method === "Network.loadingFinished") done.set(msg.params.requestId, msg.params.encodedDataLength);
};
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const evaluate = async (e) => {
  const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 400) };
  return r.result?.result?.value;
};

for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });

const route = process.argv[2] || "#/portfolio";
const scrollPasses = +(process.argv[3] ?? 12);
await send("Page.navigate", { url: BASE + route });
await sleep(5000);

// Snapshot the first-screenful payload BEFORE any scrolling.
const beforeScroll = new Set(done.keys());
const firstScreen = [...done.entries()].filter(([k]) => !beforeScroll.has(k)).length;
for (let i = 0; i < scrollPasses; i++) { await evaluate("window.scrollTo(0, document.body.scrollHeight)"); await sleep(800); }
await evaluate("window.scrollTo(0,0)");
await sleep(2500);

const rows = [];
for (const [rid, url] of byId) {
  if (!/\.(webp|jpe?g|png|avif)(\?|$)/i.test(url)) continue;
  rows.push({ file: url.split("/").pop(), url, bytes: done.get(rid) ?? null, ...(resp.get(rid) || {}) });
}
const agg = {};
for (const r of rows) {
  const k = r.file;
  if (!agg[k]) agg[k] = { bytes: 0, mime: r.mime, status: r.status, reqs: 0, disk: false };
  agg[k].bytes += r.bytes || 0; agg[k].reqs++;
  agg[k].disk = agg[k].disk || r.disk || r.pref;
}
const imgs = Object.entries(agg).filter(([k]) => /img|og-|hero/i.test(k));
const totalImg = imgs.reduce((a, [, v]) => a + v.bytes, 0);
const allBytes = [...done.values()].reduce((a, b) => a + b, 0);

await fs.writeFile("bytes.json", JSON.stringify({ agg, imgs, totalImg, allBytes, nonImg: allBytes - totalImg }, null, 1));

console.log("=== IMAGE RESPONSES (cold cache, 393px @ DPR3) ===");
for (const [k, v] of imgs.sort()) console.log(`  ${k.padEnd(34)} ${String(v.bytes).padStart(8)} B  ${v.mime}  x${v.reqs}${v.disk ? "  (CACHE)" : ""}`);
console.log(`\nIMAGE FILES: ${imgs.length}`);
console.log(`TOTAL IMAGE BYTES: ${totalImg} B = ${(totalImg/1024).toFixed(0)} KB = ${(totalImg/1024/1024).toFixed(2)} MB`);
console.log(`NON-IMAGE (html/css/js/fonts): ${allBytes - totalImg} B = ${((allBytes-totalImg)/1024).toFixed(0)} KB`);
console.log(`GRAND TOTAL: ${allBytes} B = ${(allBytes/1024).toFixed(0)} KB`);
console.log(`\nany non-200:`, imgs.filter(([,v]) => v.status !== 200).map(([k,v]) => k + ":" + v.status));
console.log(`duplicate requests (same file >1x):`, imgs.filter(([,v]) => v.reqs > 1).map(([k,v]) => k + " x" + v.reqs));
ws.close();
