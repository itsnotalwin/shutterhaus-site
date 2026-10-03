import { newMobileTarget, nav, js } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const s = await newMobileTarget(393, 852, 3);
const out = {};
for (const r of ['home','portfolio']) {
  await nav(s, BASE + '#/'+r, 6500);
  out[r] = await js(s, `
  // sample the real rendered canvas? no — use matchMedia for the gate
  const gate = {
    hoverHover: matchMedia('(hover: hover)').matches,
    hoverNone:  matchMedia('(hover: none)').matches,
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    pointerFine: matchMedia('(pointer: fine)').matches,
  };
  const imgs = Array.from(document.querySelectorAll('.cell img, .hero img, .pf-cell img'));
  const filt = {};
  for (const i of imgs) { const f = getComputedStyle(i).filter; filt[f] = (filt[f]||0)+1; }
  // which rule would apply if hover:hover were true?
  let bwRule=null;
  for (const ss of document.styleSheets) { try { for (const ru of ss.cssRules) {
     if (ru.type===4) { for (const inner of ru.cssRules) { if ((inner.selectorText||'').includes('is-bw') && (inner.style.filter||'')) bwRule = {media: ru.conditionText, sel: inner.selectorText, filter: inner.style.filter}; } }
  } } catch(e){} }
  return {gate, filtersApplied: filt, imgCount: imgs.length, bwRule,
    shellCls: document.querySelector('.shell').className};`);
}
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync('C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\bw-gate.json', JSON.stringify(out,null,1));
s.close(); process.exit(0);
