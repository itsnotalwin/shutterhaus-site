/* ------------------------------------------------------------------
 * worstcase.mjs — measure the same four text pairs against the BRIGHTEST
 * hero the site could ever serve.
 *
 * Why this exists
 * ---------------
 * Measuring only the pinned hero proves almost nothing. White type over a
 * photograph has no fixed contrast: the scrim is a constant, the photo is
 * not. The pinned frame (27-img-0297) happens to be a dark portrait, so it
 * passes. Swap in a frame with a blown sky — which SITE.heroPhoto can point
 * at any time, and which the `portraitShot[0] ?? landscape[0] ?? photos[0]`
 * fallback will pick automatically once the gallery is reordered — and the
 * same CSS fails badly.
 *
 * So the honest test of this scrim is not "does today's photo pass" but
 * "how much headroom does the scrim leave before a bright photo breaks it".
 * This script overrides the hero <img> to a chosen frame, re-runs the same
 * capture pair, and lets contrast.py compute the real numbers. Nothing is
 * stubbed: the pixels decoded are pixels Chrome painted.
 * ------------------------------------------------------------------ */
import fs from 'node:fs';
import { newMobileTarget, nav, js } from '../cdp.mjs';

const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\a11y\\';
const BASE = process.env.BASE || 'http://127.0.0.1:4188/';
const TAG = process.env.TAG || 'wc';
const HERO = process.env.HERO || '';   // gallery filename to force
const HERO_W = process.env.HERO_W || '1600w';

const TARGETS = [
  { key: 'eyebrow',  sel: '.hero__body .eyebrow', pad: 0 },
  { key: 'wordmark', sel: '.logo',                pad: 0 },
  { key: 'burger',   sel: '.burger__bars i',      pad: 7 },
  { key: 'lede',     sel: '.hero__lede',          pad: 0 },
];

const s = await newMobileTarget(393, 852, 3);
await nav(s, BASE, 6000);
await js(s, `return document.fonts.ready.then(()=>1);`);

if (HERO) {
  // Swap the hero src AND the <picture> fallback, then wait for the decode.
  // Without the await the capture can run against the old frame and quietly
  // report the previous photo's numbers under the new filename.
  const ok = await js(s, `
  const img = document.querySelector('.hero__fig img');
  if (!img) return 'no hero img';
  const src = ${JSON.stringify(HERO)};
  const cand = Array.from(document.querySelectorAll('source'))
    .map(e => e.srcset).find(s => s.includes(src.split('-')[0]));
  img.src = ${JSON.stringify('/gallery/' + HERO)};
  if (cand) for (const e of document.querySelectorAll('source')) {
    if (e.srcset === cand) e.srcset = '/gallery/' + src.replace(/-1600w/, '-' + ${JSON.stringify(HERO_W)});
  }
  img.style.objectFit = 'cover';
  return img.src;`);
  await js(s, `const i=document.querySelector('.hero__fig img');
    if (i.decode) return i.decode().then(()=>i.naturalWidth+'x'+i.naturalHeight); return 'n/a';`);
  await new Promise((r) => setTimeout(r, 900));
  const nat = await js(s, `const i=document.querySelector('.hero__fig img'); return i.naturalWidth+'x'+i.naturalHeight+' complete='+i.complete;`);
  console.log('forced hero ->', HERO, '|', ok, '| natural', nat);
}

async function shotViewport(name) {
  await js(s, `scrollTo(0,0); return 1;`);
  const m = await s.send('Page.getLayoutMetrics');
  const vs = m.cssVisualViewport;
  const r = await s.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: Math.ceil(vs.clientWidth), height: Math.ceil(vs.clientHeight), scale: 1 },
    captureBeyondViewport: false,
    optimizeForSpeed: false,
  });
  fs.writeFileSync(OUT + name + '.png', Buffer.from(r.data, 'base64'));
}

await shotViewport(TAG + '-render');

const geom = await js(s, `
const out = {};
for (const t of ${JSON.stringify(TARGETS)}) {
  const e = document.querySelector(t.sel);
  if (!e) { out[t.key] = null; continue; }
  const b = e.getBoundingClientRect(), c = getComputedStyle(e), p = t.pad || 0;
  out[t.key] = { sel:t.sel, label:t.sel, hero:${JSON.stringify(HERO)},
    x: Math.round((b.left-p)*3), y: Math.round((b.top-p)*3),
    w: Math.round((b.width+p*2)*3), h: Math.round((b.height+p*2)*3),
    cssW:+b.width.toFixed(1), cssH:+b.height.toFixed(1),
    fontSize:c.fontSize, fontFamily:c.fontFamily.split(',')[0],
    color:c.color, background:c.backgroundColor, opacity:+c.opacity,
    fontWeight:c.fontWeight, inViewport:b.top>=0 && b.bottom<=innerHeight };
}
return out;`);

await js(s, `window.__sv=[]; for (const t of ${JSON.stringify(TARGETS)}) {
  const e=document.querySelector(t.sel); if(!e) continue;
  window.__sv.push([e,e.style.visibility]); e.style.visibility='hidden'; } return 1;`);
await shotViewport(TAG + '-notext');
await js(s, `for (const [e,v] of window.__sv) e.style.visibility=v; return 1;`);

fs.writeFileSync(OUT + TAG + '-geom.json', JSON.stringify(geom, null, 1));
console.log('wrote', TAG + '-geom.json');
s.close();
process.exit(0);
