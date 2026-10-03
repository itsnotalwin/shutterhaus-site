// Full portfolio audit at 393px / DPR 3: structure, geometry, crop, network bytes.
const BASE = "https://shutterhausvisuals.co.za/";
const CDP = "http://127.0.0.1:9334";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import("node:fs/promises");

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const net = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method === "Network.responseReceived") {
    const r = msg.params.response;
    net.push({ url: r.url, status: r.status, type: r.mimeType,
               bytes: r.encodedDataLength, fromDisk: r.fromDiskCache || r.fromPrefetchCache || false });
  } else if (msg.method === "Network.loadingFinished") {
    const e = msg.params;
    const hit = net.find((x) => x.requestId === undefined);
  } else if (msg.method === "Network.requestWillBeSent") {
    net.push({ _rid: msg.params.requestId, url: msg.params.request.url, _ts: Date.now() });
  }
};
const send = (m, p = {}) => new Promise((res) => {
  const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p }));
});
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 500) };
  return r.result?.result?.value;
};

for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
await send("Network.setCacheDisabled", { cacheDisabled: true }); // true cold-cache measurement
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
await send("Emulation.setUserAgentOverride", {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

const route = process.argv[2] || "#/portfolio";
await send("Page.navigate", { url: BASE + route });
await sleep(5000);
// Scroll to bottom repeatedly to trigger lazy loading / IntersectionObserver.
for (let i = 0; i < 12; i++) {
  await evaluate("window.scrollTo(0, document.body.scrollHeight)");
  await sleep(900);
}
await evaluate("window.scrollTo(0,0)");
await sleep(2500);

console.log("=== route ===", await evaluate("location.hash + ' ' + location.pathname"));

console.log("\n=== structure ===");
console.log(await evaluate(`JSON.stringify({
  imgs: document.querySelectorAll('img').length,
  figures: document.querySelectorAll('figure').length,
  grids: [...document.querySelectorAll('[class*=grid]')].map(g => g.className + ' cols=' + getComputedStyle(g).gridTemplateColumns + ' gap=' + getComputedStyle(g).gap + ' n=' + g.querySelectorAll('img').length),
  imgParents: [...new Set([...document.querySelectorAll('img')].map(i => i.parentElement.tagName + '|' + i.parentElement.className))],
  docScrollH: document.body.scrollHeight
}, null, 1)`));

const imgs = await evaluate(`[...document.querySelectorAll('img')].filter(i=>!i.className.includes('lb__')).map((i,idx) => {
  const r = i.getBoundingClientRect();
  const cs = getComputedStyle(i);
  const p = i.parentElement, pcs = getComputedStyle(p);
  return { idx,
    file: (i.currentSrc || i.src || '').split('/').pop(),
    currentSrc: i.currentSrc, src: i.getAttribute('src'),
    alt: i.getAttribute('alt'), loading: i.getAttribute('loading'),
    fetchpriority: i.getAttribute('fetchpriority'),
    naturalW: i.naturalWidth, naturalH: i.naturalHeight,
    cssW: i.getAttribute('width'), cssH: i.getAttribute('height'),
    renderedW: +r.width.toFixed(2), renderedH: +r.height.toFixed(2),
    ar: cs.aspectRatio, objectFit: cs.objectFit, objectPosition: cs.objectPosition,
    inlineStyle: i.getAttribute('style') || '',
    imgW: cs.width, imgH: cs.height, imgMaxW: cs.maxWidth, imgMaxH: cs.maxHeight,
    parent: p.tagName + '.' + p.className,
    parentW: pcs.width, parentH: pcs.height, parentOverflow: pcs.overflow,
    grandparent: p.parentElement.tagName + '.' + p.parentElement.className,
    complete: i.complete, nat0: i.naturalWidth === 0
  };
})`);
await fs.writeFile("portfolio-imgs.json", JSON.stringify(imgs, null, 1));
console.log("\n=== images (" + imgs.length + ") written to portfolio-imgs.json ===");
console.log(JSON.stringify(imgs, null, 1));

console.log("\n=== picture sources (first 3) ===");
console.log(await evaluate(`JSON.stringify([...document.querySelectorAll('picture')].slice(0,3).map(p => ({
  img: p.querySelector('img')?.getAttribute('src'),
  alt: p.querySelector('img')?.getAttribute('alt'),
  sources: [...p.querySelectorAll('source')].map(s => ({ type: s.type, srcset: s.srcset, sizes: s.sizes }))
})), null, 1)`));

// Network bytes
const finished = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.method === "Network.loadingFinished") finished.set(msg.params.requestId, msg.params.encodedDataLength);
};
await sleep(500);
const reqs = net.filter(n => n._rid).map(n => ({ url: n.url, bytes: finished.get(n._rid) }));
const imgs2 = reqs.filter(r => /\.(webp|jpe?g|png|avif)/i.test(r.url));
const byFile = {};
for (const r of imgs2) byFile[r.url.split("/").pop()] = r.bytes;
const totalImg = Object.values(byFile).reduce((a, b) => a + (b || 0), 0);
await fs.writeFile("network-bytes.json", JSON.stringify({ byFile, totalImg, count: Object.keys(byFile).length }, null, 1));
console.log("\n=== image bytes over the wire (cold cache) ===");
console.log(JSON.stringify(byFile, null, 1));
console.log("IMAGE FILES:", Object.keys(byFile).length, "TOTAL BYTES:", totalImg, "=", (totalImg/1024).toFixed(0) + " KB", "=", (totalImg/1024/1024).toFixed(2) + " MB");
ws.close();
