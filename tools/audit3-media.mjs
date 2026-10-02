/**
 * audit3-media — CORRECTED image + tap-target + line-measure probe.
 * The first sweep read b.width/b.height but R() returns {w,h}, so every
 * upscaled/distorted/under-44px comparison was null<44 => false. Redone here.
 * Run: node tools/audit3-media.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

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

const PROBE = `(() => {
  const out = { images: [], taps: [], measures: [] };

  // ---- IMAGES: real box vs natural ----
  for (const img of document.querySelectorAll('img')) {
    const b = img.getBoundingClientRect(), cs = getComputedStyle(img);
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const boxAR = b.height > 0 ? b.width / b.height : null;
    const natAR = (nw > 0 && nh > 0) ? nw / nh : null;
    out.images.push({
      src: (img.currentSrc || img.src || '').split('/').pop().slice(0, 52),
      alt: img.alt ?? null, hasAlt: img.hasAttribute('alt'), altLen: (img.alt || '').length,
      bw: +b.width.toFixed(1), bh: +b.height.toFixed(1), nw, nh,
      awAttr: img.getAttribute('width'), ahAttr: img.getAttribute('height'),
      loading: img.getAttribute('loading'), fp: img.getAttribute('fetchpriority'),
      fit: cs.objectFit, display: cs.display, complete: img.complete,
      loaded: nw > 0,
      // upscaled: CSS box wider than the delivered bitmap
      upRatio: (nw > 0 && b.width > 0) ? +(b.width / nw).toFixed(2) : null,
      upscaled: nw > 0 && b.width > nw + 1,
      // letterboxed: object-fit:cover on a box whose AR differs from natural => crop
      crops: cs.objectFit === 'cover' && boxAR && natAR && Math.abs(boxAR - natAR) > 0.02,
      arSkew: boxAR && natAR ? +((boxAR / natAR) - 1).toFixed(3) : null,
      visibleAboveFold: b.top < window.innerHeight && b.bottom > 0,
      isFirstInDoc: img === document.querySelector('img'),
    });
  }

  // ---- TAP TARGETS (correct keys this time) ----
  for (const el of document.querySelectorAll('a,button,input,select,textarea,[role=button]')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    let clipped = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (pc.display === 'none' || pc.visibility === 'hidden' || pc.opacity === '0') { clipped = true; break; }
    }
    out.taps.push({
      tag: el.tagName.toLowerCase(), cls: typeof el.className === 'string' ? el.className.trim() : '',
      txt: (el.textContent || el.placeholder || '').trim().replace(/\\s+/g, ' ').slice(0, 34),
      w: +b.width.toFixed(1), h: +b.height.toFixed(1),
      x: +b.left.toFixed(1), y: +(b.top + scrollY).toFixed(1), clipped,
      href: el.getAttribute('href') || '',
      // padding is what makes a small-text link a legal tap target
      pad: cs.padding, fs: cs.fontSize, lh: cs.lineHeight,
      display: cs.display,
    });
  }

  // ---- LINE MEASURE: real chars-per-line using measured text width ----
  for (const el of document.querySelectorAll('p,li,dd,h1,h2,h3,h4,figcaption,blockquote')) {
    const txt = el.textContent.trim(); if (txt.length < 30) continue;
    const b = el.getBoundingClientRect(); if (b.width < 40) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    // measure a representative lowercase string at this exact font
    const probeSpan = document.createElement('span');
    probeSpan.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
    probeSpan.style.font = cs.font; probeSpan.style.letterSpacing = cs.letterSpacing;
    probeSpan.textContent = 'abcdefghijklmnopqrstuvwxyz ';
    document.body.appendChild(probeSpan);
    const perChar = probeSpan.getBoundingClientRect().width / 27;
    probeSpan.remove();
    if (!perChar || !isFinite(perChar)) continue;
    const range = document.createRange(); range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter(r => r.width > 4);
    if (!rects.length) continue;
    const widest = Math.max(...rects.map(r => r.width));
    out.measures.push({
      cls: typeof el.className === 'string' && el.className ? el.className.trim().split(/\\s+/)[0] : el.tagName.toLowerCase(),
      tag: el.tagName.toLowerCase(), fs, blockW: +b.width.toFixed(1),
      widestLine: +widest.toFixed(1), lines: rects.length,
      cpl: Math.round(widest / perChar),
      sample: txt.replace(/\\s+/g, ' ').slice(0, 50),
    });
  }
  return out;
})()`;

const WIDTHS = [320, 393, 430, 768, 1024, 1440, 1920];
const ROUTES = ["/", "/portfolio", "/about", "/services", "/contact"];
const out = {};
for (const route of ROUTES) {
  out[route] = {};
  for (const w of WIDTHS) {
    try {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700, screenWidth: w, screenHeight: 900 });
      await waitForVW(w);
      await send("Page.navigate", { url: ORIGIN + route });
      await sleep(2200);
      await evR("document.fonts.ready");
      await sleep(500);
      await evR("Promise.race([Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))), new Promise(r=>setTimeout(r,3500))])").catch(() => {});
      out[route][w] = await evR(PROBE);
      const d = out[route][w];
      const up = d.images.filter(i => i.upscaled).length;
      const cr = d.images.filter(i => i.crops).length;
      const bad = d.taps.filter(t => !t.clipped && (t.w < 44 || t.h < 44));
      console.log(`  ${route.padEnd(11)} ${String(w).padStart(4)}px  imgs=${d.images.length} upscaled=${up} cropped=${cr} | taps=${d.taps.length} under44=${bad.length}`);
    } catch (e) { console.log(`  ${route.padEnd(11)} ${w}px !! ${String(e.message).slice(0, 150)}`); }
    writeFileSync("audit-v2/audit3/media.json", JSON.stringify(out, null, 1));
  }
}
console.log("\nwrote audit-v2/audit3/media.json");
ws.close(); process.exit(0);
