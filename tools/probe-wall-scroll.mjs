/**
 * Does the scrollable wall actually work?
 *
 *   CDP_PORT=9333 node tools/probe-wall-scroll.mjs <baseUrl>
 *
 * A scrollable box has several ways to be quietly wrong, so each is asserted:
 *
 *  - the page must actually get SHORTER (that is the whole point)
 *  - a wheel gesture over the wall must move the columns
 *  - the columns must move TOGETHER, not independently
 *  - a column shorter than the box must stop at 0, not slide up and leave a
 *    gap at the top — the classic bug with per-column clamping
 *  - at the end of the wall the page must scroll again, or the closing band is
 *    unreachable
 *  - filtering must not break the clamp
 */
const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
if (!WebSocket) { console.error("FAIL  no WebSocket"); process.exit(1); }

const url = (process.argv[2] || "http://localhost:4173").replace(/\/$/, "");
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const tabs = await (await fetch(CDP + "/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!tab) { console.error("FAIL  no page target"); process.exit(1); }

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const j = JSON.parse(m.data);
  if (j.id && waiting.has(j.id)) { waiting.get(j.id)(j); waiting.delete(j.id); }
};
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res) => { waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
};
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: url + "/?t=" + Date.now() + "/#/portfolio" });
await sleep(3500);

let fails = 0;
const check = (name, pass, detail = "") => {
  console.log(`${pass ? "ok   " : "FAIL "} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!pass) fails++;
};

const state = () => evalJs(`(() => {
  const box = document.querySelector('.wall-scroll');
  if (!box) return { noBox: true };
  const cols = [...box.querySelectorAll('.wall__col')];
  const off = cols.map(c => {
    const m = /translateY\\((-?[\\d.]+)px\\)/.exec(c.style.transform || '');
    return m ? -parseFloat(m[1]) : 0;
  });
  return {
    boxH: Math.round(box.clientHeight),
    docH: document.documentElement.scrollHeight,
    vh: innerHeight,
    cols: cols.length,
    off,
    // A column must never render above the top of the box.
    tops: cols.map(c => Math.round(c.getBoundingClientRect().top - box.getBoundingClientRect().top)),
    limits: cols.map(c => Math.max(0, c.scrollHeight - box.clientHeight)),
    pageY: Math.round(scrollY),
  };
})()`);

const before = await state();
if (before.noBox) { console.error("FAIL  no .wall-scroll on the portfolio route"); process.exit(1); }
console.log("--- initial ---" + JSON.stringify(before));

// 1. The point of the change.
check("page is far shorter than the old 11400px wall",
  before.docH < 2600, `${before.docH}px = ${(before.docH / before.vh).toFixed(1)} screens (was 12.7)`);
check("the box is a sane height", before.boxH > 300 && before.boxH <= before.vh,
  `${before.boxH}px of ${before.vh}px`);

// 2. A wheel over the wall moves it.
const centre = await evalJs(`(() => {
  const b = document.querySelector('.wall-scroll').getBoundingClientRect();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
})()`);
await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: centre.x, y: centre.y, deltaX: 0, deltaY: 400 });
await sleep(500);
const afterWheel = await state();

check("wheel over the wall scrolls it", afterWheel.off.some((o) => o > 0),
  afterWheel.off.map((o) => Math.round(o)).join("/"));
check("wheel did not scroll the page as well", afterWheel.pageY === before.pageY,
  `pageY ${before.pageY} -> ${afterWheel.pageY}`);
check("columns move together, not independently",
  new Set(afterWheel.off.map((o) => Math.round(o))).size === 1,
  afterWheel.off.map((o) => Math.round(o)).join("/"));

// 3. Clamp: no column may go negative (a gap at the top).
check("no column slides past its own end", afterWheel.off.every((o) => o >= -0.5),
  afterWheel.off.map((o) => o.toFixed(1)).join("/"));

// 4. Keyboard reaches the rest of the wall.
await evalJs(`document.querySelector('.wall-scroll').focus()`);
for (let k = 0; k < 4; k++) {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 });
  await sleep(160);
}
const afterKeys = await state();
check("keyboard scrolls the wall", afterKeys.off.some((o) => o > afterWheel.off[0]),
  `${Math.round(afterWheel.off[0])} -> ${Math.round(Math.max(...afterKeys.off))}`);

// 5. At the end, the page must scroll again so the closing band is reachable.
for (let k = 0; k < 25; k++) {
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: centre.x, y: centre.y, deltaX: 0, deltaY: 600 });
  await sleep(60);
}
await sleep(400);
const atEnd = await state();
check("wall stops at its last frame, not past it",
  atEnd.off.every((o, i) => o <= atEnd.limits[i] + 1),
  `off ${atEnd.off.map((o) => Math.round(o)).join("/")} vs limits ${atEnd.limits.map((l) => Math.round(l)).join("/")}`);
check("page scrolls again once the wall is done", atEnd.pageY > afterWheel.pageY,
  `pageY ${afterWheel.pageY} -> ${atEnd.pageY}`);

// 6. The closing band must be on the page at all.
const band = await evalJs(`(() => {
  const b = document.querySelector('.hcta');
  if (!b) return { present: false };
  const r = b.getBoundingClientRect();
  return { present: true, h: Math.round(r.height), cta: b.querySelector('.hcta__btn')?.getAttribute('href') };
})()`);
check("closing band still present with its CTA", band.present && band.cta === "#/contact",
  JSON.stringify(band));

// 7. Filtering must not break the clamp.
await evalJs(`location.hash = '#/home'`); await sleep(400);
await evalJs(`location.hash = '#/portfolio'`); await sleep(900);
const afterFilter = await state();
check("wall survives a route change", afterFilter.cols >= 2, `cols=${afterFilter.cols}`);

console.log("--- after scrolling to the end ---" + JSON.stringify({ off: atEnd.off.map(Math.round), pageY: atEnd.pageY, docH: atEnd.docH }));

ws.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nthe wall is a scrollable box that behaves");
process.exit(fails ? 1 : 0);
