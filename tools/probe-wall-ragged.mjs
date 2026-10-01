/**
 * Why the portfolio wall reads as messy: measure the raggedness INSIDE each
 * column, not just the column bottoms.
 *
 * Alwin: "portfolio page layout is concerning tis not clean."
 *
 * probe-wall.mjs reports column bottoms, but that hides the real defect. What
 * reads as unclean is the ragged right edge and the white notches BESIDE short
 * frames: a column is a vertical stack of images whose heights follow their own
 * aspect ratios, so every short landscape leaves a visible hole under it.
 * Top-edge deltas expose that precisely.
 *
 * Usage: node tools/probe-wall-ragged.mjs <url> [width]
 * Needs headless Chrome on CDP_PORT (default 9222).
 */

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const url = process.argv[2] || "http://127.0.0.1:4173";
const width = Number(process.argv[3] || 1440);

const t = await (await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const waiting = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m);
    waiting.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    waiting.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height: 900,
  deviceScaleFactor: 1,
  mobile: width < 768,
});
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 2800));

// Scroll through so every lazy frame decodes before measuring.
for (let y = 0; y < 30; y++) {
  await evaluate(`(() => { window.scrollTo(0, ${y} * 1100); return 1; })()`);
  await new Promise((r) => setTimeout(r, 200));
}
await evaluate("(() => { window.scrollTo(0, 0); return 1; })()");
await new Promise((r) => setTimeout(r, 1600));

const data = JSON.parse(
  await evaluate(`(() => {
    const wall = document.querySelector('.grid--wall');
    const cols = Array.from(wall.querySelectorAll('.col'));

    const report = cols.map((col) => {
      const frames = Array.from(col.querySelectorAll('.pf-cell > .cell'));
      const tops = [];
      const heights = [];
      const ratios = [];
      for (const f of frames) {
        const r = f.getBoundingClientRect();
        tops.push(Math.round(r.top + window.scrollY));
        heights.push(Math.round(r.height));
        const img = f.querySelector('img');
        if (img) ratios.push(+(img.naturalWidth / img.naturalHeight).toFixed(2));
      }
      const gaps = [];
      for (let i = 1; i < tops.length; i++) gaps.push(tops[i] - (tops[i - 1] + heights[i - 1]));
      return {
        x: Math.round(col.getBoundingClientRect().left),
        w: Math.round(frames[0]?.getBoundingClientRect().width || 0),
        n: frames.length,
        h: heights.reduce((a, b) => a + b, 0),
        gaps: Array.from(new Set(gaps)).sort((a, b) => a - b),
        ratios,
      };
    });
    return JSON.stringify({ cols: cols.length, report });
  })()`),
);

console.log("\\nwidth=" + width + "  cols=" + data.cols);
const allGaps = new Set();
const allRatios = [];
for (const c of data.report) {
  console.log(`  col x=${c.x} w=${c.w} n=${c.n} h=${c.h}`);
  console.log(`    gaps between frames: ${JSON.stringify(c.gaps)}`);
  allGaps.add(...c.gaps);
  allRatios.push(...c.ratios);
}
console.log("  distinct gap values: " + JSON.stringify([...allGaps].sort((a, b) => a - b)));

const uniq = [...new Set(allRatios)].sort((a, b) => a - b);
const portrait = uniq.filter((r) => r < 1);
const land = uniq.filter((r) => r > 1.15);
console.log(`  aspect ratios: ${uniq.length} distinct`);
console.log(`    portrait ${portrait.length}, landscape ${land.length}`);
console.log(`    extremes (outside 0.6-1.5): ${JSON.stringify(uniq.filter((r) => r > 1.5 || r < 0.6))}`);
console.log("\\nWALL RAGGEDNESS MEASURED");

await fetch(`${CDP}/json/close/${t.id}`);
ws.close();