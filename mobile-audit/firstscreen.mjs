// First-screenful bytes at DPR3 + what the lightbox pulls on tap.
const BASE = "https://shutterhausvisuals.co.za/";
const CDP = "http://127.0.0.1:9334";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import("node:fs/promises");
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\imgshots";

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
const byId = new Map(), done = new Map(), resp = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) { pending.get(x.id)(x); pending.delete(x.id); return; }
  if (x.method === "Network.requestWillBeSent") byId.set(x.params.requestId, x.params.request.url);
  if (x.method === "Network.responseReceived") resp.set(x.params.requestId, { mime: x.params.response.mimeType, status: x.params.response.status });
  if (x.method === "Network.loadingFinished") done.set(x.params.requestId, x.params.encodedDataLength);
};
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
  return r.result?.exceptionDetails ? { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 300) } : r.result?.result?.value; };

for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
await send("Page.navigate", { url: BASE + "#/portfolio" });

// Poll until the first screenful settles — no scrolling at all.
let settled = 0, last = -1;
for (let i = 0; i < 25; i++) {
  await sleep(700);
  settled = done.size;
  if (settled === last && i > 3) break;
  last = settled;
}
await sleep(1500);

const imgRows = [];
for (const [rid, url] of byId) if (/\.(webp|jpe?g|png)(\?|$)/i.test(url)) imgRows.push([url.split("/").pop(), done.get(rid) || 0]);
const uniq = {}; for (const [f, b] of imgRows) uniq[f] = (uniq[f] || 0) + b;
const imgTotal = Object.values(uniq).reduce((a, b) => a + b, 0);
const allTotal = [...done.values()].reduce((a, b) => a + b, 0);

console.log("=== FIRST SCREENFUL (393x852 @DPR3, NO scrolling) ===");
for (const [f, b] of Object.entries(uniq)) console.log(`  ${f.padEnd(32)} ${b} B`);
console.log(`  -> image files: ${Object.keys(uniq).length}`);
console.log(`  -> FIRST-SCREENFUL IMAGE BYTES: ${imgTotal} B = ${(imgTotal/1024).toFixed(0)} KB = ${(imgTotal/1024/1024).toFixed(2)} MB`);
console.log(`  -> including html/css/js: ${allTotal} B = ${(allTotal/1024).toFixed(0)} KB`);

console.log("\n=== do the 4 first-screen images have loading=lazy? ===");
console.log(await ev(`JSON.stringify([...document.querySelectorAll('img')].slice(0,4).map(i=>({
  f:(i.currentSrc||'').split('/').pop(), loading:i.getAttribute('loading'), fp:i.getAttribute('fetchpriority'),
  top:+i.getBoundingClientRect().top.toFixed(0)
})),null,1)`));

// Now tap to open lightbox and measure its payload.
const before = new Set([...done.keys()]);
const pt = await ev(`(()=>{const i=document.querySelectorAll('img')[0];const r=i.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`);
const p = JSON.parse(pt);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1, pointerType: "touch" });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1, pointerType: "touch" });
await sleep(4000);
const lb = [];
for (const [rid, url] of byId) { if (!before.has(rid) && /\.(webp|jpe?g|png)(\?|$)/i.test(url)) lb.push([url.split("/").pop(), done.get(rid) || 0]); }
console.log("\n=== LIGHTBOX: bytes pulled on ONE tap ===");
let lbt = 0; for (const [f, b] of lb) { console.log(`  ${f.padEnd(32)} ${b} B`); lbt += b; }
console.log(`  -> lightbox image bytes: ${lbt} B = ${(lbt/1024).toFixed(0)} KB = ${(lbt/1024/1024).toFixed(2)} MB`);
console.log("\n=== lightbox img geometry ===");
console.log(await ev(`JSON.stringify([...document.querySelectorAll('.lb img, [class*=lb] img')].map(i=>{const r=i.getBoundingClientRect();const cs=getComputedStyle(i);
  return {src:(i.currentSrc||'').split('/').pop(), nat:i.naturalWidth+'x'+i.naturalHeight, box:+r.width.toFixed(0)+'x'+r.height.toFixed(0), objectFit:cs.objectFit, maxH:cs.maxHeight, maxW:cs.maxWidth};}),null,1)`));
const s = await send("Page.captureScreenshot", { format: "png" });
await fs.writeFile(OUT + "\\04-lightbox-first-tap.png", Buffer.from(s.result.data, "base64"));
await fs.writeFile("firstscreen.json", JSON.stringify({ uniq, imgTotal, allTotal, lightbox: lb, lbTotal: lbt }, null, 1));
console.log("\nsaved firstscreen.json");
ws.close();
