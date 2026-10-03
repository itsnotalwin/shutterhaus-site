import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const conn = await connect();
const out = {};

// ---- DEFECT: header not sticky — measure how a mid-page user must scroll to reach the burger ----
out.header = {};
for (const r of ["portfolio", "services", "contact"]) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/" + r);
  await sleep(1200);
  const m = await evalJs(
    page,
    `(() => {
      const hdr = document.querySelector('.site-header');
      const cs = getComputedStyle(hdr);
      const de = document.documentElement;
      const total = de.scrollHeight - innerHeight;
      return { position: cs.position, top: cs.top, isSticky: cs.position==='sticky'||cs.position==='fixed',
               pageHeight: de.scrollHeight, viewport: innerHeight, maxScroll: Math.round(total),
               headerHeight: Math.round(hdr.getBoundingClientRect().height) };
    })()`,
  );
  // scroll to the very bottom, then see if the burger is reachable
  await evalJs(page, `window.scrollTo(0, document.documentElement.scrollHeight); 1`);
  await sleep(800);
  const bottom = await evalJs(
    page,
    `(() => { const b=document.querySelector('.burger'); const r=b.getBoundingClientRect();
       const cy = r.top + r.height/2;
       return { scrollY: Math.round(scrollY), burgerBottom: Math.round(r.bottom), burgerTop: Math.round(r.top),
                inViewport: r.bottom > 0 && r.top < innerHeight, cy: Math.round(cy),
                hit: (r.bottom>0&&r.top<innerHeight) ? (()=>{const e=document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(cy)); return e?e.tagName:'none';})() : 'OFFSCREEN' }; })()`,
  );
  out.header[r] = { ...m, atBottom: bottom, shot: await shot(page, `fn1-bottom-${r}.png`) };
  console.log(`${r}: headerPosition=${m.position} sticky=${m.isSticky} pageH=${m.pageHeight} maxScroll=${m.maxScroll} | at bottom: scrollY=${bottom.scrollY} burgerTop=${bottom.burgerTop} burgerBottom=${bottom.burgerBottom} inViewport=${bottom.inViewport}`);
  page.dispose();
}

// ---- DEFECT: menu open does not lock background scroll ----
{
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/portfolio");
  await sleep(1000);
  await evalJs(page, `window.scrollTo(0, 800); 1`);
  await sleep(500);
  const beforeY = await evalJs(page, `Math.round(scrollY)`);
  await evalJs(page, `document.querySelector('.burger').click(); 1`);
  await sleep(700);
  const openState = await evalJs(page, `({ bodyClass: document.body.className, bodyOverflow: getComputedStyle(document.body).overflow, htmlOverflow: getComputedStyle(document.documentElement).overflow, scrollY: Math.round(scrollY) })`);
  // try to scroll the page while the drawer is open (touch drag on the drawer area)
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 196, y: 500, id: 20, radiusX: 12, radiusY: 12, force: 1 }] });
  for (let i = 0; i < 6; i++) {
    await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 196, y: 500 - i * 40, id: 20, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(60);
  }
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(800);
  const afterY = await evalJs(page, `Math.round(scrollY)`);
  // programmatic scroll behind an open drawer
  const progY = await evalJs(page, `(() => { window.scrollTo(0, 0); return Math.round(scrollY); })()`);
  out.scrollLock = { beforeY, openState, afterTouchDrag: afterY, afterProgrammaticScroll: progY };
  console.log(`\nscroll lock: before=${beforeY} open=${JSON.stringify(openState)} afterDrag=${afterY} afterProgScrollTo0=${progY}`);
  out.scrollLockShot = await shot(page, "fn1-menuscroll-bg.png");
  page.dispose();
}
writeFileSync(OUT + "fn1-header.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);