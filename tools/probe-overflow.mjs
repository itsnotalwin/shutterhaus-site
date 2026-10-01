/**
 * Check for horizontal overflow on a route.
 *
 * Usage: node tools/probe-overflow.mjs <baseUrl> [route] [width]
 */

const BASE = process.argv[2] || "http://127.0.0.1:4173";
const ROUTE = process.argv[3] || "home";
const W = Number(process.argv[4] || 390);
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (
  await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })
).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await new Promise((r) => (ws.onopen = r));

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: 900,
  deviceScaleFactor: 1,
  mobile: W < 640,
});
if (W < 640) {
  await send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
}
await send("Page.navigate", { url: `${BASE}#/${ROUTE}` });
await sleep(2600);

const r = await send("Runtime.evaluate", {
  expression: `(() => {
    const de = document.documentElement;
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      if (b.right > de.clientWidth + 1 || b.left < -1) {
        over.push({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 40),
          left: Math.round(b.left),
          right: Math.round(b.right),
        });
      }
    }
    return JSON.stringify({
      clientWidth: de.clientWidth,
      scrollWidth: de.scrollWidth,
      scrollX: window.scrollX,
      overflowing: over.slice(0, 8),
      overflowCount: over.length,
    });
  })()`,
  returnByValue: true,
});

const got = JSON.parse(r.result.result.value);
console.log(JSON.stringify(got, null, 2));
console.log(
  got.scrollWidth > got.clientWidth
    ? `FAIL  horizontal overflow: scrollWidth ${got.scrollWidth} > clientWidth ${got.clientWidth}`
    : "ok    no horizontal overflow"
);

await fetch(`${CDP}/json/close/${t.id}`);
ws.close();