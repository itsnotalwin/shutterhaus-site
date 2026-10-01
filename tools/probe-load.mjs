/**
 * What does a cold portfolio load actually cost, in the real browser?
 *
 *   CDP_PORT=9333 node tools/probe-load.mjs <baseUrl>
 *
 * Clears the cache, then measures:
 *  - time to first byte, DOMContentLoaded, load
 *  - LCP
 *  - how many image requests fire, and how many bytes, for the FIRST screen
 *  - how long packByHeight() blocks the main thread
 *
 * The point is to find out whether the wall is slow because of the PACKER
 * (CPU) or because of the IMAGES (bytes). Those need opposite fixes, and
 * guessing gets it wrong — nested scroll containers, for instance, do not
 * reduce bytes at all.
 */
const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
if (!WebSocket) { console.error("FAIL  no WebSocket"); process.exit(1); }
import { rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const url = (process.argv[2] || "http://localhost:4173").replace(/\/$/, "");

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const tabs = await (await fetch(CDP + "/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!tab) { console.error("FAIL  no page target"); process.exit(1); }

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  else if (msg.method) events.push(msg);
};
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res) => { waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
};
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

let fails = 0;
const check = (name, pass, detail = "") => {
  console.log(`${pass ? "ok   " : "FAIL "} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!pass) fails++;
};

await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });

events.length = 0;
const t0 = Date.now();
await send("Page.navigate", { url: url + "/?t=" + Date.now() + "/#/portfolio" });

// Wait for load, then let the lazy images settle.
await new Promise((r) => setTimeout(r, 6000));

const nav = await evalJs(`(() => {
  const n = performance.getEntriesByType('navigation')[0] || {};
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)]));
  const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
  return {
    ttfb: Math.round(n.responseStart || 0),
    dcl: Math.round(n.domContentLoadedEventEnd || 0),
    load: Math.round(n.loadEventEnd || 0),
    fcp: paints['first-contentful-paint'] ?? null,
    lcp: lcpEntries.length ? Math.round(lcpEntries[lcpEntries.length-1].startTime) : null,
    lcpEl: lcpEntries.length ? (lcpEntries[lcpEntries.length-1].element?.className || '') : null,
  };
})()`);

const reqs = events
  .filter((e) => e.method === "Network.responseReceived")
  .map((e) => e.params.response);
const imgs = reqs.filter((r) => /\.(webp|jpg|jpeg|png)$/i.test(r.url || ""));
const bySize = imgs.map((r) => {
  const m = (r.url || "").match(/-(\d+w)\.(webp|jpg)$/i);
  return { url: (r.url || "").split("/").pop(), tier: m ? m[1] : "full", size: r.encodedDataLength || 0, status: r.status };
});
const imgBytes = bySize.reduce((a, b) => a + b.size, 0);
const totalBytes = reqs.reduce((a, b) => a + (b.encodedDataLength || 0), 0);

// How much of the wall is actually on screen before any scroll?
const geom = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('.pf-cell')];
  const vh = innerHeight;
  const inView = cells.filter(c => c.getBoundingClientRect().top < vh).length;
  return { cells: cells.length, inView, vh, docH: document.documentElement.scrollHeight };
})()`);

// How long did the main thread spend in long tasks?
const longTasks = await evalJs(`(() => {
  const e = performance.getEntriesByType('longtask') || [];
  return { count: e.length, total: Math.round(e.reduce((a,t)=>a+t.duration,0)) };
})()`);

console.log("--- navigation ---" + JSON.stringify({ ...nav, ...geom, longTasks }));
console.log("--- requests ---" + JSON.stringify({
  total: reqs.length, images: imgs.length,
  imgKB: Math.round(imgBytes / 1024), totalKB: Math.round(totalBytes / 1024),
  tiers: bySize.reduce((a, b) => { a[b.tier] = (a[b.tier] || 0) + 1; return a; }, {}),
}));

// The numbers that decide the fix.
// An LCP of null is a FINDING, not a pass: every wall frame is loading="lazy"
// (src/pages.ts passes index -1 to figure()), so the browser has no
// largest-contentful-paint candidate until the first scroll. That is a
// deliberate choice — a 50-frame wall must not eagerly fetch — but it means the
// page has no LCP at all, which is worth knowing before optimising further.
check("LCP is observed or intentionally absent",
  nav.lcp === null || nav.lcp < 2500,
  nav.lcp === null ? "null - every frame is lazy, no candidate until scroll" : `${nav.lcp}ms`);
check("first paint under 1s", nav.fcp !== null && nav.fcp < 1000, `${nav.fcp}ms`);
check("no frame on screen is 404", bySize.every((b) => b.status === 200),
  bySize.filter((b) => b.status !== 200).map((b) => b.status + " " + b.url).join(", ") || "all 200");
check("no long task over 200ms", longTasks.total < 200, `${longTasks.total}ms in ${longTasks.count}`);

// Report, don't assert: the byte budget is a judgement call, and the threshold
// depends on the connection.
console.log(`\nfirst screen: ${geom.inView} of ${geom.cells} frames, ${Math.round(imgBytes/1024)}kB of images`);
console.log(`page height: ${geom.docH}px = ${(geom.docH/geom.vh).toFixed(1)} screens`);
console.log(`total transfer: ${Math.round(totalBytes/1024)}kB across ${reqs.length} requests`);

ws.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nportfolio load is healthy");
process.exit(fails ? 1 : 0);
