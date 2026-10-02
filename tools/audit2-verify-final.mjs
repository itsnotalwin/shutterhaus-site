/**
 * End-to-end verification of every audit fix, against the LOCAL build.
 *
 * Confirms, with measurements rather than inspection:
 *   - the portfolio wall is 2-up on a phone and 3-up on desktop (the big one)
 *   - the wall is 30 frames in 15 rows and every row is still perfectly level
 *   - the homepage H1 no longer splits "PORTRAITURE" at any phone width
 *   - the "Investment" label is legible on the dark band (was 1.03:1)
 *   - the popular package is visually distinct from the other three
 *   - no greyscale filter survives anywhere
 *   - nothing is object-fit:cover any more except the deliberate hero
 *   - the new 560w rung is actually being requested on a phone
 *
 * Run: node tools/audit2-verify-final.mjs
 */
import { writeFileSync } from "node:fs";

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
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

const PROBE = `(() => {
  const cs = el => getComputedStyle(el);
  const rgb = s => { const m = String(s).match(/[\\d.]+/g); return m ? m.slice(0,3).map(Number) : null; };
  const lum = c => { const f = c.map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
  const ratio = (a,b) => { if(!a||!b) return null; const l1=lum(a), l2=lum(b);
    return +(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2)); };
  const bgOf = el => { let n=el;
    while (n && n!==document.documentElement) { const b=cs(n).backgroundColor;
      if (b && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(b)) return b; n=n.parentElement; }
    return cs(document.body).backgroundColor; };

  // any greyscale filter anywhere?
  let filtered = [];
  for (const img of document.querySelectorAll('img')) {
    const f = cs(img).filter;
    if (f && f !== 'none') filtered.push({ src: (img.currentSrc||img.src||'').split('/').pop(), filter: f });
  }
  // any cover crop on a real photo?
  const covered = [...document.querySelectorAll('img')]
    .filter(i => cs(i).objectFit === 'cover' && i.naturalWidth > 0)
    .map(i => ({ src:(i.currentSrc||i.src||'').split('/').pop(), cls: i.className || i.closest('[class]')?.className,
                 nat: i.naturalWidth, box: Math.round(i.getBoundingClientRect().width),
                 ar: +(i.naturalWidth/Math.max(i.naturalHeight,1)).toFixed(3) }));

  // widest requested derivative on the wall
  const wallImgs = [...document.querySelectorAll('.pf-cell img')]
    .map(i => (i.currentSrc||i.src||'').split('/').pop());

  return {
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docHeight: document.documentElement.scrollHeight,
    filtered, covered,
    wallRequested: [...new Set(wallImgs)].slice(0, 4),
    wallCount: document.querySelectorAll('.pf-cell').length,
    brokenImgs: [...document.images].filter(i => i.complete && i.naturalWidth===0 && i.className!=='lb__img').length,
    investLabel: (() => { const el = document.querySelector('.invest__label');
      if (!el) return null; const r = ratio(rgb(cs(el).color), rgb(bgOf(el)));
      return { text: el.textContent.trim(), color: cs(el).color, bg: bgOf(el), contrast: r, legible: r>=4.5 }; })(),
    h1: (() => { const el = document.querySelector('.hero__h, .shead__h, .phead__h, .ct__h');
      if (!el) return null; const c = cs(el);
      const words = el.textContent.trim().split(/\\s+/);
      const longest = words.reduce((a,b)=>b.length>a.length?b:a,'');
      const probe = document.createElement('span');
      probe.textContent = longest; probe.style.cssText='position:absolute;left:-9999px;white-space:pre;visibility:hidden';
      probe.style.font = c.font; probe.style.letterSpacing = c.letterSpacing; probe.style.textTransform = c.textTransform;
      el.appendChild(probe); const need = probe.getBoundingClientRect().width; probe.remove();
      const box = el.getBoundingClientRect();
      return { text: el.textContent.trim().slice(0,40), fontPx: parseFloat(c.fontSize),
        longestWord: longest, needs: Math.round(need), has: Math.round(box.width),
        splitsMidWord: need > box.width + 1, wrap: c.overflowWrap + '/' + c.wordBreak }; })(),
    pkgs: [...document.querySelectorAll('.pkg')].map(p => {
      const s = cs(p);
      return { name: p.querySelector('.pkg__name')?.textContent.trim().slice(0,14),
        popular: p.classList.contains('pkg--pop'), bg: s.backgroundColor, color: s.color,
        spec: p.querySelector('.pkg__spec')?.textContent.trim().slice(0,30) || null,
        specFont: p.querySelector('.pkg__spec') ? cs(p.querySelector('.pkg__spec')).fontSize : null }; }),
  };
})()`;

const WALL = `(() => {
  const cs = el => getComputedStyle(el);
  const rows = [...document.querySelectorAll('.pf-row')];
  const tracks = rows.length ? cs(rows[0]).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  let worst = 0;
  for (const r of rows) { const hs=[...r.querySelectorAll('.pf-cell')].map(c=>c.getBoundingClientRect().height);
    if (hs.length) worst = Math.max(worst, Math.max(...hs)-Math.min(...hs)); }
  const tile = rows[0]?.querySelector('.pf-cell')?.getBoundingClientRect();
  const firstImg = document.querySelector('.pf-cell img');
  // what sizes/srcset did we actually advertise, and what did the browser take?
  const src = firstImg?.closest('picture')?.querySelector('source') || firstImg;
  return { rows: rows.length, cols: tracks, frames: document.querySelectorAll('.pf-cell').length,
    tileW: tile?Math.round(tile.width):0, tileH: tile?Math.round(tile.height):0,
    rowSpreadPx: Math.round(worst*100)/100, docH: document.documentElement.scrollHeight,
    sizesAdvertised: src?.getAttribute('sizes') || null,
    dpr: devicePixelRatio,
    cellCssPx: tile ? Math.round(tile.width) : 0,
    devicePxNeeded: tile ? Math.round(tile.width * devicePixelRatio) : 0,
    chosenSrc: (firstImg?.currentSrc||'').split('/').pop(),
    srcset: (src?.getAttribute('srcset')||'').split(',').map(s=>s.trim().split(' ')[0]).slice(0,6),
  };
})()`;

// Anything wider than the viewport is a horizontal-overflow bug. Name it.
const OVERFLOW = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      out.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,44),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
        text: (el.textContent||'').trim().slice(0,26) });
    }
  }
  return { vw, count: out.length, worst: out.sort((a,b)=>(b.right-b.vw)-(a.right-a.vw)).slice(0,8) };
})()`;

const results = {};
for (const [w, route] of [[320,"portfolio"],[393,"portfolio"],[768,"portfolio"],[1440,"portfolio"],
                           [393,"/"],[393,"services"],[393,"contact"]]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w, height: w < 700 ? 852 : 900, deviceScaleFactor: w < 700 ? 3 : 1, mobile: w < 700 });
  await send("Page.navigate", { url: `${ORIGIN}/${route}` });
  await sleep(2600);
  const key = `${route === "/" ? "home" : route}-${w}`;
  if (route === "portfolio") {
    results[key] = { wall: (await send("Runtime.evaluate", { returnByValue: true, expression: WALL })).result.value,
                     overflow: (await send("Runtime.evaluate", { returnByValue: true, expression: OVERFLOW })).result.value,
                     ...(await send("Runtime.evaluate", { returnByValue: true, expression: PROBE })).result.value };
  } else {
    results[key] = (await send("Runtime.evaluate", { returnByValue: true, expression: PROBE })).result.value;
  }
}
writeFileSync("audit-v2/final-verification.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
ws.close(); process.exit(0);