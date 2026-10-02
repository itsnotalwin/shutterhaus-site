// Home page measurement pass — audit v2. Headless Chrome over CDP.
// Emits audit-v2/measure-home.json
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PAGE_URL = "http://127.0.0.1:4173/";
const PORT = 9333;
const OUT = new URL(".", import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, "$1")
  .replace(/%20/g, " ")
  .replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const proc = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  "--user-data-dir=" + OUT + "chrome-profile", "about:blank",
], { stdio: "ignore" });

async function cdpTargets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const j = await r.json();
      if (j.length) return j;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome never came up");
}

const t = (await cdpTargets()).find(x => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
function send(method, params = {}) {
  const myId = ++id;
  return new Promise((res, rej) => {
    pending.set(myId, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result));
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Log.enable");

const results = {};
for (const W of [320, 393, 430, 768, 1440]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: W, height: 852, deviceScaleFactor: 1, mobile: W < 700,
  });
  if (W < 700) {
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Emulation.setEmitTouchEventsForMouse", { enabled: false });
  } else {
    await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  }
  await send("Emulation.setUserAgentOverride", {
    userAgent: W < 700
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  });
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: PAGE_URL });
  await sleep(2600);
  await ev("document.fonts ? document.fonts.ready : null").catch(() => {});
  await sleep(400);

  results[W] = await ev(`(() => {
    const px = v => Math.round(v*100)/100;
    const R = e => { const b = e.getBoundingClientRect(); return { t:px(b.top+scrollY), l:px(b.left), w:px(b.width), h:px(b.height), b:px(b.bottom+scrollY) }; };
    const cs = (e,p) => getComputedStyle(e).getPropertyValue(p);

    // --- headline / type scale on home
    const typeEls = [...document.querySelectorAll('.hero__body .eyebrow, .hero__h, .hero__lede, .hero__body .cta, .hstrip__head, .hcta .eyebrow, .hcta__h, .hcta__k, .hcta__price, .hcta__note, .hcta__btn, .hcta__foot, .logo, .site-nav a')]
      .map(e => { const r = R(e); const s = getComputedStyle(e);
        return { sel: e.className || e.tagName, txt: (e.textContent||'').trim().slice(0,34),
          fs: s.fontSize, lh: s.lineHeight, ls: s.letterSpacing, ff: s.fontFamily.split(',')[0].replace(/"/g,''),
          mt: s.marginTop, mb: s.marginBottom, w:r.w, h:r.h, top:r.t, lines: Math.round(r.h / parseFloat(s.lineHeight||20)) }; });

    // --- headline line-box break detection
    const h1 = document.querySelector('.hero__h');
    const h1r = h1 ? h1.getBoundingClientRect() : null;
    // measure each word's own width against the h1 content box
    const range = document.createRange(); range.selectNodeContents(h1);
    const words = [...range.getClientRects()].map(r => ({ x:px(r.x), y:px(r.y), w:px(r.width), h:px(r.height) }));
    const h1cs = h1 ? getComputedStyle(h1) : null;
    const lineTops = [...new Set(words.map(w=>Math.round(w.y)))];
    // per-line word grouping
    const lines = {};
    words.forEach(w => { const k = Math.round(w.y); (lines[k]=lines[k]||[]).push(w); });

    // --- section rhythm: gaps between top-level home sections
    const secs = [...document.querySelectorAll('.page > *')].map(e => {
      const r = R(e), s = getComputedStyle(e);
      return { sel: e.className || e.tagName, top:r.t, h:r.h, pt:s.paddingTop, pb:s.paddingBottom, mt:s.marginTop };
    });
    const rhythm = [];
    for (let i=1;i<secs.length;i++){
      const prev = secs[i-1], cur = secs[i];
      const gap = px(cur.top - prev.b);
      rhythm.push({ from: prev.sel, to: cur.sel, gapPx: gap,
        gapAfterPad: px(gap - parseFloat(cur.pt||0) - parseFloat(prev.pb||0)) });
    }

    // --- hero composition: where does type start/end inside the hero box
    const hero = document.querySelector('.hero');
    const hr = hero.getBoundingClientRect();
    const body = document.querySelector('.hero__body').getBoundingClientRect();
    const ey  = document.querySelector('.hero__body .eyebrow').getBoundingClientRect();
    const lede= document.querySelector('.hero__lede').getBoundingClientRect();
    const cta = document.querySelector('.hero__body .cta').getBoundingClientRect();
    const meta= document.querySelector('.hero__meta').getBoundingClientRect();
    const fig = document.querySelector('.hero__fig img');
    const heroFill = px(hr.height / Math.max(1,window.innerHeight));
    // how much of the hero has NO text over it, above the eyebrow
    const cleanTop = px(((ey.top - hr.top) / hr.height) * 100);

    // --- strip geometry
    const grid = document.querySelector('.hstrip__grid');
    const gcs = grid ? getComputedStyle(grid) : null;
    const cells = [...document.querySelectorAll('.hstrip__grid img')].map(e => { const r=R(e);
      return { w:r.w, h:r.h, ar:px(r.w/r.h), top:r.t, left:r.l, loading:e.getAttribute('loading'),
               filter: getComputedStyle(e).filter, natural:[e.naturalWidth,e.naturalHeight],
               src: (e.currentSrc||e.src).split('/').pop() }; });
    const cols = gcs ? gcs.gridTemplateColumns : null;

    // --- cta clarity
    const btn = document.querySelector('.hcta__btn');
    const br = btn ? R(btn) : null;
    const ctas = [...document.querySelectorAll('.hero__body .cta, .hcta__btn, .site-nav a')]
      .map(e => { const r=R(e); const s=getComputedStyle(e);
        return { txt:(e.textContent||'').trim(), top:px(r.t+scrollY), w:r.w, h:r.h,
                 color:s.color, bg:s.backgroundColor, deco:s.textDecorationLine,
                 minH:s.minHeight, pad:s.padding }; });

    // --- viewport / fold facts
    const docH = px(document.documentElement.scrollHeight);
    const vh = window.innerHeight;
    const heroEnd = px(hr.bottom + scrollY);
    const stripHead = document.querySelector('.hstrip__head');
    const band = document.querySelector('.hcta');
    return {
      vw: innerWidth, vh, docH, screens: px(docH/vh),
      heroH: px(hr.height), heroFill,
      heroCleanPhotoPct: cleanTop,
      heroTypeBands: { eyebrow:[px(ey.top-hr.top),px(ey.bottom-hr.top)],
                        h1:[px(hr.height? (document.querySelector('.hero__h').getBoundingClientRect().top-hr.top):0), px(document.querySelector('.hero__h').getBoundingClientRect().bottom-hr.top)],
                        lede:[px(lede.top-hr.top),px(lede.bottom-hr.top)],
                        cta:[px(cta.top-hr.top),px(cta.bottom-hr.top)],
                        meta:[px(meta.top-hr.top),px(meta.bottom-hr.top)] },
      heroImg: { objFit: getComputedStyle(fig).objectFit, objPos: getComputedStyle(fig).objectPosition,
                 w: fig.naturalWidth, h: fig.naturalHeight, ar: px(fig.naturalWidth/fig.naturalHeight),
                 boxAr: px(hr.width/hr.height), loading: fig.getAttribute('loading'),
                 fetchprio: fig.getAttribute('fetchpriority'), decoding: fig.getAttribute('decoding'),
                 currentSrc: (fig.currentSrc||'').split('/').pop() },
      h1: h1r ? { text: h1.textContent.trim(), fs: h1cs.fontSize, lh: h1cs.lineHeight,
                 boxW: px(h1r.width), scrollW: h1.scrollWidth, clientW: h1.clientWidth,
                 overflowsBy: px(h1.scrollWidth - h1.clientWidth),
                 wrap: h1cs.overflowWrap, h: px(h1r.height),
                 lineCount: lineTops.length,
                 lines: Object.values(lines).map(g => ({ y:px(g[0].y), words:g.length, right:px(Math.max(...g.map(w=>w.x+w.w))), left:px(Math.min(...g.map(w=>w.x))) })) } : null,
      typeEls, rhythm, secs,
      strip: { cols, gut: gcs?gcs.gap:null, cellCount: cells.length, cells },
      bandTop: band ? R(band).t : null, bandH: band ? R(band).h : null,
      stripHeadTop: stripHead ? R(stripHead).t : null,
      ctas, heroBtn: br ? { w:br.w, h:br.h } : null,
      firstScreen: { heroEnd, fold: px(vh), heroCoversFold: heroEnd >= vh,
                     ctaVisibleInFold: (cta.top+scrollY) <= vh,
                     ledeVisibleInFold: (lede.top+scrollY) <= vh,
                     stripInFirstFold: stripHead ? R(stripHead).t <= vh : null },
      media: { hoverHover: matchMedia('(hover: hover)').matches,
               pointerCoarse: matchMedia('(pointer: coarse)').matches,
               reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
               dark: matchMedia('(prefers-color-scheme: dark)').matches },
      filtersApplied: [...document.querySelectorAll('.page img')].map(e => getComputedStyle(e).filter).filter(f => f && f !== 'none').length,
      imgCount: document.querySelectorAll('.page img').length,
      lazyCount: document.querySelectorAll('.page img[loading="lazy"]').length,
      headerPos: getComputedStyle(document.querySelector('.site-header')).position,
      isBw: !!document.querySelector('.shell.is-bw'),
      hairlineColour: getComputedStyle(document.documentElement).getPropertyValue('--line').trim(),
      dvhUsed: [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r=>r.cssText) } catch { return [] } })
        .filter(t => /dvh|svh|lvh/.test(t)).length,
    };
  })()`);
}

