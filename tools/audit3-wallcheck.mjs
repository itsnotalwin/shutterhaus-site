/**
 * Why did the wall's row spread regress to 538px?
 *
 * Reports every .pf-row's cell heights and the natural size of each image in
 * it, so a row that is not level can be traced to a specific frame rather than
 * guessed at.
 *
 * Run: node tools/audit3-wallcheck.mjs
 */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
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

for (const w of [1280]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${ORIGIN}/portfolio` });
  await sleep(5000);
  const r = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const rows = [...document.querySelectorAll('.pf-row')];
      const out = rows.map((row, i) => {
        const cells = [...row.querySelectorAll('.pf-cell')];
        const hs = cells.map(c => Math.round(c.getBoundingClientRect().height));
        const imgs = cells.map(c => {
          const im = c.querySelector('img');
          if (!im) return null;
          const b = im.getBoundingClientRect();
          return { src: (im.currentSrc||im.src||'').split('/').pop(),
                   nat: im.naturalWidth + 'x' + im.naturalHeight,
                   box: Math.round(b.width) + 'x' + Math.round(b.height),
                   ar: im.naturalHeight ? +(im.naturalWidth/im.naturalHeight).toFixed(3) : 0,
                   loading: im.loading, complete: im.complete };
        });
        return { row: i + 1, heights: hs, spread: Math.max(...hs) - Math.min(...hs), imgs };
      });
      return { rows: rows.length, spreads: out.map(r => r.spread), bad: out.filter(r => r.spread > 1) };
    })()`,
  });
  const d = r.result.value;
  console.log(`\n=== ${w}px — ${d.rows} rows ===`);
  console.log("  spreads per row:", d.spreads.join(", "));
  if (!d.bad.length) console.log("  every row level");
  for (const b of d.bad) {
    console.log(`\n  ROW ${b.row}: heights ${b.heights.join(" vs ")} (spread ${b.spread}px)`);
    for (const im of b.imgs) console.log("    ", JSON.stringify(im));
  }
}
ws.close();
process.exit(0);