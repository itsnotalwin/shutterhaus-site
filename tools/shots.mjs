/**
 * Screenshot the live/local site at phone and desktop sizes.
 *
 * Usage: node tools/shots.mjs <baseUrl> [outDir]
 * Needs Chrome on CDP_PORT (default 9222) with a fresh --user-data-dir.
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const OUT = process.argv[3] ?? "shots/mobile-pass";
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// Every route across the viewports that actually break layouts. The first
// pass only covered 5 of these 13, which is how a clipped header survived
// into the commit — a route/viewport nobody looked at.
const VIEWS = [
  { name: "phone-360-photo", w: 360, h: 740, route: "", dpr: 3 },
  { name: "phone-390-photo", w: 390, h: 844, route: "", dpr: 3 },
  { name: "phone-360-pricing", w: 360, h: 740, route: "#/pricing", dpr: 3 },
  { name: "phone-390-pricing", w: 390, h: 844, route: "#/pricing", dpr: 3 },
  { name: "phone-360-contact", w: 360, h: 740, route: "#/contact", dpr: 3 },
  { name: "phone-390-contact", w: 390, h: 844, route: "#/contact", dpr: 3 },
  { name: "tablet-768-photo", w: 768, h: 1024, route: "", dpr: 2 },
  { name: "tablet-768-pricing", w: 768, h: 1024, route: "#/pricing", dpr: 2 },
  { name: "tablet-768-contact", w: 768, h: 1024, route: "#/contact", dpr: 2 },
  { name: "desktop-1024-photo", w: 1024, h: 768, route: "", dpr: 1 },
  { name: "desktop-1440-photo", w: 1440, h: 900, route: "", dpr: 1 },
  { name: "desktop-1440-pricing", w: 1440, h: 900, route: "#/pricing", dpr: 1 },
  { name: "desktop-1440-contact", w: 1440, h: 900, route: "#/contact", dpr: 1 },
];

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

// Every domain FIRST, then navigate. Enabling after races the frame and
// Runtime.evaluate lands on about:blank.
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

for (const v of VIEWS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: v.w,
    height: v.h,
    deviceScaleFactor: v.dpr,
    mobile: v.w < 700,
  });
  await send("Page.navigate", { url: BASE + "/" + v.route });
  await sleep(2000);
  // Scroll the full page so lazy images below the fold are actually fetched,
  // then return to the top. Without this a screenshot captures empty
  // placeholders and looks like a broken site when it isn't one.
  await send("Runtime.evaluate", {
    expression:
      "new Promise(r=>{const h=document.documentElement.scrollHeight;" +
      "window.scrollTo(0,h);setTimeout(()=>{window.scrollTo(0,0);r(1)},1500)})",
    awaitPromise: true,
  });
  await sleep(1800);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  if (!shot.result?.data) {
    console.log("FAIL  " + v.name + " — no screenshot");
    continue;
  }
  const file = OUT + "/" + v.name + ".png";
  writeFileSync(file, Buffer.from(shot.result.data, "base64"));
  console.log("SHOT  " + file);
}
ws.close();