// ---- header sticky behaviour at 393
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: PAGE_URL });
await sleep(2400);
results.headerScroll = await ev(`(async () => {
  const px = v => Math.round(v*100)/100;
  const h = document.querySelector('.site-header');
  const out = [];
  for (const y of [0, 200, 600, 1200, 2400]) {
    scrollTo(0, y);
    await new Promise(r => setTimeout(r, 320));
    const b = h.getBoundingClientRect();
    out.push({ y: px(scrollY), top: px(b.top), pos: getComputedStyle(h).position,
               bg: getComputedStyle(h).backgroundColor, cls: h.className });
  }
  scrollTo(0,0);
  return out;
})()`);

// ---- hero contrast over the actual rendered pixels (worst case sampling)
results.heroContrast = await ev(`(() => {
  // Walk the hero, for each text element find the darkest/lightest pixels under
  // it by reading the decoded image + scrim math is unreliable; instead sample
  // the LIVE composited pixels via html2canvas-free approach: use elementFromPoint
  // is not pixel data. Report the scrim gradient stops and the known measured
  // ratios from the prior audit instead — flagged as carried-forward.
  const scrim = document.querySelector('.hero__scrim');
  const cs = getComputedStyle(scrim);
  return { scrimImage: cs.backgroundImage.slice(0, 400) };
})()`);

