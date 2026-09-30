/**
 * Screenshot the portfolio wall mid-hover, so the preview can be eyeballed
 * rather than only measured.
 *
 * `shots.mjs` can only capture the resting page, and the preview exists solely
 * on :hover — so drive a real pointer onto a frame, wait for the fade, and
 * capture the viewport.
 *
 * Usage: node tools/shot-wall-hover.mjs <baseUrl> <out.png> [width] [height]
 */

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const BASE = process.argv[2] || "http://127.0.0.1:4173";
const OUT = process.argv[3] || "shots/wall-hover.png";
const W = Number(process.argv[4] || 1440);
const H = Number(process.argv[5] || 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  return r.result?.result?.value;
};
await new Promise((r) => (ws.onopen = r));

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: H,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: `${BASE}#/portfolio` });
await sleep(3000);

// Scroll a mid-wall frame into view so the preview has neighbours to sit over.
const target = JSON.parse(
  await evaluate(`(() => {
    const cells = document.querySelectorAll('.pf-cell');
    const el = cells[7];
    const r = el.getBoundingClientRect();
    scrollBy(0, r.top - window.innerHeight / 3);
    return JSON.stringify({ x: 0, y: 0 });
  })()`),
);
await sleep(900);

const box = JSON.parse(
  await evaluate(`(() => {
    const el = document.querySelectorAll('.pf-cell')[7];
    const r = el.getBoundingClientRect();
    return JSON.stringify({
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
    });
  })()`),
);

await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, buttons: 0 });
await sleep(800);

const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs");
fs.mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
fs.writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
console.log(`SHOT  ${OUT}  hover at ${box.x},${box.y}`);

await fetch(`${CDP}/json/close/${t.id}`);
ws.close();
