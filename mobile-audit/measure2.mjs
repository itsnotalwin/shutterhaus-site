import { newMobileTarget, nav, js } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const s = await newMobileTarget(393, 852, 3);
const out = {};

// ---- portfolio: real grid + tile geometry + tap targets
await nav(s, BASE + '#/portfolio', 6000);
out.portfolio = await js(s, `
const main=document.querySelector('.main');
// find the element that contains many <img>
let best=null,bestN=0;
for(const e of main.querySelectorAll('*')){const n=e.querySelectorAll('img').length;if(n>bestN){bestN=n;best=e;}}
const cs=getComputedStyle(best), r=best.getBoundingClientRect();
const kids=Array.from(best.children).slice(0,4).map(e=>{const kr=e.getBoundingClientRect();return {cls:e.className,tag:e.tagName,w:+kr.width.toFixed(1),h:+kr.height.toFixed(1),left:+kr.left.toFixed(1),top:+kr.top.toFixed(1)};});
return {gridCls:best.className, gridTag:best.tagName, display:cs.display, cols:cs.gridTemplateColumns, gap:cs.gap, w:+r.width.toFixed(1),
  childrenCount:best.children.length, kids,
  tileH:[...new Set(Array.from(best.children).map(e=>+e.getBoundingClientRect().height.toFixed(0)))].slice(0,5),
  tileW:[...new Set(Array.from(best.children).map(e=>+e.getBoundingClientRect().width.toFixed(0)))].slice(0,5),
  figureAspect:getComputedStyle(best.querySelector('img')||best).aspectRatio,
  imgLoading: Array.from(new Set(Array.from(document.images).map(i=>i.loading||'eager'))),
  imgSizes: Array.from(document.images).slice(0,5).map(i=>({src:i.currentSrc.split('/').pop().slice(0,60),natW:i.naturalWidth,natH:i.naturalHeight,renderW:+i.getBoundingClientRect().width.toFixed(0)})),
};`);

out.portfolioTaps = await js(s, `return Array.from(document.querySelectorAll('.main a, .main button, .site-header a, .site-header button, .filters *')).map(e=>{const r=e.getBoundingClientRect();if(r.width<1)return null;return {tag:e.tagName.toLowerCase(),cls:(typeof e.className==='string'?e.className:'').slice(0,44),txt:(e.textContent||'').trim().slice(0,26),w:+r.width.toFixed(1),h:+r.height.toFixed(1),tapH:+(e.closest('[class*=filter]')?e.closest('[class*=filter]').getBoundingClientRect().height:r.height).toFixed(1)};}).filter(Boolean);`);

out.header = await js(s, `const h=document.querySelector('.site-header');const r=h.getBoundingClientRect();const cs=getComputedStyle(h);
const links=Array.from(h.querySelectorAll('a,button')).map(e=>{const lr=e.getBoundingClientRect();return {txt:(e.textContent||'').trim().slice(0,14),w:+lr.width.toFixed(1),h:+lr.height.toFixed(1)};});
return {rect:{w:+r.width.toFixed(1),h:+r.height.toFixed(1)},position:cs.position,bg:cs.backgroundColor,backdrop:cs.backdropFilter,classes:h.className,links,
  brandHTML:h.querySelector('.brand')?.innerHTML?.slice(0,300)};`);

// ---- section rhythm
for (const r of ['home','services','contact','about']) {
  await nav(s, BASE + '#/'+r, 5500);
  out['rhythm_'+r] = await js(s, `return Array.from(document.querySelectorAll('.main > *, .main section')).map(e=>{const b=e.getBoundingClientRect();const cs=getComputedStyle(e);return {cls:(typeof e.className==='string'?e.className:'').slice(0,44),top:Math.round(b.top+scrollY),h:Math.round(b.height),pt:cs.paddingTop,pb:cs.paddingBottom,mt:cs.marginTop};});`);
}

// ---- contact form field sizes
await nav(s, BASE + '#/contact', 5500);
out.form = await js(s, `return Array.from(document.querySelectorAll('input,textarea,select,label,button')).map(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return {tag:e.tagName,type:e.type||'',cls:(typeof e.className==='string'?e.className:'').slice(0,36),w:+r.width.toFixed(1),h:+r.height.toFixed(1),fs:cs.fontSize,lh:cs.lineHeight,ph:e.placeholder||'',phColor:e.placeholder?getComputedStyle(e).getPropertyValue('::placeholder'):''};});`);
out.formPlaceholder = await js(s, `const i=document.querySelector('input');return i?getComputedStyle(i,'::placeholder').color+' / '+getComputedStyle(i,'::placeholder').opacity+' / font '+getComputedStyle(i,'::placeholder').fontSize:null;`);

fs.writeFileSync('C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\measure-2.json', JSON.stringify(out,null,1));
console.log('portfolio grid:', JSON.stringify(out.portfolio.gridCls), out.portfolio.cols, 'tileW', out.portfolio.tileW, 'tileH', out.portfolio.tileH, 'n', out.portfolio.childrenCount);
console.log('form placeholder:', out.formPlaceholder);
console.log('json written');
s.close(); process.exit(0);
