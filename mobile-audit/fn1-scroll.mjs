import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const conn = await connect();
const out = {};
const ROUTES = ["home", "portfolio", "about", "services", "contact"];

// ---- TEST 1: header/burger reachability AFTER scrolling down ----
for (const r of ROUTES) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/" + r);
  await sleep(900);
  const top = await evalJs(page, `(() => { const b=document.querySelector('.burger'); const r=b.getBoundingClientRect(); const cs=getComputedStyle(b.closest('header'));
     return { headerPos: cs.position, headerTop: cs.top, headerZ: cs.zIndex, burgerY: Math.round(r.top), scrollY: 0 }; })()`);
  await evalJs(page, `window.scrollTo(0, 1200); 1`);
  await sleep(700);
  const after = await evalJs(page, `(() => {
     const b = document.querySelector('.burger');
     const r = b.getBoundingClientRect();
     const hdr = b.closest('header');
     const cs = getComputedStyle(hdr);
     const cx = r.left + r.width/2, cy = r.top + r.height/2;
     const inView = cy >= 0 && cy < innerHeight;
     const hit = inView ? document.elementFromPoint(cx, cy) : null;
     return { scrollY: Math.round(scrollY), headerPos: cs.position, headerRectTop: Math.round(hdr.getBoundingClientRect().top),
              burgerY: Math.round(r.top), burgerInViewport: inView,
              hitTag: hit ? hit.tagName + '.' + (typeof hit.className==='string'? hit.className : '') : 'OFFSCREEN',
              hitIsBurgerOrChild: hit ? b.contains(hit) : false,
              pageScrollH: document.documentElement.scrollHeight };
  })()`);
  out["scroll_" + r] = { top, after, shot: await shot(page, `fn1-scrolled-${r}-393.png`) };
  console.log(`scroll ${r}: headerPos=${top.headerPos} | at 0: burgerY=${top.burgerY} | after scroll 1200: scrollY=${after.scrollY} headerTop=${after.headerRectTop} burgerY=${after.burgerY} inViewport=${after.burgerInViewport} hit=${after.hitTag}`);
  page.dispose();
}

// ---- TEST 2: outside-tap close, tapping genuinely OUTSIDE the nav panel ----
const page = await newPage(conn);
await device(page, 393, 852, 3, true);
out.outside = {};
for (const r of ["home", "portfolio", "contact"]) {
  await goto(page, SITE + "#/" + r);
  await sleep(900);
  await evalJs(page, `document.querySelector('.burger').click(); 1`);
  await sleep(700);
  const geo = await evalJs(page, `(() => { const n=document.querySelector('#site-nav'); const r=n.getBoundingClientRect();
     return { navRect:{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}, innerH: innerHeight, innerW: innerWidth }; })()`);
  // pick a point clearly below the nav panel and below the header
  const px = 196, py = 600;
  const at = await evalJs(page, `(() => { const e=document.elementFromPoint(${px}, ${py}); const n=document.querySelector('#site-nav'); return { el: e ? e.tagName+'.'+(typeof e.className==='string'?e.className:'') : null, insideNav: e ? n.contains(e) : false }; })()`);
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: px, y: py, id: 5, radiusX: 12, radiusY: 12, force: 1 }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(800);
  const post = await evalJs(page, `({ aria: document.querySelector('.burger').getAttribute('aria-expanded'), navVis: getComputedStyle(document.querySelector('#site-nav')).visibility, bodyClass: document.body.className })`);
  // control: Escape key
  await evalJs(page, `document.querySelector('.burger').click(); 1`);
  await sleep(500);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(700);
  const esc = await evalJs(page, `({ aria: document.querySelector('.burger').getAttribute('aria-expanded'), navVis: getComputedStyle(document.querySelector('#site-nav')).visibility })`);
  out.outside[r] = { geo, tapPoint: { x: px, y: py }, elementAtPoint: at, afterOutsideTap: post, afterEscape: esc };
  console.log(`outside ${r}: navBottom=${geo.navRect.y + geo.navRect.h} tapPoint=${px},${py} el=${at.el} insideNav=${at.insideNav} -> aria=${post.aria} navVis=${post.navVis} | Escape -> aria=${esc.aria}`);
}
page.dispose();
writeFileSync(OUT + "fn1-scroll-outside.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);