import { newMobileTarget, nav, js } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const s = await newMobileTarget(393, 852, 3);
await nav(s, BASE + '#/portfolio', 7000);
const o = await js(s, `
const imgs=Array.from(document.querySelectorAll('.pf-cell img, .pf-row img'));
const byFilter={};
for(const i of imgs){ const cs=getComputedStyle(i);
  const key=cs.filter + '|' + cs.mixBlendMode;
  byFilter[key]=(byFilter[key]||0)+1; }
const rows=Array.from(document.querySelectorAll('.pf-row')).slice(0,10).map((r,ri)=>({row:ri, filters:Array.from(r.querySelectorAll('img')).map(i=>getComputedStyle(i).filter)}));
// saturation of the shell / any wrapper
const shell=document.querySelector('.shell');
return {total:imgs.length, byFilter, rows, shellClass:shell.className, shellFilter:getComputedStyle(shell).filter,
  htmlClass:document.documentElement.className, bodyFilter:getComputedStyle(document.body).filter,
  mainFilter:getComputedStyle(document.querySelector('.main')).filter,
  pfRowsFilter:getComputedStyle(document.querySelector('.pf-rows')).filter};`);
console.log(JSON.stringify(o, null, 1));
fs.writeFileSync('C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\bw.json', JSON.stringify(o,null,1));
s.close(); process.exit(0);
