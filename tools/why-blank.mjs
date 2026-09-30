/**
 * Why is a specific frame blank? Dump the rendered <picture> for one image.
 *
 * Run: node tools/why-blank.mjs <baseUrl> [imgIndex]
 */
import { mkdirSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const IDX = Number(process.argv[3] ?? 2);
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots", { recursive: true });

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

const failed = [];
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.method === "Network.loadingFailed") {
    failed.push({ url: msg.params.requestId, err: msg.params.errorText, type: msg.params.type });
  }
});

await send("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});
await send("Page.navigate", { url: BASE + "/#/photo" });
await sleep(2500);
await evalJs(
  "new Promise(r=>{const h=document.documentElement.scrollHeight;window.scrollTo(0,h);" +
  "setTimeout(()=>{window.scrollTo(0,0);r(1)},1500)})",
);
await sleep(1500);

const info = await evalJs(`(() => {
  const imgs = [...document.querySelectorAll('.cell img')];
  return imgs.map((i, n) => {
    const r = i.getBoundingClientRect();
    const cs = getComputedStyle(i);
    return {
      n,
      src: (i.currentSrc || i.src || '').split('/').pop(),
      complete: i.complete,
      naturalW: i.naturalWidth,
      rendered: Math.round(r.width) + 'x' + Math.round(r.height),
      opacity: cs.opacity,
      isLoaded: i.classList.contains('is-loaded'),
      display: cs.display,
      visibility: cs.visibility,
      sources: [...(i.closest('picture')?.querySelectorAll('source') ?? [])]
        .map(s => s.type + ' ' + (s.srcset || '').split(',').length + ' entries'),
    };
  });
})()`);

console.log("--- per-frame state ---");
for (const f of info) console.log(JSON.stringify(f));

console.log("--- network failures ---");
const failedIds = await evalJs(`(() => performance.getEntriesByType('resource')
  .filter(e => e.responseStatus >= 400 || e.transferSize === 0)
  .map(e => e.name.split('/').pop() + ' status=' + e.responseStatus))()`);
console.log(failedIds);

// Screenshot just the offending frame, so we can see what it actually is.
const box = await evalJs(`(() => {
  const i = [...document.querySelectorAll('.cell img')][${IDX}];
  if (!i) return null;
  const r = i.getBoundingClientRect();
  return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
})()`);
if (box) {
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { ...box, scale: 1 },
  });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`shots/blank-${IDX}.png`, Buffer.from(shot.result.data, "base64"));
  console.log("SHOT  shots/blank-" + IDX + ".png  " + JSON.stringify(box));
}
ws.close();
