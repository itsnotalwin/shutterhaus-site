import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";

const conn = await connect();
const page = await newPage(conn);
await device(page, 393, 852, 3, true);
const out = {};

// ---------- DEFECT A: burger unclickable on #/portfolio ----------
await goto(page, SITE + "#/portfolio");
await sleep(1200);

out.portfolioBurger = await evalJs(
  page,
  `(() => {
    const b = document.querySelector('button.burger');
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const hit = document.elementFromPoint(cx, cy);
    const stack = document.elementsFromPoint(cx, cy).map(e => {
      const cs = getComputedStyle(e);
      return e.tagName + (typeof e.className === 'string' && e.className ? '.'+e.className.trim().split(/\\s+/).join('.') : '')
        + ' [z=' + cs.zIndex + ' pos=' + cs.position + ' pe=' + cs.pointerEvents + ' op=' + cs.opacity + ' vis=' + cs.visibility + ']';
    });
    const hdr = document.querySelector('.site-header');
    const hr = hdr.getBoundingClientRect();
    const hcs = getComputedStyle(hdr);
    return {
      burgerRect: {x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height)},
      burgerPoint: {cx:Math.round(cx), cy:Math.round(cy)},
      hitIsBurger: hit === b,
      hitDescendantOfBurger: hit ? b.contains(hit) : false,
      hitDescendantOfHeader: hit ? hdr.contains(hit) : false,
      stackAtBurgerCentre: stack,
      header: {pos: hcs.position, zIndex: hcs.zIndex, overflow: hcs.overflow, pe: hcs.pointerEvents,
               transform: hcs.transform, rect:{x:Math.round(hr.left),y:Math.round(hr.top),w:Math.round(hr.width),h:Math.round(hr.height)}},
      pageAtPoint: (()=>{const e=document.elementFromPoint(cx,cy); return e ? e.tagName+'.'+(typeof e.className==='string'?e.className:'')+' text='+(e.textContent||'').trim().slice(0,40) : null;})(),
      scrollY: Math.round(window.scrollY)
    };
  })()`,
);
out.portfolioShot = await shot(page, "fn1-DEFECT-portfolio-burger-blocked.png");

// programmatic click comparison: does the handler fire at all?
out.portfolioProgrammatic = await evalJs(
  page,
  `(() => {
    const b = document.querySelector('button.burger');
    b.click();
    return { ariaAfterProgrammaticClick: b.getAttribute('aria-expanded'),
             navVis: getComputedStyle(document.querySelector('#site-nav')).visibility };
  })()`,
);
await sleep(400);

// same check on home for contrast
await goto(page, SITE + "#/home");
await sleep(900);
out.homeBurger = await evalJs(
  page,
  `(() => {
    const b = document.querySelector('button.burger');
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
    const hdr = document.querySelector('.site-header');
    return { hitIsBurger: hit===b, headerPos: getComputedStyle(hdr).position,
             stack: document.elementsFromPoint(r.left+r.width/2, r.top+r.height/2).map(e=>e.tagName+'.'+(typeof e.className==='string'?e.className:'')) };
  })()`,
);

// ---------- DEFECT B: outside tap does not close menu ----------
for (const r of ["home", "about", "portfolio"]) {
  await goto(page, SITE + "#/" + r);
  await sleep(900);
  await evalJs(page, `document.querySelector('button.burger').click(); 1`);
  await sleep(600);
  const st = await evalJs(page, `document.querySelector('button.burger').getAttribute('aria-expanded')`);
  // tap in the page body, well below the header
  const target = await evalJs(
    page,
    `(() => { const b=document.querySelector('button.burger'); const r=b.getBoundingClientRect();
       return {x: Math.round(40), y: Math.round(Math.min(innerHeight-20, r.bottom+260)),
               what: (()=>{const e=document.elementFromPoint(40, Math.min(innerHeight-20, r.bottom+260)); return e?e.tagName+'.'+(typeof e.className==='string'?e.className:''):null;})()}; })()`,
  );
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: target.x, y: target.y, id: 3, radiusX: 12, radiusY: 12, force: 1 }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(700);
  const after = await evalJs(
    page,
    `(() => { const b=document.querySelector('button.burger'); const n=document.querySelector('#site-nav');
       return { expanded: b.getAttribute('aria-expanded'), navVis: getComputedStyle(n).visibility, navOpacity: getComputedStyle(n).opacity }; })()`,
  );
  // also try a real mouse-equivalent click (what a finger on iOS Safari dispatches)
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
  await sleep(700);
  const afterClick = await evalJs(
    page,
    `(() => { const b=document.querySelector('button.burger'); const n=document.querySelector('#site-nav');
       return { expanded: b.getAttribute('aria-expanded'), navVis: getComputedStyle(n).visibility }; })()`,
  );
  out["outside_" + r] = { openedState: st, tapPoint: target, afterTouchTap: after, afterMouseClick: afterClick };
  await shot(page, `fn1-outside-${r}.png`);
}

// is there any outside-click / document listener registered?
out.listeners = await evalJs(
  page,
  `(() => {
    // inspect for a scrim/backdrop element that might be intended as the tap-away target
    const hdr = document.querySelector('.site-header');
    const kids = Array.from(hdr.children).map(e => e.tagName+'.'+(typeof e.className==='string'?e.className:''));
    return { headerChildren: kids, hasScrim: !!document.querySelector('.nav-scrim,.scrim,.overlay'),
             bodyOverflow: getComputedStyle(document.body).overflow };
  })()`,
);

writeFileSync(OUT + "fn1-defects.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
conn.close();
process.exit(0);