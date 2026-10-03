import { newMobileTarget, nav, js, shot } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\';
const out = {};

// ============ HERO SCRIM: sample real rendered pixels under the header + behind the heading
const s = await newMobileTarget(393, 852, 3);
await nav(s, BASE + '#/home', 7000);
await js(s, `document.querySelectorAll('*').forEach(e=>{const cs=getComputedStyle(e);if(cs.animationName!=='none'&&cs.animationName) e.style.animation='none';}); return 1;`);
await new Promise(r=>setTimeout(r,600));

out.hero = await js(s, `
const hero=document.querySelector('.hero');
const scrimEl=document.querySelector('.hero__scrim') || Array.from(hero.querySelectorAll('*')).find(e=>/gradient/.test(getComputedStyle(e).backgroundImage));
const r=hero.getBoundingClientRect(); const cs=getComputedStyle(hero);
const scr = scrimEl? {cls:scrimEl.className, bg:getComputedStyle(scrimEl).backgroundImage, inset:[getComputedStyle(scrimEl).top,getComputedStyle(scrimEl).inset,getComputedStyle(scrimEl).bottom], z:getComputedStyle(scrimEl).zIndex, pe:getComputedStyle(scrimEl).pointerEvents}:null;
const hdr=document.querySelector('.site-header');
const hd=document.querySelector('.brand');
const h1=document.querySelector('.hero__h');
const meta=document.querySelector('.hero__meta');
function box(e){if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};}
return {heroRect:box(hero), heroH:Math.round(r.height), vh:innerHeight, heroPos:cs.position,
  scrim:scr, header:box(hdr), brand:box(hd), h1:box(h1), h1FS:getComputedStyle(h1).fontSize, h1Color:getComputedStyle(h1).color,
  meta:box(meta), metaFS:meta?getComputedStyle(meta.querySelector('span')||meta).fontSize:null,
  headerPos:getComputedStyle(hdr).position, headerBG:getComputedStyle(hdr).backgroundColor,
  overlayEls:Array.from(hero.querySelectorAll('*')).filter(e=>{const b=e.getBoundingClientRect();return b.top<60&&b.height>0;}).map(e=>({cls:e.className,tag:e.tagName,box:box(e),z:getComputedStyle(e).zIndex,bg:getComputedStyle(e).backgroundColor,bgi:/gradient/.test(getComputedStyle(e).backgroundImage)?'GRADIENT':'',col:getComputedStyle(e).color,fs:getComputedStyle(e).fontSize})).slice(0,14)};`);

// Sample pixels from the actual screenshot under the header and behind the h1
const png = await s.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(OUT + 'hero-raw.b64', png.data);
console.log('hero json:', JSON.stringify(out.hero, null, 1));

// ============ 320 and 430
for (const [w, h, tag] of [[320, 568, 'w320'], [430, 932, 'w430']]) {
  const s2 = await newMobileTarget(w, h, 3);
  const rec = {};
  for (const r of ['home', 'portfolio', 'services', 'contact']) {
    await nav(s2, BASE + '#/' + r, 5500);
    rec[r] = await js(s2, `
    const ov=document.documentElement.scrollWidth-innerWidth;
    const pf=document.querySelector('.pf-row');
    const h1=document.querySelector('.hero__h,.phead__h');
    const wide=Array.from(document.querySelectorAll('.main *')).filter(e=>{const b=e.getBoundingClientRect();return b.right>innerWidth+1||b.left<-1;}).slice(0,8).map(e=>({cls:(typeof e.className==='string'?e.className:'').slice(0,40),l:Math.round(e.getBoundingClientRect().left),r:Math.round(e.getBoundingClientRect().right)}));
    return {overflowX:ov, pfCols:pf?getComputedStyle(pf).gridTemplateColumns:null, tileW:pf?Math.round(pf.children[0].getBoundingClientRect().width):null,
      h1FS:h1?getComputedStyle(h1).fontSize:null, h1Box:h1?{w:Math.round(h1.getBoundingClientRect().width),sw:h1.scrollWidth,cw:h1.clientWidth}:null,
      offscreen:wide, docH:document.documentElement.scrollHeight};`);
    const p = await shot(s2, `${tag}-${r}-full`);
    rec[r].shot = p;
  }
  out[tag] = rec;
  console.log(tag, JSON.stringify(rec.home), JSON.stringify(rec.portfolio));
  s2.close();
}
fs.writeFileSync(OUT + 'measure-3.json', JSON.stringify(out, null, 1));
s.close(); process.exit(0);
