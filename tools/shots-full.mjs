/**
 * Screenshot the FULL page (not just the viewport) so footers and anything
 * below the fold are actually reviewable.
 *
 * Run: node tools/shots-full.mjs <baseUrl> <route> <outName> [width] [height]
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/$/, "");
const ROUTE = process.argv[3] ?? "";
const NAME = process.argv[4] ?? "full";
const W = Number(process.argv[5] ?? 390);
const H = Number(process.argv[6] ?? 844);
const OUT = "shots/full";
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

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

// Every domain FIRST, then navigate — the race verify.mjs documents.
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: W, height: H, deviceScaleFactor: 2, mobile: W < 700,
});
await send("Page.navigate", { url: BASE + "/" + ROUTE });
await sleep(2500);
await send("Runtime.evaluate", {
  expression: "new Promise(r=>{const h=document.documentElement.scrollHeight;window.scrollTo(0,h);setTimeout(()=>{window.scrollTo(0,0);r(1)},1200)})",
  awaitPromise: true,
});
await sleep(1500);
// captureBeyondViewport is the whole point: it renders the full document
// height instead of clipping to the emulated viewport.
const shot = await send("Page.captureScreenshot", {
  format: "png", captureBeyondViewport: true,
});
if (!shot.result?.data) { console.log("FAIL no screenshot"); process.exit(1); }
const file = OUT + "/" + NAME + ".png";
writeFileSync(file, Buffer.from(shot.result.data, "base64"));
const h = await send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight" });
console.log("SHOT  " + file + "  docHeight=" + h.result.result.value);
ws.close();
