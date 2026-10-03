// Probe the live mobile portfolio: what images exist, how they're sized/cropped.
const BASE = "https://shutterhausvisuals.co.za/";
const CDP = "http://127.0.0.1:9334";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) events.push(msg);
};
const send = (method, params = {}) => new Promise((res) => {
  const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 400) };
  return r.result?.result?.value;
};

// Enable ALL domains BEFORE metrics override, navigate LAST.
for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");

// iPhone 14 Pro class: 393 CSS px, DPR 3.
await send("Emulation.setDeviceMetricsOverride", {
  width: 393, height: 852, deviceScaleFactor: 3, mobile: true,
});
await send("Emulation.setUserAgentOverride", {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

await send("Page.navigate", { url: BASE });
await sleep(6000);

console.log("=== URL/title ===");
console.log(await evaluate("location.href + ' | ' + document.title"));

console.log("\n=== structure probe ===");
console.log(await evaluate(`JSON.stringify({
  imgs: document.querySelectorAll('img').length,
  figures: document.querySelectorAll('figure').length,
  grids: document.querySelectorAll('.grid').length,
  cols: [...document.querySelectorAll('.grid')].map(g => ({
     cls: g.className, dataCols: g.dataset.cols,
     cols: getComputedStyle(g).gridTemplateColumns,
     gap: getComputedStyle(g).gap
  })),
  mainHTML: (document.querySelector('main')||{}).innerHTML?.slice(0,1200)
}, null, 1)`));

console.log("\n=== every <img> ===");
const imgs = await evaluate(`[...document.querySelectorAll('img')].map((i,idx) => {
  const r = i.getBoundingClientRect();
  const cs = getComputedStyle(i);
  return { idx,
    cls: i.className,
    alt: i.getAttribute('alt'),
    loading: i.getAttribute('loading'),
    fetchpriority: i.getAttribute('fetchpriority'),
    decoding: i.getAttribute('decoding'),
    src: i.getAttribute('src'),
    currentSrc: i.currentSrc,
    srcset: i.getAttribute('srcset'),
    sizes: i.getAttribute('sizes'),
    naturalW: i.naturalWidth, naturalH: i.naturalHeight,
    renderedW: +r.width.toFixed(1), renderedH: +r.height.toFixed(1),
    top: +r.top.toFixed(0),
    objectFit: cs.objectFit, objectPosition: cs.objectPosition,
    aspectRatio: cs.aspectRatio, height: cs.height, width: cs.width,
    inlineStyle: i.getAttribute('style') || '',
    complete: i.complete,
    parentTag: i.parentElement.tagName + '.' + i.parentElement.className
  };
})`);
console.log(JSON.stringify(imgs, null, 1));

console.log("\n=== <picture> sources ===");
console.log(await evaluate(`JSON.stringify([...document.querySelectorAll('picture')].map(p => ({
  img: p.querySelector('img')?.getAttribute('src'),
  sources: [...p.querySelectorAll('source')].map(s => ({
     media: s.media, type: s.type, srcset: s.srcset, sizes: s.sizes
  }))
})), null, 1)`));

fsDump(events);
function fsDump(ev) {
  // placeholder replaced below
}
ws.close();
