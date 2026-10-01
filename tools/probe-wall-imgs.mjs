/**
 * Is the wall actually showing images, or is the srcset lying in a new way?
 *
 *   CDP_PORT=9333 node tools/probe-wall-imgs.mjs <baseUrl>
 *
 * check-images.mjs asserts the images that DID load are intact. It cannot see a
 * case where the browser picks a candidate that technically 200s but is the
 * wrong size, or where naturalWidth is 0 because nothing decoded. This prints
 * the resolved state per cell: what the browser chose, how big it actually is,
 * and how it compares to the width the cell renders at.
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

await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await send("Page.navigate", { url: url + "/?t=" + Date.now() + "/#/portfolio" });
await new Promise((r) => setTimeout(r, 6000));

const out = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('.pf-cell')];
  const rows = cells.map((c) => {
    const img = c.querySelector('img');
    if (!img) return { bad: 'no img' };
    const r = c.getBoundingClientRect();
    return {
      file: (img.currentSrc || img.src || '').split('/').pop(),
      natural: img.naturalWidth,
      rendered: Math.round(r.width),
      dpr: devicePixelRatio,
      inView: r.top < innerHeight,
    };
  });
  const loaded = rows.filter((r) => r.natural > 0).length;
  const inView = rows.filter((r) => r.inView);
  return {
    cells: cells.length,
    loaded,
    sizes: cells[0]?.getAttribute('sizes'),
    srcset: (cells[0]?.getAttribute('srcset') || '').split(',').map(s => s.trim().split(' ')[1] + ' ' + s.trim().split(' ')[0].split('/').pop()),
    inView: inView.map((r) => ({
      file: r.file, natural: r.natural, rendered: r.rendered,
      // How many device pixels the cell actually needs vs what it got.
      want: Math.round(r.rendered * r.dpr), ratio: r.natural ? (r.natural / (r.rendered * r.dpr)).toFixed(2) : null,
    })),
  };
})()`);

console.log("--- resolved images ---");
console.log(JSON.stringify(out, null, 1));

let fails = 0;
const check = (name, pass, detail = "") => {
  console.log(`${pass ? "ok   " : "FAIL "} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!pass) fails++;
};

if (out.__err) { console.log("eval error:", out.__err); process.exit(1); }

check("every wall image decoded", out.loaded === out.cells, `${out.loaded}/${out.cells}`);
for (const v of out.inView || []) {
  // Under-serving is the subtle failure: a 400w image in a 439px column on a
  // 2x display looks fine until someone zooms or prints it.
  check(`${v.file} is not under-served`, v.ratio !== null && v.ratio >= 0.9,
    `natural=${v.natural} want=${v.want} (${v.ratio}x)`);
}

ws.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nwall images resolve at the right size");
process.exit(fails ? 1 : 0);
