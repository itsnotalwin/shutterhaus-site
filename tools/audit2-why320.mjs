/**
 * Why does the header overflow the viewport by 6px at 320px?
 *
 * The earlier audit measured zero horizontal overflow at 320. Something in this
 * pass reintroduced it on the portfolio route, and nav + social are the three
 * elements sticking out. This dumps their real geometry and computed position so
 * the cause is identified rather than guessed at.
 *
 * Run: node tools/audit2-why320.mjs
 */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`${CDP}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
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
await send("Page.enable"); await send("Runtime.enable");

const EXPR = `(() => {
  const cs = el => getComputedStyle(el);
  const dump = sel => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const c = cs(el), r = el.getBoundingClientRect();
    return { sel, rect: { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) },
      position: c.position, transform: c.transform, display: c.display, visibility: c.visibility,
      opacity: c.opacity, inset: { top: c.top, right: c.right, left: c.left, bottom: c.bottom },
      width: c.width, minWidth: c.minWidth, padding: c.padding, margin: c.margin,
      gridArea: c.gridArea, gap: c.gap, html: el.outerHTML.slice(0, 150) };
  };
  const de = document.documentElement, body = document.body;
  return {
    viewport: de.clientWidth,
    docScrollW: de.scrollWidth, bodyScrollW: body.scrollWidth,
    overflowX: de.scrollWidth - de.clientWidth,
    overflowXHidden: cs(de).overflowX + ' / ' + cs(body).overflowX,
    elements: ['.site-header', '.site-nav', '.site-social', '.social', '.burger', '.logo'].map(dump),
  };
})()`;

for (const w of [320, 393]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w, height: 852, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: `${ORIGIN}/portfolio` });
  await sleep(2600);
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: EXPR });
  const d = r.result.value;
  console.log(`\n================ ${w}px ================`);
  console.log(`viewport=${d.viewport} scrollW=${d.docScrollW} bodyScrollW=${d.bodyScrollW} overflowX=${d.overflowX}`);
  console.log(`overflow-x: html=${d.overflowXHidden}`);
  for (const e of d.elements) {
    if (e.missing) { console.log(`  ${e.sel}: MISSING`); continue; }
    console.log(`  ${e.sel}: rect=${JSON.stringify(e.rect)} pos=${e.position} vis=${e.visibility} disp=${e.display} gridArea=${e.gridArea} inset.r=${e.inset.right}`);
    if (e.transform && e.transform !== 'none') console.log(`      transform=${e.transform}`);
  }
}
ws.close(); process.exit(0);