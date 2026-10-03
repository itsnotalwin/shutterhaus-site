import { newMobileTarget, nav, js, shot } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\';
const s = await newMobileTarget(393, 852, 3);
const out = {};

// ---- safe-area / notch handling
out.safeArea = await js(s, `
const probe = document.createElement('div');
probe.style.cssText='position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
document.body.appendChild(probe); const cs=getComputedStyle(probe);
const r={top:cs.paddingTop,bottom:cs.paddingBottom,left:cs.paddingLeft,right:cs.paddingRight}; probe.remove();
// does any rule reference env(safe-area...)
let n=0, samples=[];
for(const ss of document.styleSheets){ try{ for(const ru of ss.cssRules){ const t=ru.cssText||''; if(/safe-area|viewport-fit|dvh|svh|lvh/.test(t)){n++; if(samples.length<6) samples.push(t.slice(0,90));} } }catch(e){} }
return {...r, rulesMentioningSafeArea:n, samples, docVh: getComputedStyle(document.documentElement).height, innerH: innerHeight};`);

// ---- viewport meta
out.viewport = await js(s, `return document.querySelector('meta[name=viewport]')?.content;`);

// ---- lightbox contrast by sampling pixels
await nav(s, BASE + '#/portfolio', 6500);
const tb = await js(s, `const c=document.querySelector('.pf-cell').getBoundingClientRect();return {x:Math.round(c.x+c.width/2),y:Math.round(c.y+c.height/2)};`);
await s.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:tb.x,y:tb.y}] });
await new Promise(r=>setTimeout(r,80));
await s.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
await new Promise(r=>setTimeout(r,1800));
const png = await s.send('Page.captureScreenshot', { format:'png' });
fs.writeFileSync(OUT+'lb-raw.b64', png.data);

// positions of the lightbox controls
out.lbGeom = await js(s, `
const q=(sel)=>{const e=document.querySelector(sel); if(!e) return null; const b=e.getBoundingClientRect(); const c=getComputedStyle(e);
 return {sel, x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),fs:c.fontSize,lh:c.lineHeight,col:c.color,bg:c.backgroundColor,tt:c.textTransform,ls:c.letterSpacing,border:c.border};};
return {cap:q('.lb__cap'), close:q('.lb__x'), prev:q('.lb__nav--p'), next:q('.lb__nav--n'), img:q('.lb__img'), box:q('.lb')};`);

// ---- bottom of viewport check: is the caption inside the iOS home-indicator zone?
out.safeBottomGap = await js(s, `const c=document.querySelector('.lb__cap').getBoundingClientRect(); return {capBottom:Math.round(c.bottom), vh:innerHeight, gapFromBottom:Math.round(innerHeight-c.bottom)};`);

// ---- section rhythm per page
for (const r of ['home','services','contact','about','portfolio']) {
  await nav(s, BASE + '#/'+r, 5500);
  out['rhythm_'+r] = await js(s, `return Array.from(document.querySelectorAll('.main > *')).map(e=>{const b=e.getBoundingClientRect();const cs=getComputedStyle(e);
   return {cls:(typeof e.className==='string'?e.className:'').slice(0,36), top:Math.round(b.top+scrollY), h:Math.round(b.height), pt:cs.paddingTop, pb:cs.paddingBottom, mt:cs.marginTop};});`);
}
fs.writeFileSync(OUT+'measure-6.json', JSON.stringify(out,null,1));
console.log('SAFE AREA:', JSON.stringify(out.safeArea));
console.log('VIEWPORT META:', out.viewport);
console.log('LB GEOM:', JSON.stringify(out.lbGeom, null, 1));
console.log('CAP GAP FROM BOTTOM:', JSON.stringify(out.safeBottomGap));
s.close(); process.exit(0);
