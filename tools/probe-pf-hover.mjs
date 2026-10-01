/**
 * Prove the portfolio wall no longer changes size on hover.
 *
 * Alwin, 2026-10-01: "when i hover it destroys the crop, lets not make the image
 * bigger or blow up on hover, make it like the home page images".
 *
 * Before the removal this measured a 247px thumbnail replaced by a 492px
 * overlay — a clean 2x — with the thumbnail underneath set to opacity 0.
 *
 * The assertion is that hovering changes NOTHING about the frame's geometry:
 * not its width, not its height, not the row it sits in. If a preview ever
 * comes back, this fails, which is the point.
 *
 * usage: CDP_PORT=9333 node tools/probe-pf-hover.mjs <baseUrl>
 */

const url = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);

const t = await (
  await fetch(`${CDP}/json/new?${encodeURIComponent(url + "/#/portfolio")}`, { method: "PUT" })
).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);

let id = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
};
await new Promise((r) => (ws.onopen = r));

const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res) => {
    waiting.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
};

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  return r.result?.result?.value;
};

await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Runtime.enable", {});
await send("Page.navigate", { url: url + "/#/portfolio" });
await new Promise((r) => setTimeout(r, 3000));

const box = `(() => {
  const cell = document.querySelector('.pf-cell');
  if (!cell) return null;
  const img = cell.querySelector('.cell img');
  const row = cell.closest('.pf-row');
  const r = img.getBoundingClientRect();
  return {
    x: Math.round(r.x), y: Math.round(r.y),
    w: Math.round(r.width), h: Math.round(r.height),
    rowW: Math.round(row.getBoundingClientRect().width),
    rowH: Math.round(row.getBoundingClientRect().height),
    rowId: Array.from(document.querySelectorAll('.pf-row')).indexOf(row),
    filter: getComputedStyle(img).filter,
    op: getComputedStyle(img).opacity,
    transform: getComputedStyle(img).transform,
    peeks: document.querySelectorAll('.pf-peek').length,
    imgsPerCell: cell.querySelectorAll('img').length,
  };
})()`;

const before = await evaluate(box);
if (!before) {
  console.error("FAIL  no .pf-cell on the portfolio route");
  process.exit(1);
}

// The blown-up box is whatever is VISIBLE in the cell at hover time, which is
// not necessarily the thumbnail. Measuring only `img` inside `.cell` passed
// even with the whole preview restored, because the peek img lives in a SIBLING
// `.pf-peek` span: the thumbnail simply sat at opacity 0 while a 492px overlay
// covered the row. So also measure the cell's own painted content and the row's
// visible extent, and compare the union of what is on screen before vs during.
const cellBox = `(() => {
  const cell = document.querySelector('.pf-cell');
  const row = cell.closest('.pf-row');
  const vis = [...cell.querySelectorAll('*')].filter((el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && Number(s.opacity) > 0.05 &&
           /IMG|SPAN/.test(el.tagName);
  });
  const rects = vis.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
  return {
    maxW: Math.round(Math.max(0, ...rects.map((r) => r.width))),
    maxH: Math.round(Math.max(0, ...rects.map((r) => r.height))),
    n: rects.length,
  };
})()`;

const cellBefore = await evaluate(cellBox);
const cx = before.x + before.w / 2;
const cy = before.y + before.h / 2;
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy });
await new Promise((r) => setTimeout(r, 500));

const during = await evaluate(box);

const cellDuring = await evaluate(cellBox);
let fails = 0;
const check = (name, pass, detail = "") => {
  if (!pass) fails++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

console.log(`before hover: ${JSON.stringify(before)}`);
console.log(`during hover: ${JSON.stringify(during)}\n`);

check("no preview element exists", before.peeks === 0, `${before.peeks} found`);
check("one <img> per cell", before.imgsPerCell === 1, `${before.imgsPerCell}`);
// The assertion that would have caught the original bug: nothing inside the
// cell gets LARGER on hover. Measuring only the thumbnail missed this, because
// the overlay was a sibling element covering it.
check(
  "nothing in the cell grows on hover",
  cellDuring.maxW <= cellBefore.maxW && cellDuring.maxH <= cellBefore.maxH,
  `${cellBefore.maxW}x${cellBefore.maxH} -> ${cellDuring.maxW}x${cellDuring.maxH}`,
);
check(
  "no extra visible box appears",
  cellDuring.n <= cellBefore.n,
  `${cellBefore.n} -> ${cellDuring.n} visible`,
);
check("width unchanged on hover", during.w === before.w, `${before.w} -> ${during.w}`);
check("height unchanged on hover", during.h === before.h, `${before.h} -> ${during.h}`);
check("position unchanged on hover", during.x === before.x && during.y === before.y,
  `${before.x},${before.y} -> ${during.x},${during.y}`);
check("still the same row", during.rowId === before.rowId, `${before.rowId} -> ${during.rowId}`);
check("row height unchanged", during.rowH === before.rowH, `${before.rowH} -> ${during.rowH}`);
check("no scale transform", during.transform === "none" || during.transform === "matrix(1, 0, 0, 1, 0, 0)", during.transform);
// The frame must stay VISIBLE, i.e. not hidden to make room for an overlay.
// It is NOT expected to stay at opacity 1: `.cell img.is-loaded:hover` in
// styles.css sets 0.92, and that rule is shared with the home strip — so the
// home page dims its frames on hover too. Asserting 1 here would have demanded
// the portfolio behave DIFFERENTLY from the page Alwin asked it to match.
// An earlier version of this probe did exactly that and failed for the wrong
// reason. A fully hidden frame is 0.
check("frame not hidden", Number(during.op) > 0.5, during.op);
// The home treatment: monochrome at rest, full colour under the cursor.
const grey = /grayscale\(1\)/.test(before.filter);
const colour = /grayscale\(0\)/.test(during.filter) || during.filter === "none";
check("monochrome at rest (home treatment)", grey, before.filter);
check("colour on hover (home treatment)", colour, during.filter);

console.log(fails ? `\n${fails} check(s) failed` : "\nhover changes nothing about the frame");
process.exit(fails ? 1 : 0);