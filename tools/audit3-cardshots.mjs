/**
 * Screenshot the pricing cards specifically, at mobile and desktop, so the
 * crops can be judged by eye rather than by arithmetic. The four figures must
 * be the same height and no face may be cut.
 *
 * Run: node tools/audit3-cardshots.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
mkdirSync("audit-v2/audit3", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const created = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
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
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });

for (const [name, w, dpr] of [["cards-393-full", 393, 2], ["cards-1440", 1440, 1]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: dpr, mobile: w < 700 });
  await send("Page.navigate", { url: `${ORIGIN}/services` });
  await sleep(3500);
  // force every lazy image in, then scroll back
  await send("Runtime.evaluate", {
    expression: `(async () => {
      for (const i of document.images) i.loading = "eager";
      const s = innerHeight * 0.7;
      for (let y = 0; y < document.documentElement.scrollHeight; y += s) {
        scrollTo(0, y); await new Promise(r => setTimeout(r, 200));
      }
      scrollTo(0, 0);
    })()`, awaitPromise: true });
  await sleep(2500);

  // clip to the card grid only
  const box = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => { const g = document.querySelector('.pkgrow');
      if (!g) return null; const r = g.getBoundingClientRect();
      return { x: Math.max(r.left + scrollX - 8, 0), y: r.top + scrollY - 8, width: r.width + 16, height: r.height + 16 }; })()`,
  });
  const b = box.result.value;
  if (!b) { console.log(`  ${name}: no .pkgrow`); continue; }
  const { data } = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: b.x, y: b.y, width: Math.ceil(b.width), height: Math.min(Math.ceil(b.height), 5000), scale: 1 },
  });
  writeFileSync(`audit-v2/audit3/${name}.png`, Buffer.from(data, "base64"));
  console.log(`  ${name}: ${Math.ceil(b.width)}x${Math.ceil(b.height)} -> audit-v2/audit3/${name}.png`);
}
ws.close();
process.exit(0);