/**
 * audit3-final — remaining checks: mobile nav, closing band consistency,
 * and the exact strings that render (for copy review).
 * Run: node tools/audit3-final.mjs
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
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && pending.has(x.id)) { const p = pending.get(x.id); pending.delete(x.id); x.error ? p.reject(new Error(JSON.stringify(x.error))) : p.resolve(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || "err").split("\n")[0]); return r.result.value; };
const evR = async (e, t = 4) => { let l; for (let i = 0; i < t; i++) { try { return await ev(e); } catch (x) { l = x; await sleep(1000); } } throw l; };
await send("Page.enable"); await send("Runtime.enable");
async function waitForVW(w) { for (let i = 0; i < 60; i++) { try { if (await ev("document.documentElement.clientWidth") === w) return true; } catch {} await sleep(250); } return false; }

const PROBE = `(() => {
  const vis = (el) => { for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || c.opacity === '0') return false; } return true; };
  const hdr = document.querySelector('header') || document.querySelector('.site-header') || document.querySelector('[class*=header]');
  const nav = hdr ? [...hdr.querySelectorAll('a,button')].map(el => {
    const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { tag: el.tagName.toLowerCase(), cls: typeof el.className==='string'?el.className:'', txt:(el.textContent||el.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,24),
      href: el.getAttribute('href')||'', aria: el.getAttribute('aria-label'), expanded: el.getAttribute('aria-expanded'),
      w:+b.width.toFixed(1), h:+b.height.toFixed(1), visible: vis(el), fontSize: cs.fontSize };
  }) : [];
  // closing band: last element in main that contains a CTA-ish link
  const main = document.querySelector('main');
  const lastBand = main ? (() => {
    const all = [...main.querySelectorAll('section, .hcta, .cta, .invest, [class*=cta]')];
    return all.length ? { cls: all[all.length-1].className, text: (all[all.length-1].textContent||'').trim().replace(/\\s+/g,' ').slice(0,150) } : null;
  })() : null;
  return {
    headerHTMLclass: hdr ? (typeof hdr.className === 'string' ? hdr.className : '') : null,
    nav, lastBand,
    hasHcta: !!document.querySelector('.hcta'),
    hasForm: !!document.querySelector('form'),
    h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()),
    allText: (document.querySelector('main')?.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 4000),
  };
})()`;

const out = {};
for (const [route, w] of [["/", 320], ["/", 393], ["/", 1440], ["/portfolio", 393], ["/about", 393], ["/services", 393], ["/contact", 393], ["/services", 1920]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 852, deviceScaleFactor: 1, mobile: w < 700, screenWidth: w, screenHeight: 852 });
  await waitForVW(w);
  await send("Page.navigate", { url: ORIGIN + route });
  await sleep(2200);
  await evR("document.fonts.ready").catch(() => {});
  out[`${route}@${w}`] = await evR(PROBE);
}
writeFileSync("audit-v2/audit3/final.json", JSON.stringify(out, null, 1));

console.log("### HEADER / NAV");
for (const [k, d] of Object.entries(out)) {
  console.log(`\n  ${k}  header="${d.headerHTMLclass}"  hasHcta=${d.hasHcta} hasForm=${d.hasForm}`);
  console.log(`    h1=${JSON.stringify(d.h1)}`);
  for (const n of d.nav) console.log(`    ${n.visible ? "VIS " : "hid "} ${n.tag}.${String(n.cls).slice(0,20).padEnd(21)} ${String(n.w).padStart(6)}x${String(n.h).padEnd(6)} fs=${n.fontSize.padEnd(6)} aria=${String(n.aria).padEnd(10)} exp=${String(n.expanded).padEnd(5)} '${n.txt}'`);
}
console.log("\n### CLOSING BAND PER ROUTE (at 393 unless noted)");
for (const k of Object.keys(out)) {
  const d = out[k];
  console.log(`  ${k.padEnd(18)} hasHcta=${String(d.hasHcta).padEnd(5)} lastBand="${d.lastBand?.cls}"  "${(d.lastBand?.text || '').slice(0, 90)}"`);
}
ws.close(); process.exit(0);
