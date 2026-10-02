/* Where does each piece of hero type actually sit, as a percentage of the
 * hero box? The scrim is a gradient in percent, so this is the map needed to
 * place a plateau behind the text instead of guessing where "38%" landed. */
import { newMobileTarget, nav, js } from '../cdp.mjs';

const s = await newMobileTarget(393, 852, 3);
await nav(s, 'http://127.0.0.1:4188/', 5000);
const g = await js(s, `
const hero=document.querySelector('.hero').getBoundingClientRect();
const H=hero.height;
const q=(sel)=>{const e=document.querySelector(sel); if(!e) return null;
  const b=e.getBoundingClientRect();
  return {sel, topPct:+((b.top-hero.top)/H*100).toFixed(1),
          botPct:+((b.bottom-hero.top)/H*100).toFixed(1),
          topCss:Math.round(b.top), hCss:Math.round(b.height),
          fs:getComputedStyle(e).fontSize};};
return {heroH:Math.round(H), items:['.site-header','.logo','.burger__bars i',
  '.hero__body .eyebrow','.hero__h','.hero__lede','.hero__meta'].map(q)};`);
console.log('hero height', g.heroH, 'css px  (gradient stops are % of this)');
for (const it of g.items) {
  if (it) console.log(it.sel.padEnd(26), 'top', String(it.topPct).padStart(6) + '%', ' bottom', String(it.botPct).padStart(6) + '%', it.fs);
}
s.close();
process.exit(0);
