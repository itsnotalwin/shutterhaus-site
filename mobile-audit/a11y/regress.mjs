/* Evidence shots + a regression check that the sticky header, the nav drawer
 * and the portfolio wall still behave. The inset work touched .site-header
 * padding and height on every route, so "the home page looks right" is not
 * evidence that the other four did not shift. */
import fs from 'node:fs';
import { newMobileTarget, nav, js } from '../cdp.mjs';

const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\a11y\\';
const BASE = process.env.BASE || 'http://127.0.0.1:4188/';
let fail = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fail++; };

const s = await newMobileTarget(393, 852, 3);

async function shotViewport(name) {
  await js(s, `scrollTo(0,0); return 1;`);
  const m = await s.send('Page.getLayoutMetrics');
  const vs = m.cssVisualViewport;
  const r = await s.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: Math.ceil(vs.clientWidth), height: Math.ceil(vs.clientHeight), scale: 1 },
    captureBeyondViewport: false, optimizeForSpeed: false,
  });
  fs.writeFileSync(OUT + name + '.png', Buffer.from(r.data, 'base64'));
}

console.log('\n--- per-route header geometry (393x852, zero insets) ---');
for (const r of ['home', 'services', 'about', 'contact', 'portfolio']) {
  await nav(s, BASE + '#/' + r, 2600);
  const g = await js(s, `
  const h=document.querySelector('.site-header');
  const b=h.getBoundingClientRect();
  const burger=document.querySelector('.burger__bars i');
  const bb=burger?burger.getBoundingClientRect():null;
  const cs=getComputedStyle(h);
  return { top:Math.round(b.top), h:Math.round(b.height), padTop:cs.paddingTop,
    burgerTop: bb?Math.round(bb.top):null, vh:innerHeight,
    firstMainY: (()=>{const m=document.querySelector('.main, .page');
      return m?Math.round(m.getBoundingClientRect().top):null;})() };`);
  console.log('  ' + r.padEnd(10) + JSON.stringify(g));
  await shotViewport('route-' + r);
  ok(g.top === 0, `${r}: sticky header is pinned at top=0`);
  ok(g.h >= 92, `${r}: header height ${g.h}px keeps its designed size (>=92)`);
}

// Scrolled to the bottom of a long page, the sticky header must still be there.
await nav(s, BASE + '#/services', 2600);
await js(s, `scrollTo(0, document.body.scrollHeight); return 1;`);
await new Promise((r) => setTimeout(r, 700));
const bot = await js(s, `const h=document.querySelector('.site-header');
  const b=h.getBoundingClientRect();
  const c=document.body.getBoundingClientRect();
  return { top:Math.round(b.top), bg:getComputedStyle(h).backgroundColor,
           lastElBottom: Math.round(c.bottom) };`);
console.log('  services@bottom ' + JSON.stringify(bot));
ok(bot.top === 0, 'sticky header still pinned at the bottom of a long page');
ok(bot.bg === 'rgb(255, 255, 255)', 'header stays opaque over content (' + bot.bg + ')');
await shotViewport('route-services-bottom');

/* the nav drawer still opens and still covers the hero on home */
await nav(s, BASE + '#/', 2600);
const burgerBox = await js(s, `const b=document.querySelector('.burger__bars i');
  if(!b) return null; const r=b.getBoundingClientRect();
  return { x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2) };`);
await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: burgerBox.x, y: burgerBox.y }] });
await new Promise((r) => setTimeout(r, 90));
await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await new Promise((r) => setTimeout(r, 900));
const drawer = await js(s, `const n=document.querySelector('.site-nav');
  const cs=getComputedStyle(n);
  return { open: document.body.classList.contains('nav-open') ||
                document.documentElement.classList.contains('nav-open'),
           visible: n.getClientRects().length>0, bg: cs.backgroundColor,
           overflow: cs.overflow };`);
console.log('  drawer ' + JSON.stringify(drawer));
ok(drawer.visible, 'nav drawer is still visible after tapping the burger');
await shotViewport('route-home-drawer');

console.log(fail === 0 ? '\nREGRESSION CHECKS PASSED' : `\n${fail} FAILED`);
s.close();
process.exit(fail === 0 ? 0 : 1);
