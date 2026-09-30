/**
 * Measure the live site under mobile conditions and find what's actually slow.
 *
 * Run: node tools/probe-mobile.mjs [baseUrl]
 * Needs Chrome on CDP_PORT (default 9222) with a fresh --user-data-dir.
 */
const BASE = (process.argv[2] ?? "https://shutterhausvisuals.co.za").replace(/\/$/, "");
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
const log = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) log.push(msg);
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

// Order matters: enable every domain BEFORE navigating, or Runtime.evaluate
// lands on the stale about:blank and reads an empty page.
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Log.enable");

// A mid-range Android under throttled 4G. This is the realistic floor.
await send("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});
await send("Emulation.setCPUThrottlingRate", { rate: 4 });
await send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,   // 1.6 Mbps
  uploadThroughput: (750 * 1024) / 8,
  connectionType: "cellular4g",
});

const url = `${BASE}/#/photo`;
await send("Page.navigate", { url });
await sleep(9000);

const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

const vitals = await evaluate(`(async () => {
  const out = {};
  // LCP
  out.lcp = await new Promise((res) => {
    let v = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; })
        .observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) { return res("unsupported"); }
    setTimeout(() => res(Math.round(v)), 500);
  });
  const nav = performance.getEntriesByType("navigation")[0] || {};
  out.domContentLoaded = Math.round(nav.domContentLoadedEventEnd || 0);
  out.loadEvent = Math.round(nav.loadEventEnd || 0);
  out.transferBytes = nav.transferSize || 0;

  // Which element is the LCP?
  const lcpEl = await new Promise((res) => {
    let last = null;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) last = e; })
        .observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {}
    setTimeout(() => {
      if (!last) return res(null);
      const el = last.element;
      res(el ? (el.tagName + (el.className ? "." + String(el.className).split(" ")[0] : "")) : "unknown");
    }, 400);
  });
  out.lcpElement = lcpEl;

  // Images: are they lazy, sized, over-large?
  const imgs = [...document.querySelectorAll("img")];
  out.imgCount = imgs.length;
  out.lazyCount = imgs.filter((i) => i.loading === "lazy").length;
  out.eagerCount = imgs.filter((i) => i.loading !== "lazy").length;
  out.firstImgLazy = imgs.length ? imgs[0].loading : null;
  out.withSrcset = imgs.filter((i) => i.srcset && i.srcset.length).length;
  out.withPicture = document.querySelectorAll("picture source[srcset]").length;
  out.withDims = imgs.filter((i) => i.getAttribute("width") && i.getAttribute("height")).length;
  out.noAlt = imgs.filter((i) => !i.alt || !i.alt.trim()).length;

  // Does the PAGE scroll on a phone, or is a nested .col doing it? A
  // stationary page with an inner scroll area is the "laggy" feel: the page
  // never moves under your thumb and the footer can be unreachable.
  out.pageScrolls = document.documentElement.scrollHeight > window.innerHeight + 20;
  out.colScrolls = [...document.querySelectorAll(".col")].some(
    (c) => c.scrollHeight > c.clientHeight + 4,
  );
  out.pageScrollHeight = document.documentElement.scrollHeight;
  // A frame that never gets is-loaded would sit at opacity 0 forever. Count
  // both states so a silent failure here is visible rather than inferred.
  out.loadedClass = document.querySelectorAll(".cell img.is-loaded").length;
  out.opacities = imgs.slice(0, 12).map((i) => ({
    src: (i.currentSrc || i.src || "").split("/").pop(),
    op: getComputedStyle(i).opacity,
  }));
  out.imgData = imgs.slice(0, 12).map((i) => ({
    src: (i.currentSrc || i.src || "").split("/").pop(),
    loading: i.loading,
    w: i.naturalWidth, h: i.naturalHeight,
    cw: Math.round(i.getBoundingClientRect().width),
    decoded: i.complete && i.naturalWidth > 0,
  }));

  // Font/CSS blocking
  out.stylesheets = document.styleSheets.length;
  out.fonts = [...document.fonts].map((f) => f.family + " " + f.status);

  // Any layout overflow (a common "not working well" on mobile)
  out.docScrollW = document.documentElement.scrollWidth;
  out.viewportW = window.innerWidth;
  out.horizontalOverflow = out.docScrollW > out.viewportW + 1;

  // Touch targets under 44px
  const small = [];
  for (const el of document.querySelectorAll("a,button,input,select,textarea")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.height < 44 || r.width < 44) {
      small.push((el.tagName + "." + String(el.className).split(" ")[0]) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    }
  }
  out.smallTargets = small.slice(0, 15);
  out.smallTargetCount = small.length;
  return out;
})()`);

console.log(JSON.stringify(vitals, null, 2));

// Per-request timing
const reqs = log
  .filter((e) => e.method === "Network.responseReceived")
  .map((e) => {
    const r = e.params;
    return {
      url: r.response.url.split("/").pop().slice(0, 55),
      status: r.response.status,
      bytes: r.response.encodedDataLength ?? 0,
      fromCache: r.response.fromDiskCache || r.response.fromPrefetchCache || false,
    };
  });
console.log("\n--- requests ---");
for (const r of reqs) console.log(`${String(r.bytes).padStart(8)}  ${r.status}  ${r.url}`);
console.log(`\ntotal requests: ${reqs.length}, bytes: ${reqs.reduce((a, b) => a + (b.bytes || 0), 0)}`);

await send("Page.close");
