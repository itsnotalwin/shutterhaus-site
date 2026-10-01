/**
 * Full-page screenshot of the live portfolio route at one width.
 *
 *   CDP_PORT=9333 node tools/shoot-pf.mjs <baseUrl> <width> <label>
 *
 * DevTools has no "full page" capture: Page.captureScreenshot clips to the
 * emulated viewport unless `captureBeyondViewport` is set, and even then a 50-row
 * wall exceeds Chrome's texture limit in one go. So the page is scrolled in
 * viewport-sized steps and each slice is written as its own PNG.
 *
 * Follows the CDP wiring already used by probe-rows.mjs (no shared helper module
 * exists in this repo).
 */

import { mkdirSync, writeFileSync } from "node:fs";

const [, , base = "https://shutterhausvisuals.co.za", width = "1440", label = "pf"] = process.argv;
const W = Number(width);
const dir = `shots/${label}-${W}`;
mkdirSync(dir, { recursive: true });

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const t = await (await fetch(`${CDP}/json/new?${encodeURIComponent(`${base}/#/portfolio`)}`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);

let id = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
};
await new Promise((r) => (ws.onopen = r));

const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res) => {
    waiting.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
};

const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  return r.result?.result?.value;
};

await send("Runtime.enable", {});
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: 1200,
  deviceScaleFactor: 1,
  mobile: W < 700,
});
await send("Page.navigate", { url: `${base}/#/portfolio` });
await new Promise((r) => setTimeout(r, 5000));

const meta = await evalJs(`JSON.stringify({
  rows: document.querySelectorAll('.pf-row').length,
  cells: document.querySelectorAll('.pf-row__cell').length,
  scrollH: document.documentElement.scrollHeight,
  scrollW: document.documentElement.scrollWidth,
  h1: document.querySelector('.page h1')?.textContent?.trim() ?? null,
  cap: document.querySelector('.pf-cap')?.textContent?.trim().slice(0, 160) ?? null,
  cta: Array.from(document.querySelectorAll('.pf-cta a, .pf-end a, .pf-foot a')).map(a => a.textContent.trim()).slice(0,8),
})`);
console.log(meta);

const m = JSON.parse(meta);
const SLICES = Number(process.env.SLICES || 6);
const STEP = 1150;

for (let i = 0; i < SLICES; i++) {
  const y = i * STEP;
  await evalJs(`window.scrollTo(0, ${y})`);
  await new Promise((r) => setTimeout(r, 800));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const path = `${dir}/${label}-${W}-${String(i).padStart(2, "0")}.png`;
  writeFileSync(path, Buffer.from(shot.result.data, "base64"));
  console.log(path);
}

console.log(`scrollH=${m.scrollH} scrollW=${m.scrollW}`);
process.exit(0);