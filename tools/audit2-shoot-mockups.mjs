/**
 * Screenshot mockups-v2/*.html so the artefacts can be eyeballed, not assumed.
 * Renders each mockup full-page at a desktop width.
 *
 * Run: node tools/audit2-shoot-mockups.mjs
 */
import { writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ROOT = resolve("C:/Users/Operations 3/Documents/WEBSITE/shutterhaus-site");
const DIR = resolve(ROOT, "mockups-v2");
const OUT = resolve(ROOT, "audit-v2/mockups");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = await (await fetch(`${CDP}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
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
await send("Page.enable");
await send("Runtime.enable");

const files = readdirSync(DIR).filter((f) => f.endsWith(".html")).sort();
console.log("mockups found:", files.join(", ") || "(none yet)");

for (const f of files) {
  const url = "file:///" + resolve(DIR, f).replace(/\\/g, "/");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url });
  await sleep(2500);
  const h = await send("Runtime.evaluate", {
    expression: "document.documentElement.scrollHeight", returnByValue: true,
  });
  const height = Math.min(h.result.value + 40, 15000);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(1200);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const out = resolve(OUT, f.replace(/\.html$/, ".png"));
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log(`  ${f}  ->  ${height}px tall  ->  audit-v2/mockups/${f.replace(/\.html$/, ".png")}`);
}
ws.close();
process.exit(0);