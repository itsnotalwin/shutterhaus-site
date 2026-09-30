/**
 * Does the portfolio wall's hover preview actually work, and is it off on touch?
 *
 * Alwin: "yes, but only on phones — desktop opens on hover." The preview is
 * pure CSS keyed on `:hover`, which means two separate claims to verify:
 *
 *  1. On a pointer device, hovering a wall frame shows the LARGER copy.
 *  2. On a touch-emulated device it does NOT — otherwise a phone would show
 *     a stuck-open preview over the thumbnail with nothing to dismiss it.
 *
 * Also asserts the locked home page is untouched, because the `.cell`
 * greyscale rule and the strip markup are shared with this wall.
 *
 * Usage: node tools/probe-wall-hover.mjs <baseUrl>
 */

import { createHash } from "node:crypto";

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const BASE = process.argv[2] || "http://127.0.0.1:4173";
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

const results = [];
const check = (ok, label) => {
  results.push({ ok, label });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}`);
};

// ---------------------------------------------------------------- pointer
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: `${BASE}#/portfolio` });
await sleep(3000);

const before = JSON.parse(
  await evaluate(`(() => {
    const cell = document.querySelector('.pf-cell');
    if (!cell) return JSON.stringify({ err: 'no .pf-cell' });
    const peek = cell.querySelector('.pf-peek img');
    return JSON.stringify({
      peekDisplay: getComputedStyle(cell.querySelector('.pf-peek')).display,
      thumbVisible: getComputedStyle(cell.querySelector('picture')).opacity,
      peekW: peek ? Math.round(peek.getBoundingClientRect().width) : 0,
      thumbW: Math.round(cell.querySelector('picture').getBoundingClientRect().width),
      wallCols: document.querySelectorAll('.grid--wall > .col').length,
      cells: document.querySelectorAll('.pf-cell').length,
      peeks: document.querySelectorAll('.pf-peek img').length,
    });
  })()`),
);
console.log(`before hover: ${JSON.stringify(before)}`);
check(before.wallCols === 3, `desktop wall is 3 columns (got ${before.wallCols})`);
check(before.cells === 50, `wall renders 50 cells (got ${before.cells})`);
check(before.peekDisplay === "none", "preview hidden at rest");

// Real pointer move — a synthetic MouseEvent cannot trigger CSS :hover.
const box = JSON.parse(
  await evaluate(`(() => {
    const r = document.querySelector('.pf-cell').getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
  })()`),
);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, buttons: 0 });
await sleep(500);

const after = JSON.parse(
  await evaluate(`(() => {
    const cell = document.querySelector('.pf-cell');
    const peek = cell.querySelector('.pf-peek img');
    return JSON.stringify({
      peekDisplay: getComputedStyle(cell.querySelector('.pf-peek')).display,
      // The fade is applied to the .cell figure (see editorial.css), so read
      // opacity from there rather than from the nested picture element.
      thumbOpacity: getComputedStyle(cell.querySelector('.cell')).opacity,
      peekW: Math.round(peek.getBoundingClientRect().width),
      peekLoaded: peek.complete && peek.naturalWidth > 0,
    });
  })()`),
);
console.log(`on hover:    ${JSON.stringify(after)}`);
check(after.peekDisplay !== "none", "preview VISIBLE on hover (desktop)");
check(after.peekLoaded === true, "preview image actually loaded");
check(
  after.peekW > before.thumbW,
  `preview is larger than the thumb (${after.peekW} > ${before.thumbW})`,
);
check(Number(after.thumbOpacity) === 0, "thumbnail hidden while preview shows");

// ------------------------------------------------------------------ touch
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Page.navigate", { url: `${BASE}#/portfolio` });
await sleep(3000);

const touch = JSON.parse(
  await evaluate(`(() => {
    const cell = document.querySelector('.pf-cell');
    return JSON.stringify({
      wallCols: document.querySelectorAll('.grid--wall > .col').length,
      peekDisplay: getComputedStyle(cell.querySelector('.pf-peek')).display,
      hoversAvailable: matchMedia('(hover: hover)').matches,
      docH: document.documentElement.scrollHeight,
    });
  })()`),
);
console.log(`touch:       ${JSON.stringify(touch)}`);
check(touch.wallCols === 2, `mobile wall is 2 columns (got ${touch.wallCols})`);
check(touch.hoversAvailable === false, "touch device reports no hover capability");
check(touch.peekDisplay === "none", "preview never shown on touch");

// ------------------------------------------------------- home page intact
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: `${BASE}#/home` });
await sleep(2500);
const home = JSON.parse(
  await evaluate(`(() => {
    const strip = document.querySelector('.hstrip__grid');
    return JSON.stringify({
      peeks: document.querySelectorAll('.pf-peek').length,
      stripFrames: strip ? strip.querySelectorAll('.cell').length : 0,
      stripCols: strip ? strip.querySelectorAll('.hstrip__col').length : 0,
    });
  })()`),
);
console.log(`home:        ${JSON.stringify(home)}`);
check(home.peeks === 0, "home strip gained no preview elements");
check(home.stripFrames === 6, `home still has 6 strip frames (got ${home.stripFrames})`);
check(home.stripCols === 2, `home still has 2 strip columns (got ${home.stripCols})`);

await fetch(`${CDP}/json/close/${t.id}`);
ws.close();

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length
    ? `\n${failed.length} check(s) failed`
    : `\nall ${results.length} wall checks passed`,
);
process.exit(failed.length ? 1 : 0);
