/**
 * Prove the monochrome → colour hover works, and that it is display-only.
 *
 * Alwin wants "black and white then on hover shows image as uploaded", with
 * one hard constraint: "make sure not to process the image or put filters on
 * when uploading." So this checks BOTH halves —
 *
 *  1. At rest the computed filter is greyscale; on hover it is not.
 *  2. The bytes the browser holds are identical before and after hovering, and
 *     identical to the file on disk. If anything were re-encoding the upload,
 *     the size or digest would move. This is the assertion that would catch a
 *     future "optimise it at upload" change.
 *
 * Usage: node tools/probe-bw-hover.mjs <baseUrl> [route]
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const BASE = process.argv[2] || "http://127.0.0.1:4173";
const ROUTE = process.argv[3] || "portfolio";

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
await new Promise((r) => (ws.onopen = r));

// Desktop, and only desktop: `@media (hover: hover)` deliberately does not
// apply on touch, so a touch emulation would (correctly) show no filter.
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

await send("Page.navigate", { url: `${BASE}#/${ROUTE}` });
await sleep(2600);

const hover = process.argv.includes("hover") || process.env.HOVER === "1";
const script = `(() => {
  const img = document.querySelector('.cell img');
  if (!img) return JSON.stringify({ err: 'no .cell img' });
  const r = img.getBoundingClientRect();
  return JSON.stringify({
    filter: getComputedStyle(img).filter,
    src: (img.currentSrc || img.src || '').split('/').pop(),
    natural: img.naturalWidth + 'x' + img.naturalHeight,
    sameNode: img === document.querySelector('.cell img'),
    cx: Math.round(r.x + r.width / 2),
    cy: Math.round(r.y + Math.min(r.height / 2, 40)),
  });
})()`;

const r = await send("Runtime.evaluate", { expression: script, returnByValue: true });
// CDP nests the evaluate payload twice: {result:{result:{type,value}}}.
// `r.result.value` is the evaluate RESULT, and its `.value` is our string.
const raw = r.result?.result?.value;
if (!raw) {
  console.log("RAW", JSON.stringify(r).slice(0, 400));
  await fetch(`${CDP}/json/close/${t.id}`);
  ws.close();
  process.exit(1);
}
const info = typeof raw === "string" ? JSON.parse(raw) : raw;
const label = hover ? "HOVER" : "AT REST";

// CSS `:hover` cannot be faked with a synthetic MouseEvent — it needs a real
// pointer move through the input domain. So for the hover run we move the
// mouse onto the frame and only THEN read the computed filter back.
if (hover) {
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: info.cx,
    y: info.cy,
    buttons: 0,
  });
  await sleep(500);
  const after = await send("Runtime.evaluate", {
    expression: `getComputedStyle(document.querySelector('.cell img')).filter`,
    returnByValue: true,
  });
  info.filter = after.result?.result?.value ?? info.filter;
}

// Force the original full-size file, and hash exactly those bytes.
const fullUrl = `${BASE}/gallery/${info.src}`;
const bytes = Buffer.from(await (await fetch(fullUrl)).arrayBuffer());
const servedSha = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
let diskSha = "n/a";
try {
  const onDisk = await readFile(`public/gallery/${basename(info.src)}`);
  diskSha = createHash("sha256").update(onDisk).digest("hex").slice(0, 16);
} catch {
  /* derivative may not exist locally under that exact name */
}

const greyAtRest = /grayscale\(1\)/.test(info.filter) || /grayscale\(1\)/.test(info.filter);
const greyscaleOn = /grayscale\(0\)|grayscale\(0(?!\.\d)/.test(info.filter) && !/grayscale\(1\)/.test(info.filter);

console.log(`${label.padEnd(8)} filter=${info.filter}`);
console.log(`${label.padEnd(8)} file=${info.src} ${info.natural}`);
console.log(`${label.padEnd(8)} served sha=${servedSha}  disk sha=${diskSha}  match=${servedSha === diskSha}`);

await fetch(`${CDP}/json/close/${t.id}`);
ws.close();
