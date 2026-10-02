/**
 * Baseline capture of the LIVE site at iPhone 16 viewport (393 x 852, dpr 3).
 *
 * Writes to audit-v2/baseline/<route>-<view>.png so the audit mockups have a
 * real "before" to sit next to. Every route, first viewport + full page.
 *
 * Run: node tools/audit2-baseline.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222 + Math.floor(Math.random() * 400);
const ORIGIN = "https://shutterhausvisuals.co.za";
// fileURLToPath, not a manual .pathname strip: the username contains a space,
// which import.meta.url percent-encodes as %20 and mkdir then takes literally.
const OUT = fileURLToPath(new URL("../audit-v2/baseline/", import.meta.url)).replace(/\//g, "\\");
mkdirSync(OUT, { recursive: true });

const ROUTES = ["", "portfolio", "about", "services", "contact"];

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--hide-scrollbars",
  "--disable-gpu",
  "--no-first-run",
  "--user-data-dir=" + (process.env.TMPDIR || ".").replace(/\\/g, "/") + "/audit2-chrome-profile",
  "about:blank",
], { stdio: "ignore" });

const cdp = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome did not come up");
};

const wsUrl = await cdp();
const ws = new WebSocket(wsUrl);
await new Promise((res) => (ws.onopen = res));

let id = 0;
const pending = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) events.push(msg);
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

await S("Page.enable");
await S("Runtime.enable");
await S("Network.enable");
await S("Emulation.setDeviceMetricsOverride", {
  width: 393, height: 852, deviceScaleFactor: 3, mobile: true,
});
await S("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

const shot = async (name, full) => {
  const { data } = await S("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: full,
    ...(full ? { clip: undefined } : {}),
  });
  writeFileSync(OUT + name + ".png", Buffer.from(data, "base64"));
  console.log("  wrote", name + ".png");
};

const measure = async () =>
  S("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const de = document.documentElement;
      const over = de.scrollWidth - de.clientWidth;
      const imgs = [...document.images];
      return {
        title: document.title,
        overflowX: over,
        docHeight: de.scrollHeight,
        images: imgs.length,
        brokenImgs: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
        bytes: performance.getEntriesByType('resource').reduce((s, r) =>
          s + ((r.transferSize || r.encodedBodySize || 0)), 0),
        headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ': ' + h.textContent.trim().slice(0, 48)),
        landmarks: [...document.querySelectorAll('header,nav,main,footer')].map(n => n.tagName.toLowerCase()),
      };
    })()`,
  }).then((r) => r.result.value);

const summary = [];
for (const route of ROUTES) {
  const url = ORIGIN + "/" + route;
  console.log("capturing", url);
  await S("Page.navigate", { url });
  await sleep(3500); // let fonts + images settle
  await S("Runtime.evaluate", { expression: "document.fonts.ready" });
  await sleep(800);
  const name = route || "home";
  summary.push({ route: name, ...(await measure()) });
  await shot(name + "-viewport", false);
  // full page: grow the viewport to the document height
  const h = await S("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true });
  await S("Emulation.setDeviceMetricsOverride", {
    width: 393, height: Math.min(h.result.value + 40, 16000), deviceScaleFactor: 2, mobile: true,
  });
  await sleep(1200);
  await shot(name + "-full", true);
  await S("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
  await sleep(400);
}

writeFileSync(OUT + "baseline.json", JSON.stringify(summary, null, 2));
console.log("\nwrote baseline.json");
console.table(summary.map((s) => ({
  route: s.route, title: (s.title || "").slice(0, 34), overflowX: s.overflowX,
  imgs: s.images, broken: s.brokenImgs, bytes: Math.round(s.bytes / 1024) + "KB", h: s.docHeight,
})));

ws.close();
chrome.kill();
process.exit(0);