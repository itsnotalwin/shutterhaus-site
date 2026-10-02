/* ------------------------------------------------------------------
 * sweep.mjs — measure candidate scrims instead of guessing alpha.
 *
 * The defect is that white type over a photograph has no fixed contrast.
 * Picking "0.55 because it sounds dark" is how a fix lands and still
 * fails, so every candidate here is INJECTED into the live page, painted,
 * captured and decoded by the same contrast.py that found the failure.
 * The number that comes back is the only reason to keep a value.
 *
 * Candidates override the two gradient stops that matter:
 *   --scrim-top  the band behind the header wordmark and the burger
 *   --scrim-mid  the band behind the hero eyebrow (the 38% dip)
 *   --scrim-bot  the band behind the hero lede and the CTA
 * ------------------------------------------------------------------ */
import fs from 'node:fs';
import { newMobileTarget, nav, js } from '../cdp.mjs';

const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\a11y\\';
const BASE = process.env.BASE || 'http://127.0.0.1:4188/';
const HERO = process.env.HERO || '30-img-0396.jpg';

const TARGETS = [
  { key: 'eyebrow',  sel: '.hero__body .eyebrow', pad: 0 },
  { key: 'wordmark', sel: '.logo',                pad: 0 },
  { key: 'burger',   sel: '.burger__bars i',      pad: 3 },
  { key: 'lede',     sel: '.hero__lede',          pad: 0 },
];

// top/mid/bot plateaus. The mid plateau is what the old gradient lacked:
// it dipped to 0.12 at 38%, which is exactly where the eyebrow sits.
const CANDS = JSON.parse(process.env.CANDS || '[]');

const s = await newMobileTarget(393, 852, 3);
await nav(s, BASE, 6000);
await js(s, `return document.fonts.ready.then(()=>1);`);

if (HERO) {
  await js(s, `const i=document.querySelector('.hero__fig img');
    i.src=${JSON.stringify('/gallery/' + HERO)};
    for (const e of document.querySelectorAll('source')) {
      e.srcset = e.srcset.replace(/\\/gallery\\/[^,]+/, '/gallery/' + ${JSON.stringify(HERO)});
    }
    return i.decode ? i.decode().then(()=>1) : 1;`);
  await new Promise((r) => setTimeout(r, 800));
}

async function shotViewport(name) {
  await js(s, `scrollTo(0,0); return 1;`);
  const m = await s.send('Page.getLayoutMetrics');
  const vs = m.cssVisualViewport;
  const r = await s.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: Math.ceil(vs.clientWidth), height: Math.ceil(vs.clientHeight), scale: 1 },
    captureBeyondViewport: false, optimizeForSpeed: false,
  });
  fs.writeFileSync(OUT + name + '.png', Buffer.from(r.data, 'base64'));
}

for (const c of CANDS) {
  await js(s, `
  let st = document.getElementById('__sweep');
  if (!st) { st = document.createElement('style'); st.id='__sweep'; document.head.appendChild(st); }
  st.textContent = ${JSON.stringify(c.css)};
  return 1;`);
  await new Promise((r) => setTimeout(r, 350));
  await shotViewport(c.tag + '-render');
  await js(s, `window.__sv=[]; for (const t of ${JSON.stringify(TARGETS)}) {
    const e=document.querySelector(t.sel); if(!e) continue;
    window.__sv.push([e,e.style.visibility]); e.style.visibility='hidden'; } return 1;`);
  await shotViewport(c.tag + '-notext');
  await js(s, `for (const [e,v] of window.__sv) e.style.visibility=v; return 1;`);
  const geom = await js(s, `
  const out={};
  for (const t of ${JSON.stringify(TARGETS)}) {
    const e=document.querySelector(t.sel); if(!e){out[t.key]=null;continue;}
    const b=e.getBoundingClientRect(), cs=getComputedStyle(e), p=t.pad||0;
    out[t.key]={sel:t.sel,label:t.sel,cand:${JSON.stringify(c.tag)},
      x:Math.round((b.left-p)*3),y:Math.round((b.top-p)*3),
      w:Math.round((b.width+p*2)*3),h:Math.round((b.height+p*2)*3),
      cssW:+b.width.toFixed(1),cssH:+b.height.toFixed(1),
      fontSize:cs.fontSize,fontFamily:cs.fontFamily.split(',')[0],
      color:cs.color,background:cs.backgroundColor,opacity:+cs.opacity,
      fontWeight:cs.fontWeight,inViewport:b.top>=0&&b.bottom<=innerHeight};
  } return out;`);
  fs.writeFileSync(OUT + c.tag + '-geom.json', JSON.stringify(geom, null, 1));
  console.log('captured', c.tag);
}
s.close();
process.exit(0);
