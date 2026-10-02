/**
 * Final visual confirmation of the built site at iPhone 16 and desktop.
 *
 * Run: node tools/audit2-final-shots.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
const OUT = "audit-v2/after";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
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
await send("Page.enable"); await send("Runtime.enable");

const SHOTS = [
  ["home", "/", 393, 852, 3, false],
  ["services", "/services", 393, 852, 3, true],
  ["contact", "/contact", 393, 852, 3, true],
  ["portfolio", "/portfolio", 393, 852, 3, false],
  ["home-desktop", "/", 1440, 900, 1, true],
  ["portfolio-desktop", "/portfolio", 1440, 900, 1, false],
];

for (const [name, route, w, h, dpr, full] of SHOTS) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 700 });
  await send("Page.navigate", { url: ORIGIN + route });
  await sleep(3500);
  await send("Runtime.evaluate", { expression: "document.fonts.ready" });
  await sleep(900);
  const target = full
    ? await send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true })
    : null;
  if (target) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w, height: Math.min(target.result.value + 40, 16000), deviceScaleFactor: 1, mobile: w < 700 });
    await sleep(1400);
  }
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log(`  ${name.padEnd(20)} ${target ? target.result.value + "px tall" : "viewport"}  ->  ${OUT}/${name}.png`);
}
ws.close();
process.exit(0);