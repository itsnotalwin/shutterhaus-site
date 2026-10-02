/**
 * How do the four package cards actually measure now, and does the pinned
 * family photograph fit the slot without cropping a face?
 *
 * Reports each card's figure box, the image's natural size, whether the image
 * is being scaled UP (blurry) or cropped, and where the subject sits relative
 * to the rendered box. Mobile-first: 393 is the priority, desktop is reported
 * for comparison.
 *
 * Run: node tools/audit3-cards.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
mkdirSync("audit-v2/audit3", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// This Chrome has ~28 tabs open from earlier runs and two agents working in
// parallel. `json/list` + `.find(type === "page")` returns whichever tab is
// first in the list, NOT one this script controls — which silently produced
// results from a stale page and made the services route look broken when it
// was fine. Open a dedicated tab and use only that.
const created = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const targets = [created];
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
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

const PROBE = `(() => {
  const cs = el => getComputedStyle(el);
  return [...document.querySelectorAll('.pkg')].map(card => {
    const fig = card.querySelector('.pkg__fig');
    const img = card.querySelector('.pkg__fig img');
    if (!fig || !img) return { name: card.querySelector('.pkg__name')?.textContent, noFigure: true };
    const fr = fig.getBoundingClientRect(), ir = img.getBoundingClientRect();
    const c = cs(img);
    const natAR = img.naturalWidth / Math.max(img.naturalHeight, 1);
    const boxAR = fr.width / Math.max(fr.height, 1);
    return {
      name: card.querySelector('.pkg__name')?.textContent,
      popular: card.classList.contains('pkg--pop'),
      figBox: Math.round(fr.width) + 'x' + Math.round(fr.height),
      figAspect: +boxAR.toFixed(3),
      natural: img.naturalWidth + 'x' + img.naturalHeight,
      naturalAspect: +natAR.toFixed(3),
      objectFit: c.objectFit, objectPosition: c.objectPosition,
      // rendered CSS box the img actually occupies
      imgBox: Math.round(ir.width) + 'x' + Math.round(ir.height),
      // is the browser scaling a smaller image UP into the box? blurry.
      upscaled: img.naturalWidth > 0 && ir.width > img.naturalWidth,
      upscaledBy: img.naturalWidth > 0 ? +(ir.width / img.naturalWidth).toFixed(2) : 0,
      // is content being cut? cover + mismatched aspect means yes.
      cropped: c.objectFit === 'cover' && Math.abs(boxAR - natAR) > 0.02,
      chosen: (img.currentSrc || img.src).split('/').pop(),
      "focal": fig.style.getPropertyValue('--focal') || null,
    };
  });
})()`;

for (const w of [393, 768, 1440]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w, height: w < 700 ? 852 : 900, deviceScaleFactor: w < 700 ? 2 : 1, mobile: w < 700 });
  await send("Page.navigate", { url: `${ORIGIN}/services` });
  await sleep(2800);
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: PROBE });
  const cards = r.result.value;
  console.log(`\n================ ${w}px ================`);
  for (const c of cards) {
    if (c.noFigure) { console.log(`  ${c.name}: NO FIGURE`); continue; }
    console.log(`  ${String(c.name).padEnd(10)} ${c.popular ? "POP " : "    "} fig=${String(c.figBox).padEnd(10)} boxAR=${String(c.figAspect).padEnd(6)} nat=${String(c.natural).padEnd(11)} natAR=${String(c.naturalAspect).padEnd(6)}`);
    console.log(`      fit=${c.objectFit.padEnd(8)} pos=${c.objectPosition.padEnd(10)} focal=${c.focal} cropped=${c.cropped} upscaled=${c.upscaled} (x${c.upscaledBy})  ${c.chosen}`);
  }
  const heights = cards.filter(c => !c.noFigure).map(c => parseInt(c.figBox.split("x")[1]));
  if (heights.length) console.log(`  figure heights: ${heights.join(", ")}  spread=${Math.max(...heights) - Math.min(...heights)}px`);

  if (w === 393) {
    const { data } = await send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 393, height: 2600, scale: 1 },
    });
    writeFileSync("audit-v2/audit3/cards-393.png", Buffer.from(data, "base64"));
    console.log("  -> audit-v2/audit3/cards-393.png");
  }
}
ws.close();
process.exit(0);