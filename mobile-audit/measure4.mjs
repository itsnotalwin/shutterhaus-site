import { newMobileTarget, nav, js, shot } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\';
const s = await newMobileTarget(393, 852, 3);
const out = {};

// Any saturated colour anywhere in the rendered page?
await nav(s, BASE + '#/home', 6500);
out.saturated = await js(s, `
const found=new Map();
for(const el of document.querySelectorAll('*')){
  const cs=getComputedStyle(el);
  for(const prop of ['color','backgroundColor','borderTopColor','borderBottomColor','fill','stroke','outlineColor','textDecorationColor']){
    const v=cs[prop]; if(!v||v==='rgba(0, 0, 0, 0)'||v==='none') continue;
    const m=v.match(/rgba?\\(([^)]+)\\)/); if(!m) continue;
    const p=m[1].split(',').map(Number); const [r,g,b]=p;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    if(mx>0 && (mx-mn)/mx > 0.25) found.set(prop+' '+v+' @'+(typeof el.className==='string'?el.className:el.tagName), (found.get(prop+' '+v)||0)+1);
  }
  const bgi=cs.backgroundImage; if(bgi && /gradient/.test(bgi)){ for(const mm of bgi.matchAll(/rgba?\\([^)]+\\)|#[0-9a-f]{3,6}/g)){ if(/rgb/.test(mm[0])){const p=mm[0].match(/\\d+/g).map(Number);const mx=Math.max(...p.slice(0,3)),mn=Math.min(...p.slice(0,3)); if(mx>0&&(mx-mn)/mx>0.25) found.set('gradient '+mm[0],1);} } }
}
return [...found.entries()];`);

// head meta: og, theme-color, manifest, viewport
out.head = await js(s, `return {
  viewport: document.querySelector('meta[name=viewport]')?.content,
  themeColor: Array.from(document.querySelectorAll('meta[name*=theme-color]')).map(m=>m.content),
  og: Array.from(document.querySelectorAll('meta[property^="og:"],meta[name^="og:"]')).map(m=>m.getAttribute('property')||m.getAttribute('name')+' = '+m.content.slice(0,110)),
  twitter: Array.from(document.querySelectorAll('meta[name^="twitter:"]')).map(m=>m.name+' = '+m.content.slice(0,110)),
  desc: document.querySelector('meta[name=description]')?.content,
  manifest: document.querySelector('link[rel=manifest]')?.href,
  icons: Array.from(document.querySelectorAll('link[rel*=icon],link[rel=apple-touch-icon]')).map(l=>l.rel+' '+l.href.split('/').pop()),
  canonical: document.querySelector('link[rel=canonical]')?.href,
  lang: document.documentElement.lang,
  h1: document.querySelector('h1')?.textContent.trim(),
};`);

// prefers-color-scheme + reduced-motion support
out.mediaSupport = await js(s, `
const rules=[]; for(const ss of document.styleSheets){ try{ for(const r of ss.cssRules){ if(r.type===CSSRule.MEDIA_RULE) rules.push('@media '+r.conditionText); } }catch(e){} }
return {mediaQueries:rules,
  hasDarkScheme: rules.some(r=>/prefers-color-scheme/.test(r)),
  hasReducedMotion: rules.some(r=>/prefers-reduced-motion/.test(r)),
  hasHoverNone: rules.some(r=>/hover:\\s*none/.test(r)),
  hasForcedColors: rules.some(r=>/forced-colors/.test(r))};`);

// animations / transitions actually present
out.motion = await js(s, `
const anims=new Map(), trans=new Map();
for(const el of document.querySelectorAll('*')){ const cs=getComputedStyle(el);
  if(cs.animationName && cs.animationName!=='none') anims.set(cs.animationName+' '+cs.animationDuration+' ease '+cs.animationFillMode, (anims.get(cs.animationName+' '+cs.animationDuration)||0)+1);
  if(cs.transitionDuration && cs.transitionDuration!=='0s') trans.set(cs.transitionProperty+' '+cs.transitionDuration+' '+cs.transitionTimingFunction, (trans.get(cs.transitionProperty)||0)+1);
}
return {animations:[...anims.entries()].slice(0,20), transitions:[...trans.entries()].slice(0,20)};`);

// ---- LIGHTBOX: open one, measure, and test swipe
await nav(s, BASE + '#/portfolio', 6500);
out.lightboxBefore = await js(s, `return {exists: !!document.querySelector('.lb'), count: document.querySelectorAll('.lb').length};`);
await js(s, `document.querySelector('.pf-row .cell')?.click(); return 1;`);
await new Promise(r=>setTimeout(r,1800));
out.lightbox = await js(s, `
const lb=document.querySelector('.lb'); if(!lb) return {opened:false};
const r=lb.getBoundingClientRect(); const cs=getComputedStyle(lb);
const kids=Array.from(lb.querySelectorAll('*')).map(e=>{const b=e.getBoundingClientRect();const c=getComputedStyle(e);
  return {cls:(typeof e.className==='string'?e.className:'').slice(0,34),tag:e.tagName,box:{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)},fs:c.fontSize,col:c.color,bg:c.backgroundColor,ta:c.touchAction,pos:c.position};}).filter(k=>k.box.w>0);
return {opened:true, display:cs.display, zIndex:cs.zIndex, bg:cs.backgroundColor, rect:{w:Math.round(r.width),h:Math.round(r.height)}, kids, html:lb.outerHTML.slice(0,700), bodyOverflow:getComputedStyle(document.body).overflow};`);
out.lightboxShot = await shot(s, '393-lightbox-open', {fullPage:false});

// swipe test: touch drag from right to left
async function touch(pts) {
  await s.send('Input.dispatchTouchEvent', { type: pts.length===1?'touchStart':'touchMove', touchPoints: pts.map((p,i)=>({x:p[0],y:p[1]})) });
}
const before = await js(s, `const i=document.querySelector('.lb img,.lb__img'); return i? i.getAttribute('src')+'|'+i.currentSrc.split('/').pop() : 'none';`);
for (const x of [340,300,250,200,150,100,60]) { await touch([[x,430]]); await new Promise(r=>setTimeout(r,60)); }
await s.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
await new Promise(r=>setTimeout(r,1500));
const after = await js(s, `const i=document.querySelector('.lb img,.lb__img'); const c=document.querySelector('.lb__count,.lb__idx'); return {src:i?i.currentSrc.split('/').pop():'none', count:c?c.textContent.trim():null};`);
out.swipe = { before, after, changed: before.split('|').pop() !== after.src };
console.log('SWIPE:', JSON.stringify(out.swipe));
console.log('LIGHTBOX opened:', out.lightbox.opened, 'kids:', out.lightbox.kids?.length);
console.log('DARK SCHEME:', out.mediaSupport.hasDarkScheme, '| reduced-motion:', out.mediaSupport.hasReducedMotion);
console.log('SATURATED COLOURS FOUND:', JSON.stringify(out.saturated).slice(0,400));
console.log('HEAD:', JSON.stringify(out.head, null, 1));
fs.writeFileSync(OUT+'measure-4.json', JSON.stringify(out,null,1));
s.close(); process.exit(0);
