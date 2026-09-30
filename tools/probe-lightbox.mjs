/**
 * Open the lightbox on the real page and check it works and looks right.
 *
 * Nothing in the project's verifier covers the lightbox, and for a
 * photographer it is the most important interaction on the site.
 *
 * Run: node tools/probe-lightbox.mjs <baseUrl>
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/$/, "") + "/";
const OUT = process.argv[3] ?? "shots/lightbox";
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
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const shot = async (name) => {
  const s = await send("Page.captureScreenshot", { format: "png" });
  if (s.result?.data) {
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, "base64"));
    console.log("SHOT  " + OUT + "/" + name + ".png");
  }
};

const fails = [];
const check = (name, ok, detail) => {
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "  — " + detail : ""));
  if (!ok) fails.push(name);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

for (const v of [
  { name: "phone-390", w: 390, h: 844, dpr: 3 },
  { name: "desktop-1440", w: 1440, h: 900, dpr: 1 },
]) {
  console.log("\n--- " + v.name + " ---");
  await send("Emulation.setDeviceMetricsOverride", {
    width: v.w, height: v.h, deviceScaleFactor: v.dpr, mobile: v.w < 700,
  });
  await send("Page.navigate", { url: BASE });
  await sleep(3000);

  // Click the first grid frame the way a visitor would.
  await evaluate(`document.querySelector('.cell img[data-full]').click()`);
  await sleep(1800);

  const open = await evaluate(`(() => {
    const lb = document.querySelector('.lb');
    const im = document.querySelector('.lb__img');
    const cap = document.querySelector('.lb__cap');
    const r = im?.getBoundingClientRect();
    return {
      exists: !!lb,
      visible: !!lb && !lb.hidden,
      bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
      src: (im?.currentSrc || '').split('/').pop(),
      naturalW: im?.naturalWidth,
      naturalH: im?.naturalHeight,
      rendered: r ? Math.round(r.width) + 'x' + Math.round(r.height) : null,
      fitsViewport: r ? r.width <= window.innerWidth + 1 && r.height <= window.innerHeight + 1 : false,
      alt: im?.getAttribute('alt') || '',
      caption: cap?.textContent || '',
      closeVisible: !!document.querySelector('.lb__x') &&
        document.querySelector('.lb__x').getBoundingClientRect().width >= 24,
    };
  })()`);

  check(`${v.name}: lightbox opens`, open.visible === true, JSON.stringify(open).slice(0, 160));
  check(`${v.name}: image actually loaded`, open.naturalW > 0, `natural=${open.naturalW}x${open.naturalH}`);
  check(`${v.name}: fits the viewport`, open.fitsViewport === true, `rendered=${open.rendered} vp=${v.w}x${v.h}`);
  check(`${v.name}: body scroll locked`, open.bodyLocked === true);
  check(`${v.name}: close button is tappable`, open.closeVisible === true);
  check(`${v.name}: frame has alt text`, open.alt.trim().length > 0, `alt="${open.alt}"`);
  await shot(`${v.name}-open`);

  // Next / previous must move to a DIFFERENT frame.
  const before = open.src;
  await evaluate(`document.querySelector('.lb__nav--n').click()`);
  await sleep(1200);
  const after = await evaluate(`(document.querySelector('.lb__img').currentSrc || '').split('/').pop()`);
  check(`${v.name}: next advances`, before !== after, `${before} -> ${after}`);

  // Close returns to the grid.
  await evaluate(`document.querySelector('.lb__x').click()`);
  await sleep(800);
  const closed = await evaluate(`(() => {
    const lb = document.querySelector('.lb');
    return { hidden: lb?.hidden === true, bodyFree: getComputedStyle(document.body).overflow !== 'hidden' };
  })()`);
  check(`${v.name}: close works`, closed.hidden === true, JSON.stringify(closed));
}

ws.close();
console.log("\n" + (fails.length ? "FAILED:\n  - " + fails.join("\n  - ") : "all lightbox checks pass"));
