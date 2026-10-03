import { newMobileTarget, nav, js, shot } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\designshots\\';
const s = await newMobileTarget(393, 852, 3);
await nav(s, BASE + '#/portfolio', 7000);
for (const [pct, name] of [[0.30, '393-portfolio-scroll-30'], [0.50, '393-portfolio-scroll-50'], [0.80, '393-portfolio-scroll-80']]) {
  const y = await js(s, `const t=document.documentElement.scrollHeight*${pct}; window.scrollTo(0,t); return {want:Math.round(t)};`);
  await new Promise(r => setTimeout(r, 1400));
  const actual = await js(s, `return {y:Math.round(window.scrollY), max:Math.round(document.documentElement.scrollHeight-innerHeight)};`);
  // viewport capture: honours the current scroll offset
  const p = await shot(s, name, { fullPage: false });
  console.log(name, JSON.stringify(y), '->', JSON.stringify(actual), p);
  // prove the file differs from its neighbours
  console.log('   size', fs.statSync(p).size);
}
s.close(); process.exit(0);
