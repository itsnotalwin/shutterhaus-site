import { newMobileTarget, nav, js } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\';
const s = await newMobileTarget(393, 852, 3);
const out = {};
for (const r of ['home','services','contact','about','portfolio']) {
  await nav(s, BASE + '#/'+r, 5500);
  out[r] = await js(s, `
  const root=document.querySelector('.main > *') || document.querySelector('.page');
  const blocks=Array.from(root.querySelectorAll(':scope > section, :scope > header, :scope > div, :scope > footer, :scope > * > section'));
  const seen=new Set(); const rows=[];
  for(const e of blocks){ if(seen.has(e)) continue; seen.add(e);
    const b=e.getBoundingClientRect(); if(b.height<4) continue;
    const cs=getComputedStyle(e);
    rows.push({cls:(typeof e.className==='string'?e.className:'').slice(0,40), top:Math.round(b.top+scrollY), h:Math.round(b.height), pt:cs.paddingTop, pb:cs.paddingBottom, mt:cs.marginTop, mb:cs.marginBottom});
  }
  // also every leaf section to catch nested bands
  const more=Array.from(document.querySelectorAll('.page section, .page [class*=band], .page [class*=strip], .page [class*=grid]')).map(e=>{const b=e.getBoundingClientRect();const cs=getComputedStyle(e);
    return {cls:(typeof e.className==='string'?e.className:'').slice(0,40), top:Math.round(b.top+scrollY), h:Math.round(b.height), pt:cs.paddingTop, pb:cs.paddingBottom};}).filter(x=>x.h>10);
  return {rows, more};`);
}
fs.writeFileSync(OUT+'rhythm.json', JSON.stringify(out,null,1));
for (const k in out) { console.log('==',k);
  for(const r of out[k].rows) console.log(`   ${r.cls.padEnd(34)} top=${String(r.top).padEnd(6)} h=${String(r.h).padEnd(6)} pt=${r.pt.padEnd(7)} pb=${r.pb.padEnd(7)} mt=${r.mt}`); }
s.close(); process.exit(0);
