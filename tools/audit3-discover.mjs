/**
 * audit3-discover — dump the live DOM structure so later probes know the
 * real deployed class names. Read-only. No source is touched.
 * Run: node tools/audit3-discover.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = "https://shutterhausvisuals.co.za";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("audit-v2/audit3", { recursive: true });

const targets = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
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
const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
await send("Page.enable"); await send("Runtime.enable");

const TREE = `(() => {
  const walk = (el, d) => {
    if (d > 6) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const node = { t: el.tagName.toLowerCase(),
      c: (el.className && typeof el.className === 'string' ? el.className : '').trim().slice(0,50),
      fs: cs.fontSize, disp: cs.display, w: Math.round(r.width), x: Math.round(r.left) };
    const kids = [];
    for (const ch of el.children) { const k = walk(ch, d+1); if (k) kids.push(k); }
    if (kids.length) node.k = kids;
    return node;
  };
  return walk(document.body, 0);
})()`;

const FLAT = `(() => {
  // every distinct class in the document, with a sample text + tag
  const seen = new Map();
  for (const el of document.querySelectorAll('*')) {
    if (typeof el.className !== 'string') continue;
    for (const c of el.className.trim().split(/\\s+/)) {
      if (!c || seen.has(c)) continue;
      seen.set(c, { tag: el.tagName.toLowerCase(), txt: (el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,60), n: 0 });
    }
    for (const c of el.className.trim().split(/\\s+/)) if (c && seen.has(c)) seen.get(c).n++;
  }
  return [...seen.entries()].map(([k,v]) => k + ' | ' + v.tag + ' x' + v.n + ' | ' + v.txt);
})()`;

const out = {};
for (const route of ["/", "/portfolio", "/about", "/services", "/contact"]) {
  await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: ORIGIN + route });
  await sleep(3800);
  await evaluate("document.fonts.ready");
  await sleep(500);
  out[route] = { classes: await evaluate(FLAT), tree: await evaluate(TREE) };
}
writeFileSync("audit-v2/audit3/discover.json", JSON.stringify(out, null, 2));
for (const [r, v] of Object.entries(out)) {
  console.log("\n===== " + r + " =====");
  console.log(v.classes.join("\n"));
}
ws.close(); process.exit(0);
