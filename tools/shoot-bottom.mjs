/**
 * Screenshot the BOTTOM of a page, not a fixed slice from the top.
 *
 * Why: tools/shoot-pf.mjs slices from the top and stops after 6 slices. The
 * portfolio page is ~11400px tall, so all 6 land inside the photo wall and the
 * closing band is never captured. This scrolled to the end first.
 *
 *   CDP_PORT=9333 node tools/shoot-bottom.mjs <baseUrl> <width> <label> [hash]
 */
import { connect } from "node:net";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const [, , base = "http://localhost:4173", width = "1440", label = "bottom", hash = "#/portfolio"] =
  process.argv;
const W = Number(width);
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9333);

const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
if (!WebSocket) {
  console.error("FAIL  no WebSocket available");
  process.exit(1);
}

const list = await (await fetch(CDP + "/json/list")).json();
const target = list.find((t) => t.type === "page");
if (!target) {
  console.error("FAIL  no page target");
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
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

await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: 1200,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: base + "/" + hash });
await new Promise((r) => setTimeout(r, 4500));

// Scroll in steps so lazy images below the fold actually load, then return to
// the very end. A single scrollTo skips the intermediate intersection events
// the loading observer is watching for.
const h = await evalJs("document.body.scrollHeight");
for (let y = 0; y < h; y += 900) {
  await evalJs(`scrollTo(0, ${y})`);
  await new Promise((r) => setTimeout(r, 120));
}
await evalJs("scrollTo(0, document.body.scrollHeight)");
await new Promise((r) => setTimeout(r, 2500));

const dir = `shots/${label}-bottom`;
mkdirSync(dir, { recursive: true });
const shot = await send("Page.captureScreenshot", { format: "png" });
const path = `${dir}/bottom.png`;
writeFileSync(path, Buffer.from(shot.result.data, "base64"));

const info = await evalJs(`JSON.stringify({
  scrollH: document.body.scrollHeight,
  y: Math.round(scrollY),
  band: !!document.querySelector('.hcta'),
  bandText: document.querySelector('.hcta')?.innerText?.slice(0, 90) ?? null,
})`);
console.log(path);
console.log(info);
ws.close();
