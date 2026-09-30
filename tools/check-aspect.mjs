/**
 * Guard against the squish bug returning.
 *
 * Two ways a photo gets distorted here, and both are silent:
 *   1. a wrong width/height in the `photos` table (aspect-ratio inline style
 *      overrides the real shape) — this is how finals-34 shipped as a SQUARE;
 *   2. a flex container stretching <figure> so `height: auto` resolves against
 *      a box that isn't the image's own shape.
 *
 * Compares the DB's declared ratio against the rendered box, on the LIVE site.
 * Run: node tools/check-aspect.mjs <baseUrl>
 */
const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/$/, "");
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");

let bad = 0;
for (const w of [390, 768, 1440]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: 900,
    deviceScaleFactor: 1,
    mobile: w < 700,
  });
  await send("Page.navigate", { url: BASE + "/#/photo" });
  await sleep(2500);
  const rows = await evaluate(`[...document.querySelectorAll('.cell img')].map(i => {
    const r = i.getBoundingClientRect();
    const nat = i.naturalWidth / i.naturalHeight;
    const ren = r.width / r.height;
    // 2% tolerance: subpixel rounding on fractional layout widths is normal.
    return { src: (i.currentSrc||i.src).split('/').pop(), nat: +nat.toFixed(3),
             ren: +ren.toFixed(3), drift: +(Math.abs(nat-ren)/nat*100).toFixed(1),
             style: i.getAttribute('style') || '' };
  })`);
  console.log(`\n--- ${w}px ---`);
  for (const r of rows) {
    const ok = r.drift <= 2;
    if (!ok) bad++;
    console.log(
      `  ${ok ? "ok  " : "FAIL"} ${r.src.padEnd(24)} natural=${r.nat} rendered=${r.ren} drift=${r.drift}%${r.style ? "  " + r.style : ""}`,
    );
  }
}
ws.close();
console.log(bad === 0 ? "\nall images keep their true aspect ratio" : `\n${bad} DISTORTED`);
process.exit(bad === 0 ? 0 : 1);
