/**
 * audit3-shots — screenshots of the flagged defects + closing-band check.
 * Run: node tools/audit3-shots.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = "https://shutterhausvisuals.co.za";
const OUT = "audit-v2/audit3";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

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
const send = (m, p = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, { resolve: res, reject: rej });
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
const ev = async (e) => {
  const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || "err").split("\n")[0]);
  return r.result.value;
};
await send("Page.enable"); await send("Runtime.enable");
async function waitForVW(w) { for (let i = 0; i < 60; i++) { try { if (await ev("document.documentElement.clientWidth") === w) return true; } catch {} await sleep(250); } return false; }

// closing band / CTA presence + wording, per route
const BAND = `(() => {
  const main = document.querySelector('main');
  const foot = document.querySelector('.site-footer');
  const cands = [...main.querySelectorAll('section, .hcta, .cta, [class*=cta], [class*=band]')]
    .map(el => ({ cls: el.className, y: Math.round(el.getBoundingClientRect().top + scrollY),
      h: Math.round(el.getBoundingClientRect().height),
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 180),
      links: [...el.querySelectorAll('a,button')].map(a => (a.textContent||'').trim().replace(/\\s+/g,' ').slice(0,28) + ' -> ' + (a.getAttribute('href')||'')) }));
  const last = cands[cands.length - 1];
  return { nCandidates: cands.length, last, footerFirst: (foot?.textContent || '').trim().replace(/\\s+/g,' ').slice(0, 240),
    docH: document.documentElement.scrollHeight,
    lastBottomGap: foot ? Math.round(foot.getBoundingClientRect().top + scrollY - (last ? last.y + last.h : 0)) : null };
})()`;

const SHOTS = [
  // name, route, width, height, dpr, fullPage
  ["portfolio-1920-cap900", "/portfolio", 1920, 1080, 1, true],
  ["portfolio-1440-cap900", "/portfolio", 1440, 900, 1, false],
  ["services-1920-3col-orphan", "/services", 1920, 1080, 1, true],
  ["about-1920-imbalance", "/about", 1920, 1080, 1, true],
  ["contact-1920-misalign", "/contact", 1920, 1080, 1, true],
  ["services-393-type", "/services", 393, 852, 2, true],
  ["portfolio-320-mobile", "/portfolio", 320, 700, 2, true],
  ["home-1920", "/", 1920, 1080, 1, true],
  ["home-393", "/", 393, 852, 2, true],
  ["about-1024", "/about", 1024, 900, 1, true],
];

const bands = {};
for (const [name, route, w, h, dpr, full] of SHOTS) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 700, screenWidth: w, screenHeight: h });
  await waitForVW(w);
  await send("Page.navigate", { url: ORIGIN + route });
  await sleep(2200);
  await ev("document.fonts.ready").catch(() => {});
  // trigger lazy images
  await ev(`(async()=>{const H=document.body.scrollHeight;for(let y=0;y<H;y+=600){scrollTo(0,y);await new Promise(r=>setTimeout(r,70));}scrollTo(0,0);await new Promise(r=>setTimeout(r,600));})()`).catch(() => {});
  await sleep(900);
  if (!bands[route]) bands[route] = await ev(BAND).catch((e) => ({ err: String(e.message) }));
  if (full) {
    const sh = await ev("document.documentElement.scrollHeight");
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: Math.min(sh + 30, 14000), deviceScaleFactor: 1, mobile: w < 700, screenWidth: w, screenHeight: Math.min(sh + 30, 14000) });
    await sleep(1400);
  }
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log(`  ${name.padEnd(28)} -> ${OUT}/${name}.png`);
  // restore for next
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 700, screenWidth: w, screenHeight: h });
}
writeFileSync(`${OUT}/bands.json`, JSON.stringify(bands, null, 1));
console.log("\n### CLOSING BAND / CTA PER ROUTE");
for (const [r, b] of Object.entries(bands)) {
  console.log(`\n  ${r}`);
  if (b.err) { console.log("   ERR " + b.err); continue; }
  console.log(`   candidates=${b.nCandidates} docH=${b.docH} gapToFooter=${b.lastBottomGap}px`);
  console.log(`   LAST BAND  cls="${b.last?.cls}"  h=${b.last?.h}px`);
  console.log(`     text: ${b.last?.text}`);
  console.log(`     links: ${JSON.stringify(b.last?.links)}`);
  console.log(`   FOOTER: ${b.footerFirst}`);
}
ws.close(); process.exit(0);
