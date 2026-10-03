import { newMobileTarget, nav, js, shot, httpJson } from './cdp.mjs';

const BASE = 'https://shutterhausvisuals.co.za/';
const ROUTES = ['home', 'portfolio', 'about', 'services', 'contact'];

const s = await newMobileTarget(393, 852, 3);
const out = [];

for (const r of ROUTES) {
  const url = BASE + '#/' + r;
  await nav(s, url, 6000);
  const info = await js(s, `return {
    route: location.hash,
    title: document.title,
    mainLen: (document.querySelector('.main')||{}).innerHTML?.length||0,
    imgs: document.images.length,
    docH: document.documentElement.scrollHeight,
    headerClass: document.querySelector('.site-header')?.className||null,
    shellClass: document.querySelector('.shell')?.className||null,
    mainClasses: Array.from(new Set(Array.from(document.querySelectorAll('.main > *')).map(e=>e.className).filter(Boolean))).slice(0,25),
  };`);
  out.push(info);
  const p1 = await shot(s, `393-${r}-full`);
  // viewport-only first impression
  const p2 = await shot(s, `393-${r}-viewport`, { fullPage: false });
  out[out.length-1].shots = [p1, p2];
  console.log(JSON.stringify(info));
}

// Portfolio scrolled deep into the grid
await nav(s, BASE + '#/portfolio', 6000);
const deep = await js(s, `window.scrollTo(0, document.documentElement.scrollHeight*0.45); return {y: window.scrollY, h: document.documentElement.scrollHeight};`);
await new Promise(r=>setTimeout(r,1200));
out.push({ portfolioScroll: deep, shot: await shot(s, '393-portfolio-scrolled-45') });
await js(s, `window.scrollTo(0, document.documentElement.scrollHeight*0.75); return 1;`);
await new Promise(r=>setTimeout(r,1200));
out.push({ shot: await shot(s, '393-portfolio-scrolled-75') });
console.log(JSON.stringify(out[out.length-1]));

fsWrite(JSON.stringify(out, null, 1));
function fsWrite(t){ require('node:fs').writeFileSync('C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\routes.json', t); }
s.close();
process.exit(0);