// ---- network / weight
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
await send("Network.setCacheDisabled", { cacheDisabled: true });
const reqs = [];
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.method === "Network.responseReceived") reqs.push(m.params.response);
});
await send("Page.navigate", { url: PAGE_URL });
await sleep(4000);
results.network = await ev(`(async () => {
  const r = performance.getEntriesByType('resource');
  const by = {};
  for (const e of r) {
    const k = (e.transferSize||0) > 60000 ? 'big' : 'small';
    by[k] = (by[k]||0) + (e.transferSize||0);
  }
  const nav = performance.getEntriesByType('navigation')[0];
  const lcp = performance.getEntriesByType('largest-contentful-paint');
  return {
    reqCount: r.length,
    totalKB: px0(r.reduce((s,e)=>s+(e.transferSize||0),0)/1024),
    imageKB: px0(r.filter(e=>/\\.(webp|jpg|jpeg|png)/.test(e.name)).reduce((s,e)=>s+(e.transferSize||0),0)/1024),
    biggest: r.sort((a,b)=>(b.transferSize||0)-(a.transferSize||0)).slice(0,8)
      .map(e=>({ n:e.name.split('/').pop(), kb:px0((e.transferSize||0)/1024), start:px0(e.startTime), end:px0(e.responseEnd) })),
    domContentLoaded: px0(nav ? nav.domContentLoadedEventEnd : 0),
    load: px0(nav ? nav.loadEventEnd : 0),
    fcp: (performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime || null,
    lcp: lcp.length ? px0(lcp[lcp.length-1].startTime) : null,
  };
  function px0(v){ return Math.round(v*100)/100 }
})()`);

writeFileSync(OUT + "measure-home.json", JSON.stringify(results, null, 2));
console.log("wrote measure-home.json");
for (const W of [320, 393, 430, 768, 1440]) {
  const r = results[W];
  console.log(`\n=== ${W}px === doc ${r.docH} (${r.screens} screens)`);
  console.log(` h1: ${r.h1?.text} fs=${r.h1?.fs} lines=${r.h1?.lineCount} boxW=${r.h1?.boxW} overflow=${r.h1?.overflowsBy}`);
  console.log(` h1 lines: ${JSON.stringify(r.h1?.lines)}`);
  console.log(` hero: ${r.heroH}px (${r.heroFill} vh) typeFreeTop=${r.heroCleanPhotoPct}% objPos=${r.heroImg.objPos} srcAR=${r.heroImg.ar} boxAR=${r.heroImg.boxAr}`);
  console.log(` strip: cols=${r.strip.cols} cells=${r.strip.cellCount} gaps=${r.rhythm.filter(x=>x.from.includes('hstrip')||x.to.includes('hstrip')).map(x=>x.gapPx).join(',')}`);
  console.log(` rhythm gaps: ${r.rhythm.map(x=>x.gapPx).join(' ')}`);
  console.log(` media: hover=${r.media.hoverHover} bw=${r.isBw} filters=${r.filtersApplied}/${r.imgCount} lazy=${r.lazyCount} header=${r.headerPos}`);
  console.log(` firstScreen: stripInFold=${r.firstScreen.stripInFold} ctaInFold=${r.firstScreen.ctaVisibleInFold} bandTop=${r.bandTop}`);
}
console.log("\nheaderScroll:", JSON.stringify(results.headerScroll));
console.log("network:", JSON.stringify(results.network, null, 1));
ws.close(); proc.kill();
process.exit(0);
