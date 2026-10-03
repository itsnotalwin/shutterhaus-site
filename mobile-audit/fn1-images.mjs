import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const ROUTES = ["home", "portfolio", "about", "services", "contact"];
const conn = await connect();
const out = { images: {} };

// scoped to real gallery/photo selectors from source: .hero__fig, .pf-cell, .cell, .strip img, .feature img
const IMGS = `(() => {
  const roots = Array.from(document.querySelectorAll('.hero__fig, .pf-cell, .cell, .figure, figure'));
  const seen = new Set();
  const rows = [];
  for (const root of roots) {
    const imgs = root.tagName === 'IMG' ? [root] : Array.from(root.querySelectorAll('img'));
    for (const img of imgs) {
      if (seen.has(img)) continue; seen.add(img);
      const r = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      const holder = img.closest('[data-photo-id], .pf-cell, .cell');
      rows.push({
        src: (img.currentSrc || img.src || '').split('/').pop().slice(0,60),
        fullSrc: (img.currentSrc || img.src || '').slice(0,140),
        natural: img.naturalWidth + 'x' + img.naturalHeight,
        naturalW: img.naturalWidth, naturalH: img.naturalHeight,
        rendered: Math.round(r.width) + 'x' + Math.round(r.height),
        renderedW: Math.round(r.width * 100) / 100, renderedH: Math.round(r.height * 100) / 100,
        cssW: cs.width, cssH: cs.height,
        loading: img.getAttribute('loading'),
        decoding: img.getAttribute('decoding'),
        fetchPriority: img.getAttribute('fetchpriority'),
        srcset: img.getAttribute('srcset') ? img.getAttribute('srcset').slice(0,200) : null,
        sizes: img.getAttribute('sizes'),
        alt: img.getAttribute('alt'),
        altMissing: img.getAttribute('alt') === null,
        altEmpty: img.getAttribute('alt') === '',
        complete: img.complete,
        hasSrcset: !!img.getAttribute('srcset'),
        holderCls: holder ? (typeof holder.className==='string'?holder.className:'') : '',
        visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'
      });
    }
  }
  // DPR-3 waste analysis: rendered device px vs natural px
  for (const x of rows) {
    if (!x.naturalW || !x.naturalH) { x.waste = 'no natural dims'; continue; }
    const devW = x.renderedW * 3, devH = x.renderedH * 3;
    const areaRatio = (devW * devH) / (x.naturalW * x.naturalH);
    x.devicePx = Math.round(devW) + 'x' + Math.round(devH);
    x.areaRatio = Math.round(areaRatio * 100) / 100;
    x.oversized = areaRatio > 2;
    x.undersized = areaRatio < 0.5;
  }
  return { count: rows.length, rows };
})()`;

for (const r of ROUTES) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/portfolio".replace("portfolio", r));
  await sleep(1500);
  const m = await evalJs(page, IMGS);
  // lightbox image is hidden; audit it separately
  const lb = await evalJs(page, `(() => { const i = document.querySelector('#lb-img, .lightbox img, .lb__img');
     if (!i) return 'no lightbox img';
     return { src: (i.getAttribute('src')||'').slice(0,120), natural: i.naturalWidth+'x'+i.naturalHeight, alt: i.getAttribute('alt'), display: getComputedStyle(i).display }; })()`);
  out.images[r] = { ...m, lightbox: lb, shot: await shot(page, `fn1-img-${r}.png`) };
  const o = out.images[r];
  console.log(`\n=== ${r}: ${o.count} imgs | lightbox: ${JSON.stringify(lb)}`);
  o.rows.slice(0, 12).forEach(x => console.log(`  ${x.src} nat=${x.natural} rend=${x.rendered} dev@3x=${x.devicePx} ratio=${x.areaRatio} loading=${x.loading} srcset=${x.hasSrcset} alt=${x.alt===null?'MISSING':(x.altEmpty?'EMPTY(decorative)':'"'+x.alt.slice(0,30)+'"')}${x.oversized?'  <<< OVERSIZED':''}`));
  console.log(`  summary: noAltAttr=${o.rows.filter(x=>x.altMissing).length} emptyAlt=${o.rows.filter(x=>x.altEmpty).length} noLazy=${o.rows.filter(x=>x.loading!=='lazy').length} noSrcset=${o.rows.filter(x=>!x.hasSrcset).length} oversized=${o.rows.filter(x=>x.oversized).length}`);
  page.dispose();
}
writeFileSync(OUT + "fn1-images.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);