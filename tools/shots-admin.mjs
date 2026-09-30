/**
 * Screenshot the admin gate at phone + desktop.
 * Run: node tools/shots-admin.mjs <baseUrl> [outDir]
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const OUT = process.argv[3] ?? "shots/admin";
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { name: "admin-phone-390", w: 390, h: 844, dpr: 3 },
  { name: "admin-desktop-1440", w: 1440, h: 900, dpr: 1 },
];

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

await send("Page.enable");
await send("Runtime.enable");

for (const v of VIEWS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: v.w, height: v.h, deviceScaleFactor: v.dpr, mobile: v.w < 700,
  });
  await send("Page.navigate", { url: BASE + "/admin.html" });
  await sleep(2600);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const file = OUT + "/" + v.name + ".png";
  writeFileSync(file, Buffer.from(shot.result.data, "base64"));
  console.log("SHOT  " + file);
}
ws.close();
