/**
 * Do the wall's three columns scroll INDEPENDENTLY, and is the page short?
 *
 *   CDP_PORT=9333 node tools/probe-wall-scroll.mjs <baseUrl>
 *
 * THIS ASSERTS INDEPENDENCE EXPLICITLY. The first version of this probe drove
 * a single JS wheel handler that moved all three columns together, then asserted
 * "columns move together" — so it passed green while the thing Alwin asked for
 * twice was absent. A test written from the implementation rather than from the
 * request cannot catch the implementation being wrong.
 *
 * Native per-column scrolling, no JS, same as the locked home page's `.col`.
 */

const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
if (!WebSocket) { console.error("FAIL  no WebSocket"); process.exit(1); }

const url = (process.argv[2] || "http://localhost:4173").replace(/\/$/, "");
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(CDP + "/json/list")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res) => { waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
};
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text || "eval threw");
  return r.result?.result?.value;
};

await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/portfolio" });
await sleep(3000);

let fails = 0;
const check = (name, pass, detail = "") => {
  if (pass) { console.log("ok    " + name + (detail ? "  (" + detail + ")" : "")); return; }
  fails++;
  console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
};

const state = () => evalJs(`(() => {
  const cols = [...document.querySelectorAll('.wall__col')];
  const box = cols[0]?.parentElement;
  return {
    docH: document.documentElement.scrollHeight,
    vh: innerHeight,
    cols: cols.length,
    off: cols.map(c => Math.round(c.scrollTop)),
    limits: cols.map(c => Math.max(0, c.scrollHeight - c.clientHeight)),
    boxH: box ? Math.round(box.getBoundingClientRect().height) : -1,
    cells: document.querySelectorAll('.pf-cell').length,
    band: !!document.querySelector('.hcta'),
    pageY: Math.round(scrollY),
  };
})()`);

/** Wheel over one column by its centre x. */
async function wheelOverCol(i, dy) {
  const box = await evalJs(`(() => {
    const c = document.querySelectorAll('.wall__col')[${i}];
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (!box) return null;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await sleep(60);
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x, y: box.y, deltaX: 0, deltaY: dy });
  await sleep(450);
  return state();
}

const before = await state();
console.log("--- initial ---" + JSON.stringify(before));

check("three columns rendered", before.cols === 3, String(before.cols));
check("all 50 frames present", before.cells === 50, String(before.cells));

// 1. THE POINT. The page is short, not 12.7 screens.
check("page is short, not 12.7 screens", before.docH < 2600,
  before.docH + "px = " + (before.docH / before.vh).toFixed(1) + " screens (was 12.7)");

// 2. Each column is its own scroller.
const perCol = await evalJs(`[...document.querySelectorAll('.wall__col')].map(c => ({
  overflowY: getComputedStyle(c).overflowY,
  scrollable: c.scrollHeight > c.clientHeight,
  scrollbar: getComputedStyle(c).scrollbarWidth,
  overscroll: getComputedStyle(c).overscrollBehaviorY,
}))`);
console.log("--- per column ---" + JSON.stringify(perCol));
check("every column scrolls natively", perCol.every(c => c.overflowY === "auto"),
  perCol.map(c => c.overflowY).join("/"));
check("every column actually has more to show", perCol.every(c => c.scrollable),
  perCol.map(c => String(c.scrollable)).join("/"));
check("scrollbars hidden, like the home strip", perCol.every(c => c.scrollbar === "none"),
  perCol.map(c => c.scrollbar).join("/"));
// `contain` here would swallow the gesture at the end of a column and strand
// the visitor above the closing band. Must be `auto` so a spent column hands
// the gesture to the page.
check("a spent column hands the gesture to the page", perCol.every(c => c.overscroll === "auto"),
  perCol.map(c => c.overscroll).join("/"));

// 3. INDEPENDENCE. Wheel over column 0 must move column 0 ONLY.
const a = await wheelOverCol(0, 600);
const onlyFirst = a && a.off[0] > 0 && a.off[1] === 0 && a.off[2] === 0;
check("wheel over column 1 scrolls column 1 ONLY",
  !!onlyFirst, a ? a.off.join("/") : "no column");

// Wheel over column 2 must move column 2 and not column 1.
const b = await wheelOverCol(2, 500);
const thirdMoved = b && b.off[2] > a.off[2];
const firstStayed = b && b.off[0] === a.off[0];
check("wheel over column 3 scrolls column 3", !!thirdMoved,
  b ? b.off[2] + " (was " + (a ? a.off[2] : "?") + ")" : "");
check("column 1 did not move while column 3 scrolled", !!firstStayed,
  b ? b.off[0] + " (was " + (a ? a.off[0] : "?") + ")" : "");
check("the two columns are genuinely independent", !!(thirdMoved && firstStayed));

// 4. The page itself does not scroll while a column has room left.
check("page did not scroll while a column still had content",
  a && a.pageY === 0, a ? String(a.pageY) : "");

// 5. Each column stops at its own end, not past it.
const ends = [];
for (let i = 0; i < 3; i++) ends.push(await wheelOverCol(i, 40000));
await sleep(300);
const done = await state();
check("every column reached its own end",
  done.off.every((o, i) => Math.abs(o - done.limits[i]) <= 2),
  done.off.map((o, i) => o + "/" + done.limits[i]).join("  "));

// 6. Once the wall is spent, the page must scroll again or the band is unreachable.
await evalJs(`scrollTo(0, 0)`);
await sleep(200);
const afterEnd = await wheelOverCol(1, 600);
check("page scrolls again once the columns are spent",
  afterEnd && afterEnd.pageY > 0, afterEnd ? String(afterEnd.pageY) : "");

check("closing band still present", done.band);
console.log("--- after scrolling ---" + JSON.stringify(done));

if (fails) { console.log("\n" + fails + " check(s) failed"); process.exit(1); }
console.log("\ncolumns scroll independently and the page is short");
