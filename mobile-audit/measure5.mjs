import { newMobileTarget, nav, js, shot } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\';
const s = await newMobileTarget(393, 852, 3);
const out = {};
await nav(s, BASE + '#/portfolio', 6500);

out.tapTest = await js(s, `
const cell=document.querySelector('.pf-cell');
const img=cell?.querySelector('img[data-full]');
const cb=cell?cell.getBoundingClientRect():null;
return {hasCell:!!cell, hasImgWithFull:!!img, cellBox:cb?{x:Math.round(cb.x),y:Math.round(cb.y),w:Math.round(cb.width),h:Math.round(cb.height)}:null,
  cellRole:cell?.getAttribute('role'), cellTab:cell?.getAttribute('tabindex'), cellLabel:cell?.getAttribute('aria-label'),
  imgHasFull:!!img, datasetFullLen: img?.dataset.full?.length};`);

// Real touch tap on the img, via CDP touch (what a finger does)
const tb = out.tapTest.cellBox;
const tx = Math.round(tb.x + tb.w/2), ty = Math.round(tb.y + tb.h/2);
await s.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:tx,y:ty}] });
await new Promise(r=>setTimeout(r,80));
await s.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
await new Promise(r=>setTimeout(r,1500));

out.lb = await js(s, `
const lb=document.querySelector('.lb');
const vis = lb && !lb.hidden;
const r=lb.getBoundingClientRect(); const cs=getComputedStyle(lb);
const kids=Array.from(lb.querySelectorAll('*')).map(e=>{const b=e.getBoundingClientRect();const c=getComputedStyle(e);
  return {cls:e.className,tag:e.tagName,box:{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)},
   fs:c.fontSize,col:c.color,bg:c.backgroundColor,ta:c.touchAction,z:c.zIndex,disp:c.display,vis:c.visibility,op:c.opacity};}).filter(k=>k.box.w>0);
return {visible:vis, zIndex:cs.zIndex, bg:cs.backgroundColor, bodyOverflow:document.body.style.overflow,
  lbRect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
  imgSrc:(lb.querySelector('.lb__img')||{}).currentSrc, cap:(lb.querySelector('.lb__cap')||{}).textContent,
  kids, touchActionOnBox:cs.touchAction, overflow:cs.overflow};`);
console.log('LB visible:', out.lb.visible, 'cap:', out.lb.cap, 'kids:', out.lb.kids.length);
console.log('LB kids:'); for(const k of out.lb.kids) console.log('  ', k.tag+'.'+k.cls, JSON.stringify(k.box), 'fs',k.fs, 'tap-touchArea', k.ta, 'disp',k.disp);
out.lbShot = await shot(s, '393-lightbox-open', {fullPage:false});

// ---- SWIPE TEST: horizontal drag inside the open lightbox
const before = await js(s, `const i=document.querySelector('.lb__img');return {src:i.currentSrc.split('/').pop(),cap:document.querySelector('.lb__cap').textContent};`);
const cy = 430;
const seq = [[350,cy],[320,cy],[285,cy],[250,cy],[215,cy],[180,cy],[145,cy],[110,cy],[75,cy],[40,cy]];
await s.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:seq[0][0],y:cy,id:1}] });
for (const [x,y] of seq.slice(1)) { await s.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x,y,id:1}] }); await new Promise(r=>setTimeout(r,40)); }
await s.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
await new Promise(r=>setTimeout(r,1200));
const after = await js(s, `const i=document.querySelector('.lb__img');return {src:i.currentSrc.split('/').pop(),cap:document.querySelector('.lb__cap').textContent};`);
out.swipe = { before, after, imageChanged: before.src!==after.src, captionChanged: before.cap!==after.cap };
console.log('SWIPE result:', JSON.stringify(out.swipe));

// Does the swipe gesture scroll the page instead? check listeners
out.listeners = await js(s, `return {touchstart: 'unknown (CDP cannot introspect)', bodyScrollTop: window.scrollY};`);

// ---- nav / sticky header behaviour on scroll
await js(s, `document.querySelector('.lb__x')?.click(); return 1;`);
await new Promise(r=>setTimeout(r,600));
out.headerScroll = await js(s, `
const h=document.querySelector('.site-header'); const before=getComputedStyle(h).position;
const res=[]; for(const y of [0,200,600,1200]){ window.scrollTo(0,y); const cs=getComputedStyle(h);
  res.push({y, pos:cs.position, bg:cs.backgroundColor, transform:cs.transform, top:cs.top, shadow:cs.boxShadow.slice(0,40), backdrop:cs.backdropFilter, opacity:cs.opacity, cls:h.className}); }
return {positionAtTop:before, samples:res, headerH:Math.round(h.getBoundingClientRect().height)};`);
console.log('HEADER scroll:', JSON.stringify(out.headerScroll, null, 1));

fs.writeFileSync(OUT+'measure-5.json', JSON.stringify(out,null,1));
s.close(); process.exit(0);
