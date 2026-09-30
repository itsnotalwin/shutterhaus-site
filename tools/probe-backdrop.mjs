/**
 * Is the lightbox backdrop actually opaque? Sample real pixels.
 *
 * Run: node tools/probe-backdrop.mjs <baseUrl>
 */
const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/$/, "") + "/";
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: BASE });
await sleep(3000);
await evaluate(`document.querySelector('.cell img[data-full]').click()`);
await sleep(1500);

const geo = await evaluate(`(() => {
  const lb = document.querySelector('.lb');
  const r = lb.getBoundingClientRect();
  const cs = getComputedStyle(lb);
  return {
    rect: Math.round(r.width) + 'x' + Math.round(r.height),
    top: Math.round(r.top), left: Math.round(r.left),
    coversViewport: r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1,
    background: cs.backgroundColor,
    opacity: cs.opacity,
    zIndex: cs.zIndex,
    position: cs.position,
  };
})()`);
console.log("--- .lb geometry ---");
console.log(JSON.stringify(geo, null, 2));

// Sample actual pixels in the corners, where only backdrop should be.
const shot = await send("Page.captureScreenshot", { format: "png" });
const png = Buffer.from(shot.result.data, "base64");
console.log("--- screenshot ---");
console.log("bytes:", png.length, "->", geo.coversViewport ? "covers viewport" : "DOES NOT COVER");
ws.close();
