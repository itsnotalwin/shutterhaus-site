/**
 * audit3-dpr — re-check image resolution at REAL device pixel ratios.
 * The DPR-1 sweep picked the smallest srcset candidate; a real iPhone is DPR 3.
 * Also decodes the real pixel size of each delivered file.
 * Run: node tools/audit3-dpr.mjs
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
const ev = async (e) => {
  const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || "err").split("\n")[0]);
  return r.result.value;
};
const evR = async (e, t = 4) => { let l; for (let i = 0; i < t; i++) { try { return await ev(e); } catch (x) { l = x; await sleep(1000); } } throw l; };
await send("Page.enable"); await send("Runtime.enable");
async function waitForVW(w) { for (let i = 0; i < 60; i++) { try { if (await ev("document.documentElement.clientWidth") === w) return true; } catch {} await sleep(250); } return false; }

// physical pixels the browser actually needs for each image box
const PROBE = `(() => [...document.images].map((img, i) => {
  const b = img.getBoundingClientRect(), cs = getComputedStyle(img);
  return {
    i, src: (img.currentSrc || img.src || '').split('/').pop(),
    srcset: img.getAttribute('srcset'), sizes: img.getAttribute('sizes'),
    bw: +b.width.toFixed(1), bh: +b.height.toFixed(1),
    dpr: window.devicePixelRatio,
    needW: Math.round(b.width * window.devicePixelRatio),
    natW: img.naturalWidth, natH: img.naturalHeight,
    loading: img.getAttribute('loading'), fp: img.getAttribute('fetchpriority'),
    fit: cs.objectFit, loaded: img.naturalWidth > 0,
  };
}))()`;

const CASES = [
  ["/", 393, 3], ["/", 320, 2], ["/portfolio", 393, 3], ["/portfolio", 393, 2],
  ["/about", 393, 3], ["/services", 393, 3], ["/contact", 393, 3],
  ["/", 1920, 1], ["/", 1440, 2], ["/portfolio", 1440, 1], ["/portfolio", 1920, 1],
  ["/about", 1920, 1], ["/services", 768, 1], ["/services", 1920, 1],
];
const out = {};
for (const [route, w, dpr] of CASES) {
  const key = `${route}@${w}x${dpr}`;
  try {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: 852, deviceScaleFactor: dpr, mobile: w < 700, screenWidth: w, screenHeight: 852 });
    await waitForVW(w);
    await send("Page.navigate", { url: ORIGIN + route });
    await sleep(2200);
    await evR("document.fonts.ready");
    await sleep(500);
    // scroll through so lazy images actually request, then return to top
    await evR(`(async()=>{ const H=document.body.scrollHeight; for(let y=0;y<H;y+=700){ scrollTo(0,y); await new Promise(r=>setTimeout(r,90)); } scrollTo(0,0); await new Promise(r=>setTimeout(r,500)); })()`).catch(() => {});
    await evR("Promise.race([Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))), new Promise(r=>setTimeout(r,4000))])").catch(() => {});
    out[key] = await evR(PROBE);
    const imgs = out[key];
    const under = imgs.filter(i => i.loaded && i.natW > 0 && i.needW > i.natW + 2);
    const first = imgs[0];
    console.log(`  ${key.padEnd(22)} imgs=${imgs.length} UNDER-RESOLVED=${under.length}  first=${first.src} need=${first.needW} got=${first.natW} loading=${first.loading} fp=${first.fp}`);
  } catch (e) { console.log(`  ${key}  !! ${String(e.message).slice(0, 140)}`); }
}
writeFileSync("audit-v2/audit3/dpr.json", JSON.stringify(out, null, 1));

console.log("\n### UNDER-RESOLVED IMAGES (box x DPR exceeds delivered bitmap width)");
for (const [k, imgs] of Object.entries(out)) {
  const under = imgs.filter(i => i.loaded && i.needW > i.natW + 2);
  if (!under.length) continue;
  const worst = under.map(i => ({ ...i, short: (i.needW / i.natW) })).sort((a, b) => b.short - a.short);
  console.log(`\n  ${k}: ${under.length}/${imgs.length} under-resolved`);
  for (const i of worst.slice(0, 4)) {
    console.log(`     ${i.src.padEnd(30)} need=${String(i.needW).padStart(5)}px got=${String(i.natW).padStart(5)}px  ${i.short.toFixed(2)}x soft  loading=${i.loading} sizes=${String(i.sizes).slice(0, 30)}`);
  }
}
console.log("\n### LCP / FIRST IMAGE PRIORITY");
for (const [k, imgs] of Object.entries(out)) {
  if (!imgs.length) continue;
  const f = imgs[0];
  console.log(`  ${k.padEnd(22)} first=${f.src.padEnd(30)} loading=${String(f.loading).padEnd(5)} fetchpriority=${String(f.fp).padEnd(7)} need=${f.needW} got=${f.natW}`);
}
console.log("\n### srcset / sizes on first image (sample)");
const anyKey = Object.keys(out)[0];
console.log(JSON.stringify({ srcset: out[anyKey][0].srcset, sizes: out[anyKey][0].sizes }, null, 1));
ws.close(); process.exit(0);
