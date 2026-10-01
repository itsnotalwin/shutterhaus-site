/**
 * 30 frames, 10 static rows of 3, no scroll, no numbers, ZERO spacing issues.
 *
 *   CDP_PORT=9334 node tools/probe-static-rows.mjs <baseUrl>
 *
 * "No spacing issues at all" is the requirement, so it is measured per row rather
 * than eyeballed: the three cell heights in a row must be identical. A gap under
 * a short photo shows up here as a non-zero height spread, which is the defect
 * the ratio-per-row design exists to prevent.
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

let fails = 0;
const check = (name, pass, detail = "") => {
  if (pass) { console.log("ok    " + name + (detail ? "  (" + detail + ")" : "")); return; }
  fails++;
  console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
};
const setW = (w, h) => send("Emulation.setDeviceMetricsOverride",
  { width: w, height: h, deviceScaleFactor: 1, mobile: false });

for (const [w, h, cols] of [[1440, 900, 3], [390, 844, 2]]) {
  await setW(w, h);
  await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/portfolio" });
  await sleep(3200);

  const s = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('.pf-row')];
    // Measure at full precision. Integer pixel heights of three frames sharing
    // one aspect ratio in the same width column differ by 1px from fractional
    // layout rounding, which is invisible. A real gap is a photo rendered at a
    // different ratio, and that shows up here as a spread above 1px.
    const heights = rows.map(r =>
      [...r.querySelectorAll('.pf-cell')].map(c => c.getBoundingClientRect().height));
    const imgs = [...document.querySelectorAll('.pf-cell img')];
    return {
      rows: rows.length,
      perRow: rows.map(r => r.querySelectorAll('.pf-cell').length),
      cells: document.querySelectorAll('.pf-cell').length,
      heights,
      // THE metric: worst height difference between the three cells of a row.
      worstSpread: Math.max(0, ...heights.map(hs => hs.length ? Math.max(...hs) - Math.min(...hs) : 0)),
      worstPixel: Math.max(0, ...heights.map(hs => hs.length
        ? Math.max(...hs.map(Math.round)) - Math.min(...hs.map(Math.round)) : 0)),
      // Tops of the three cells in each row must be level, or the row is skewed.
      worstTop: Math.max(0, ...rows.map(r => {
        const t = [...r.querySelectorAll('.pf-cell')].map(c => Math.round(c.getBoundingClientRect().top));
        return t.length ? Math.max(...t) - Math.min(...t) : 0;
      })),
      scrollables: [...document.querySelectorAll('.pf-row, .pf-rows, .pf-cell, .page.portfolio')]
        .filter(e => e.scrollHeight > e.clientHeight + 1).map(e => e.className),
      numbers: document.querySelectorAll('.pf-cell__n').length,
      filterBar: !!document.querySelector('.pfilter'),
      cellsWithDataN: document.querySelectorAll('.pf-cell[data-n]').length,
      overflowX: document.documentElement.scrollWidth - innerWidth,
      band: !!document.querySelector('.hcta'),
      distorted: imgs.filter(i => {
        const c = i.closest('.pf-cell');
        if (!c || !c.getBoundingClientRect().height) return false;
        const want = i.naturalHeight / i.naturalWidth;
        const got = c.getBoundingClientRect().height / c.getBoundingClientRect().width;
        return want > 0 && Math.abs(want - got) / want > 0.04;
      }).length,
      docH: document.documentElement.scrollHeight,
      vh: innerHeight,
    };
  })()`);
  console.log(`--- ${w} ---` + JSON.stringify(s));

  check(`${w}: ten rows`, s.rows === 10, String(s.rows));
  check(`${w}: three cells per row`, s.perRow.every(n => n === 3), s.perRow.join("/"));
  check(`${w}: 30 frames`, s.cells === 30, String(s.cells));
  // A row of three frames sharing one exact aspect ratio renders at one height.
  // The tolerance is 1px because identical ratios still land on different
  // fractional device pixels; anything larger is a real gap under a photo.
  check(`${w}: NO SPACING ISSUES — every row is one height`, s.worstPixel <= 1,
    "worst spread " + s.worstSpread.toFixed(2) + "px (int " + s.worstPixel + "px)");
  check(`${w}: no photo is a different shape from its row`, s.distorted === 0,
    String(s.distorted));
  check(`${w}: cells in a row are level at the top`, s.worstTop === 0, s.worstTop + "px");
  check(`${w}: NOTHING scrolls`, s.scrollables.length === 0, s.scrollables.join(", "));
  check(`${w}: no printed frame numbers`, s.numbers === 0, String(s.numbers));
  check(`${w}: no filter bar`, !s.filterBar);
  check(`${w}: no horizontal overflow`, s.overflowX <= 0, s.overflowX + "px");
  check(`${w}: the closing band is there`, s.band);
  console.log(`     ${s.docH}px = ${(s.docH / s.vh).toFixed(1)} screens, expected ${cols} per row`);
}

if (fails) { console.log("\n" + fails + " check(s) failed"); process.exit(1); }
console.log("\nstatic rows, no scroll, no numbers, zero spacing issues");
