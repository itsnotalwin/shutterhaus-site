/**
 * Where exactly is the empty space at the bottom of the home strip?
 *
 * Alwin: "i just see some random white space and its ugly at the bottom
 * right of the selected work." Columns are balanced now, so the gap is
 * *inside* the section rather than a ragged bottom — this prints each
 * column's last-cell bottom edge and the section's own bottom, so the
 * difference is the actual size of the hole.
 *
 * Usage: node tools/probe-gap.mjs <baseUrl> [width]
 */

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const BASE = process.argv[2] || "http://127.0.0.1:4173";
const W = Number(process.argv[3] || 1440);
const H = W >= 1000 ? 900 : 844;
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

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: H,
  deviceScaleFactor: 1,
  mobile: W < 640,
});
await send("Page.navigate", { url: `${BASE}#/home` });
await sleep(2600);

const r = await send("Runtime.evaluate", {
  expression: `(() => {
    const sec = document.querySelector('.hstrip');
    const grid = document.querySelector('.hstrip__grid');
    if (!sec || !grid) return JSON.stringify({ err: 'no strip' });
    const sr = sec.getBoundingClientRect();
    const gr = grid.getBoundingClientRect();
    const cols = Array.from(grid.querySelectorAll('.hstrip__col')).map((c) => {
      const cells = Array.from(c.querySelectorAll('.cell'));
      const last = cells[cells.length - 1];
      const cr = c.getBoundingClientRect();
      const lr = last ? last.getBoundingClientRect() : null;
      return {
        n: cells.length,
        colTop: Math.round(cr.top + scrollY),
        colBottom: Math.round(cr.bottom + scrollY),
        lastBottom: lr ? Math.round(lr.bottom + scrollY) : null,
      };
    });
    // The "See the full portfolio" link sits after the grid.
    const cta = sec.querySelector('.cta');
    const ctaR = cta ? cta.getBoundingClientRect() : null;
    return JSON.stringify({
      url: location.href,
      sectionTop: Math.round(sr.top + scrollY),
      sectionBottom: Math.round(sr.bottom + scrollY),
      gridTop: Math.round(gr.top + scrollY),
      gridBottom: Math.round(gr.bottom + scrollY),
      cols,
      ctaTop: ctaR ? Math.round(ctaR.top + scrollY) : null,
      gapGridToCta: ctaR ? Math.round(ctaR.top - gr.bottom) : null,
      shortestColBottom: Math.min(...cols.map((c) => c.lastBottom)),
      tallestColBottom: Math.max(...cols.map((c) => c.lastBottom)),
    });
  })()`,
  returnByValue: true,
});
const raw = r.result?.result?.value;
if (!raw) {
  console.log("RAW", JSON.stringify(r).slice(0, 300));
} else {
  const d = JSON.parse(raw);
  if (d.err) console.log(d.err);
  else {
    console.log(`width=${W}  section ${d.sectionTop}..${d.sectionBottom}  grid ${d.gridTop}..${d.gridBottom}`);
    for (const [i, c] of d.cols.entries()) {
      console.log(`  col ${i}: n=${c.n}  last image ends ${c.lastBottom}`);
    }
    console.log(`  ragged bottom: ${d.tallestColBottom - d.shortestColBottom}px`);
    console.log(`  grid -> CTA gap: ${d.gapGridToCta}px`);
    const sectionSlack = d.sectionBottom - d.tallestColBottom;
    console.log(`  slack inside section below tallest column: ${sectionSlack}px`);
  }
}
await fetch(`${CDP}/json/close/${t.id}`);
ws.close();
