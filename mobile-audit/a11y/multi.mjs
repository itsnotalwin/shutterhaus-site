/* Apply a candidate scrim set and measure it across SEVERAL heroes.
 * One photo passing proves nothing about a scrim whose whole job is to be
 * photo-independent. The brightest frame in the gallery is the honest test;
 * the pinned hero is the regression test (it is what visitors see today). */
import fs from 'node:fs';
import { newMobileTarget, nav, js } from '../cdp.mjs';

const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\a11y\\';
const BASE = process.env.BASE || 'http://127.0.0.1:4188/';
const HEROES = (process.env.HEROES || '').split(',').filter(Boolean);
const CSS = process.env.CSS || '';
const PREFIX = process.env.PREFIX || 'm';

const TARGETS = [
  { key: 'eyebrow',  sel: '.hero__body .eyebrow', pad: 0 },
  { key: 'wordmark', sel: '.logo',                pad: 0 },
  { key: 'burger',   sel: '.burger__bars i',      pad: 3 },
  { key: 'lede',     sel: '.hero__lede',          pad: 0 },
];

const s = await newMobileTarget(393, 852, 3);
await nav(s, BASE, 6000);
await js(s, `return document.fonts.ready.then(()=>1);`);
if (CSS) {
  await js(s, `let st=document.getElementById('__fix');
    if(!st){st=document.createElement('style');st.id='__fix';document.head.appendChild(st);}
    st.textContent=${JSON.stringify(CSS)}; return 1;`);
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

for (const hero of HEROES) {
  const tag = PREFIX + '-' + hero.replace(/\D/g, '').slice(-6);
  await js(s, `const i=document.querySelector('.hero__fig img');
    i.src='/gallery/' + ${JSON.stringify(hero)};
    for (const e of document.querySelectorAll('source'))
      e.srcset = e.srcset.replace(/\\/gallery\\/[^,]+/, '/gallery/' + ${JSON.stringify(hero)});
    return i.decode ? i.decode().then(()=>1) : 1;`);
  await new Promise((r) => setTimeout(r, 700));

  await shotViewport(tag + '-render');
  await js(s, `window.__sv=[]; for (const t of ${JSON.stringify(TARGETS)}) {
    const e=document.querySelector(t.sel); if(!e) continue;
    window.__sv.push([e,e.style.visibility]); e.style.visibility='hidden'; } return 1;`);
  await shotViewport(tag + '-notext');
  await js(s, `for (const [e,v] of window.__sv) e.style.visibility=v; return 1;`);

  const geom = await js(s, `
  const out={};
  for (const t of ${JSON.stringify(TARGETS)}) {
    const e=document.querySelector(t.sel); if(!e){out[t.key]=null;continue;}
    const b=e.getBoundingClientRect(), cs=getComputedStyle(e), p=t.pad||0;
    out[t.key]={sel:t.sel,label:${JSON.stringify(hero)},hero:${JSON.stringify(hero)},
      x:Math.round((b.left-p)*3),y:Math.round((b.top-p)*3),
      w:Math.round((b.width+p*2)*3),h:Math.round((b.height+p*2)*3),
      cssW:+b.width.toFixed(1),cssH:+b.height.toFixed(1),
      fontSize:cs.fontSize,fontFamily:cs.fontFamily.split(',')[0],
      color:cs.color,background:cs.backgroundColor,opacity:+cs.opacity,
      fontWeight:cs.fontWeight,inViewport:b.top>=0&&b.bottom<=innerHeight};
  } return out;`);
  fs.writeFileSync(OUT + tag + '-geom.json', JSON.stringify(geom, null, 1));
  console.log('captured', tag);
}
s.close();
process.exit(0);
