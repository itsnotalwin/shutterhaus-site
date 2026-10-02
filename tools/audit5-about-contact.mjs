/**
 * About and contact, measured at phone and desktop, after the image swap.
 *
 * Two things to confirm:
 *   1. /about now shows 55-metal-detector — Alwin, not a model — and it is NOT
 *      cropped (object-fit must not be cover, and the rendered box must match the
 *      file's natural ratio).
 *   2. /contact has no photograph at all, and its form/details get the width the
 *      freed column used to take.
 *
 * Run: node tools/audit5-about-contact.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
mkdirSync("audit-v2/audit5", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const created = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
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
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });

const ABOUT = `(() => {
  const img = document.querySelector(".about__fig img");
  const box = document.querySelector(".about__fig")?.getBoundingClientRect();
  if (!img) return { noFigure: true };
  const b = img.getBoundingClientRect(), c = getComputedStyle(img);
  return {
    src: (img.currentSrc || img.src).split("/").pop(),
    alt: img.alt.slice(0, 60),
    natural: img.naturalWidth + "x" + img.naturalHeight,
    naturalAR: +(img.naturalWidth / Math.max(img.naturalHeight, 1)).toFixed(3),
    rendered: Math.round(b.width) + "x" + Math.round(b.height),
    renderedAR: +(b.width / Math.max(b.height, 1)).toFixed(3),
    objectFit: c.objectFit,
    // a crop shows up as the rendered aspect differing from the file's
    cropped: Math.abs(b.width / Math.max(b.height, 1) - img.naturalWidth / img.naturalHeight) > 0.02,
    figWidth: box ? Math.round(box.width) : null,
  };
})()`;

const CONTACT = `(() => {
  const imgs = [...document.querySelectorAll("img")];
  const form = document.querySelector(".cform")?.getBoundingClientRect();
  const list = document.querySelector(".contact__list")?.getBoundingClientRect();
  const cols = getComputedStyle(document.querySelector(".contact")).gridTemplateColumns;
  return {
    imagesOnPage: imgs.length,
    figureStillThere: !!document.querySelector(".contact__fig"),
    gridCols: cols,
    formWidth: form ? Math.round(form.width) : null,
    detailsWidth: list ? Math.round(list.width) : null,
    docH: document.documentElement.scrollHeight,
  };
})()`;

for (const w of [393, 1440]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w, height: w < 700 ? 852 : 900, deviceScaleFactor: w < 700 ? 2 : 1, mobile: w < 700 });

  await send("Page.navigate", { url: `${ORIGIN}/about` });
  await sleep(3000);
  const a = await send("Runtime.evaluate", { returnByValue: true, expression: ABOUT });
  console.log(`\n=== /about @${w} ===`);
  console.log("  " + JSON.stringify(a.result.value, null, 2).replace(/\n/g, "\n  "));

  await send("Page.navigate", { url: `${ORIGIN}/contact` });
  await sleep(2800);
  const c = await send("Runtime.evaluate", { returnByValue: true, expression: CONTACT });
  console.log(`\n=== /contact @${w} ===`);
  console.log("  " + JSON.stringify(c.result.value, null, 2).replace(/\n/g, "\n  "));

  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`audit-v2/audit5/shot-${w}-contact.png`, Buffer.from(data, "base64"));
}
ws.close();
process.exit(0);