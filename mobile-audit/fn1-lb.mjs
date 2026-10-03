import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const conn = await connect();
const out = {};

for (const route of ["portfolio", "home"]) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  page.reset();
  await goto(page, SITE + "#/" + route);
  await sleep(2500);

  out[route + "_filters"] = await evalJs(
    page,
    `(() => { const n = document.querySelector('.pfilter'); if (!n) return 'NO .pfilter ON THIS ROUTE';
     const btns = Array.from(n.querySelectorAll('.pfilter__item')).map(b => { const r=b.getBoundingClientRect();
       return { text:b.textContent.trim().slice(0,24), w:Math.round(r.width), h:Math.round(r.height), on:b.classList.contains('is-on'), filter:b.getAttribute('data-filter'), y:Math.round(r.top) }; });
     return btns; })()`,
  );
  console.log(route + " filters:", JSON.stringify(out[route + "_filters"]));

  // tap a non-default filter if present
  const fb = out[route + "_filters"];
  if (Array.isArray(fb)) {
    const t = fb.find(f => !f.on && f.filter && f.filter !== "all");
    if (t) {
      const box = await evalJs(page, `(() => { const b=document.querySelector('.pfilter__item[data-filter="${t.filter}"]'); const r=b.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
      await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y, id: 11, radiusX: 12, radiusY: 12, force: 1 }] });
      await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(1400);
      out[route + "_afterFilter"] = await evalJs(page, `({ visible: Array.from(document.querySelectorAll('.pf-cell, .cell')).filter(c=>c.offsetParent!==null).length,
        total: document.querySelectorAll('.pf-cell, .cell').length,
        onBtn: (document.querySelector('.pfilter__item.is-on')||{}).textContent,
        scrollW: document.documentElement.scrollWidth, innerW: innerWidth })`);
      console.log(`  after filter "${t.text}":`, JSON.stringify(out[route + "_afterFilter"]));
    }
  }

  // ---- LIGHTBOX via correct selector .lb ----
  const hasCell = await evalJs(page, `!!document.querySelector('.pf-cell')`);
  if (hasCell) {
    const cellBox = await evalJs(page, `(() => { const c=document.querySelector('.pf-cell'); c.scrollIntoView({block:'center'}); const r=c.getBoundingClientRect();
       return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), w:Math.round(r.width), h:Math.round(r.height) }; })()`);
    await sleep(400);
    const cb2 = await evalJs(page, `(() => { const c=document.querySelector('.pf-cell'); const r=c.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })()`);
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cb2.x, y: cb2.y, id: 12, radiusX: 12, radiusY: 12, force: 1 }] });
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(1800);
    out[route + "_lightbox"] = await evalJs(page, `(() => {
      const lb = document.querySelector('.lb');
      if (!lb) return 'NO .lb ELEMENT';
      const cs = getComputedStyle(lb);
      const r = lb.getBoundingClientRect();
      const img = lb.querySelector('.lb__img');
      const ir = img ? img.getBoundingClientRect() : null;
      const btns = Array.from(lb.querySelectorAll('button')).map(b => { const br=b.getBoundingClientRect(); const bs=getComputedStyle(b);
        return { label: b.getAttribute('aria-label'), cls: b.className, w:Math.round(br.width), h:Math.round(br.height),
                 x:Math.round(br.left), y:Math.round(br.top), display: bs.display, visibility: bs.visibility,
                 inViewport: br.top>=0 && br.bottom<=innerHeight && br.left>=0 && br.right<=innerWidth }; });
      return { hidden: lb.hidden, display: cs.display, visibility: cs.visibility, zIndex: cs.zIndex, position: cs.position,
               rect:{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
               coversViewport: Math.round(r.width)>=innerWidth-1 && Math.round(r.height)>=innerHeight-1,
               imgSrc: img ? (img.currentSrc||'').split('/').pop() : null,
               imgRect: ir ? {w:Math.round(ir.width),h:Math.round(ir.height)} : null,
               caption: (lb.querySelector('.lb__cap')||{}).textContent,
               buttons: btns, bodyOverflow: getComputedStyle(document.body).overflow,
               scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
    })()`);
    console.log(route + " lightbox:", JSON.stringify(out[route + "_lightbox"], null, 1).slice(0, 1600));
    out[route + "_lightboxShot"] = await shot(page, `fn1-lb-${route}.png`);

    // tap-target check on the lightbox controls
    if (typeof out[route + "_lightbox"] === "object" && out[route + "_lightbox"].buttons) {
      out[route + "_lightbox"].tapOffenders = out[route + "_lightbox"].buttons.filter(b => b.w < 44 || b.h < 44);
    }

    // Next / Close behaviour
    const nb = out[route + "_lightbox"].buttons.find(b => b.label === "Next");
    if (nb && nb.w) {
      await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round((nb.x + nb.w/2)), y: Math.round(nb.y + nb.h/2), id: 13, radiusX: 12, radiusY: 12, force: 1 }] });
      await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(1200);
      out[route + "_afterNext"] = await evalJs(page, `({ img: (document.querySelector('.lb__img').currentSrc||'').split('/').pop(), cap: document.querySelector('.lb__cap').textContent.slice(0,60) })`);
      console.log("  after Next:", JSON.stringify(out[route + "_afterNext"]));
      // close
      const xb = out[route + "_lightbox"].buttons.find(b => b.label === "Close");
      await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(xb.x + xb.w/2), y: Math.round(xb.y + xb.h/2), id: 14, radiusX: 12, radiusY: 12, force: 1 }] });
      await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(1200);
      out[route + "_afterClose"] = await evalJs(page, `({ hidden: document.querySelector('.lb').hidden, display: getComputedStyle(document.querySelector('.lb')).display, bodyOverflow: getComputedStyle(document.body).overflow, scrollY: Math.round(scrollY) })`);
      console.log("  after Close:", JSON.stringify(out[route + "_afterClose"]));
    }
    console.log("  errors:", page.bucket.errors.map(e => (e.text||"").slice(0,120)));
    out[route + "_errors"] = page.bucket.errors.map(e => (e.text||"").slice(0,200));
  }
  page.dispose();
}
writeFileSync(OUT + "fn1-lb.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);