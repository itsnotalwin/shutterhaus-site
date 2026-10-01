/**
 * What is actually on the live portfolio page: footer, CTA, and the run-length
 * of near-duplicate frames.
 *
 * The screenshots showed fifteen visually identical frames of the same subject
 * stacked in the lower half. Whether that is a data problem or a sequencing
 * problem decides the fix, so this prints the order the page actually renders.
 *
 *   CDP_PORT=9333 node tools/probe-pf-audit.mjs <baseUrl> [width]
 */

const url = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const width = Number(process.argv[3] ?? 1440);

const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const t = await (await fetch(`${CDP}/json/new?${encodeURIComponent(`${url}/#/portfolio`)}`, {
  method: "PUT",
})).json();
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

await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Runtime.enable", {});
await send("Page.navigate", { url: `${url}/#/portfolio` });
await new Promise((r) => setTimeout(r, 3000));

const out = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const cells = Array.from(document.querySelectorAll('.pf-row__cell'));
    const files = cells.map(c => {
      const img = c.querySelector('img');
      const u = (img && (img.currentSrc || img.src)) || '';
      const m = u.match(/\\/([^/]+?)-\\d+w\\./);
      return m ? m[1] : u.split('/').pop();
    });
    // Run-length: how many consecutive cells share a filename prefix stem.
    const stem = f => f.replace(/[-_]?(DSC|IMG|P)[-_]?\\d+/i, '').toLowerCase();
    const runs = [];
    for (const f of files) {
      const s = stem(f);
      const last = runs[runs.length - 1];
      if (last && stem(last.sample) === s) { last.n++; last.files.push(f); }
      else runs.push({ n: 1, sample: f, files: [f] });
    }
    const foot = document.querySelector('.foot, footer, .site-foot');
    return {
      total: cells.length,
      uniqueStems: new Set(files.map(stem)).size,
      longestRun: runs.map(r => r.n).sort((a,b)=>b-a).slice(0,5),
      runsAtLeast3: runs.filter(r => r.n >= 3).map(r => r.n),
      order: files,
      foot: foot ? foot.className : null,
      footLinks: foot ? Array.from(foot.querySelectorAll('a')).map(a => a.textContent.trim()).slice(0,12) : [],
      ctaAfterWall: Array.from(document.querySelectorAll('main > *, .pf-wrap > *')).map(e => e.className).slice(-6),
    };
  })()`,
});

const v = out.result.result.value;
console.log(JSON.stringify({
  total: v.total,
  uniqueStems: v.uniqueStems,
  longestRun: v.longestRun,
  runsAtLeast3: v.runsAtLeast3,
  foot: v.foot,
  footLinks: v.footLinks,
  lastSections: v.ctaAfterWall,
}, null, 2));
console.log("render order:");
v.order.forEach((f, i) => console.log(String(i).padStart(2), f));
ws.close();