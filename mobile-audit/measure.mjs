import { newMobileTarget, nav, js } from './cdp.mjs';
import fs from 'node:fs';

const BASE = 'https://shutterhausvisuals.co.za/';
const ROUTES = ['home', 'portfolio', 'about', 'services', 'contact'];
const s = await newMobileTarget(393, 852, 3);

const CONTRAST_FN = `
function srgb(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function lum(rgb){return 0.2126*srgb(rgb[0])+0.7152*srgb(rgb[1])+0.0722*srgb(rgb[2]);}
function ratio(a,b){const L1=lum(a),L2=lum(b);const hi=Math.max(L1,L2),lo=Math.min(L1,L2);return (hi+0.05)/(lo+0.05);}
function parse(c){const m=c.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number);return p;}
function blend(fg,alpha,bg){return [0,1,2].map(i=>fg[i]*alpha+bg[i]*(1-alpha));}
function effBg(el){
  let n=el, acc=null;
  while(n && n!==document.documentElement){
    const cs=getComputedStyle(n); const bc=parse(cs.backgroundColor);
    if(bc){ const a=bc.length>3?bc[3]:1;
      if(a>0.99) return bc.slice(0,3);
      acc = acc===null? blend(bc,a,[255,255,255]) : blend(bc,a,acc);
      if(a===1) return acc;
    }
    n=n.parentElement;
  }
  const root=getComputedStyle(document.body).backgroundColor;
  const r=parse(root)||[255,255,255];
  return acc? [0,1,2].map(i=>acc[i]*(1-1)+r[i]): r;
}
function hex(a){return '#'+a.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');}
`;

const typeScript = `
const seen=new Map();
const els=document.querySelectorAll('.main *, .site-header *, .site-footer *, .bottom-bar *');
for(const el of els){
  const own=Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
  if(!own) continue;
  const cs=getComputedStyle(el);
  if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) continue;
  const r=el.getBoundingClientRect();
  if(r.width<1||r.height<1) continue;
  const key=[el.tagName,cs.fontSize,cs.lineHeight,cs.fontWeight,cs.color,cs.fontFamily.split(',')[0],cs.letterSpacing,cs.textTransform].join('|');
  if(seen.has(key)){seen.get(key).count++;seen.get(key).samples.push(own.slice(0,50));continue;}
  seen.set(key,{count:1,sel:el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'):''),
    fontSize:cs.fontSize,lineHeight:cs.lineHeight,fontWeight:cs.fontWeight,fontFamily:cs.fontFamily.split(',')[0],
    letterSpacing:cs.letterSpacing,textTransform:cs.textTransform,color:cs.color,bg:hex(effBg(el)),
    ratio:+ratio(parse(cs.color).slice(0,3),effBg(el)).toFixed(2),
    w:Math.round(r.width),h:Math.round(r.height),samples:[own.slice(0,50)]});
}
return {viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio,docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight},
  overflowX: document.documentElement.scrollWidth>innerWidth?document.documentElement.scrollWidth-innerWidth:0,
  types:[...seen.values()].sort((a,b)=>parseFloat(b.fontSize)-parseFloat(a.fontSize))};
`;

const all = {};
for (const r of ROUTES) {
  await nav(s, BASE + '#/' + r, 6000);
  const o = await js(s, CONTRAST_FN + '\n' + typeScript);
  // section spacing
  o.sections = await js(s, `return Array.from(document.querySelectorAll('.main > section, .main section, .main > * > *')).slice(0,60).map(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return {tag:e.tagName.toLowerCase(),cls:(typeof e.className==='string'?e.className:'').slice(0,60),top:Math.round(r.top+scrollY),h:Math.round(r.height),pt:cs.paddingTop,pb:cs.paddingBottom,mt:cs.marginTop,mb:cs.marginBottom};});`);
  // tap targets
  o.taps = await js(s, `return Array.from(document.querySelectorAll('a,button,[role=button],input,select,textarea,label')).map(e=>{const r=e.getBoundingClientRect();if(r.width<1)return null;const cs=getComputedStyle(e);return {tag:e.tagName.toLowerCase(),cls:(typeof e.className==='string'?e.className:'').slice(0,50),txt:(e.textContent||e.getAttribute('aria-label')||e.type||'').trim().slice(0,30),w:+r.width.toFixed(1),h:+r.height.toFixed(1),fs:cs.fontSize};}).filter(Boolean);`);
  // grids / columns
  o.grids = await js(s, `return Array.from(document.querySelectorAll('.grid,.work-grid,.gallery,.portfolio-grid,[class*=grid],[class*=cols]')).map(e=>{const cs=getComputedStyle(e);const r=e.getBoundingClientRect();return {cls:(typeof e.className==='string'?e.className:'').slice(0,60),display:cs.display,cols:cs.gridTemplateColumns,gap:cs.gap,w:Math.round(r.width),pad:cs.padding};}).slice(0,25);`);
  all[r] = o;
  console.log(r, 'types:', o.types.length, 'overflowX:', o.overflowX, 'taps<44:', o.taps.filter(t=>t.h<44||t.w<44).length);
}
fs.writeFileSync('C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\measure-393.json', JSON.stringify(all, null, 1));
s.close(); process.exit(0);
