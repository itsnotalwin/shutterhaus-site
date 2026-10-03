import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const conn = await connect();
const out = {};

// ---- portfolio: srcset descriptors + why lazy images all fetched ----
{
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/portfolio");
  await sleep(3000);
  out.portfolio = await evalJs(
    page,
    `(() => {
      const cell = document.querySelector('.pf-cell');
      const pic = cell ? cell.querySelector('picture') : null;
      const img = cell ? cell.querySelector('img') : null;
      const rows = Array.from(document.querySelectorAll('.pf-row')).map(r => {
        const cs = getComputedStyle(r);
        const b = r.getBoundingClientRect();
        return { cols: cs.getPropertyValue('--row-cols'), display: cs.display,
                 overflowX: cs.overflowX, scrollW: Math.round(r.scrollWidth), clientW: Math.round(r.clientWidth),
                 rect: {y:Math.round(b.top), h:Math.round(b.height)}, horizontallyScrollable: r.scrollWidth > r.clientWidth + 1 };
      });
      const imgs = Array.from(document.querySelectorAll('.pf-cell img'));
      return {
        firstCellHTML: pic ? pic.outerHTML.slice(0, 700) : 'no picture',
        sources: pic ? Array.from(pic.querySelectorAll('source')).map(s => ({ media: s.media, type: s.type, sizes: s.getAttribute('sizes'), srcset: s.getAttribute('srcset') })) : [],
        imgSrcset: img ? img.getAttribute('srcset') : null,
        imgSizes: img ? img.getAttribute('sizes') : null,
        imgCurrentSrc: img ? img.currentSrc.split('/').pop() : null,
        rows,
        cellCount: document.querySelectorAll('.pf-cell').length,
        imgCount: imgs.length,
        loadingAttrs: { lazy: imgs.filter(i=>i.getAttribute('loading')==='lazy').length,
                         eager: imgs.filter(i=>i.getAttribute('loading')!=='lazy').length },
        // how many are complete (i.e. actually downloaded) vs still pending
        complete: imgs.filter(i=>i.complete && i.naturalWidth>0).length,
        pending: imgs.filter(i=>!i.complete).length
      };
    })()`,
  );
  console.log("portfolio srcset:", JSON.stringify(out.portfolio.sources, null, 1).slice(0, 1400));
  console.log("rows:", JSON.stringify(out.portfolio.rows));
  console.log(`cells=${out.portfolio.cellCount} imgs=${out.portfolio.imgCount} lazy=${out.portfolio.loadingAttrs.lazy} complete=${out.portfolio.complete} pending=${out.portfolio.pending}`);
  out.portfolio.shot = await shot(page, "fn1-portfolio-top.png");

  // ---- FILTER interaction ----
  out.filters = await evalJs(
    page,
    `(() => {
      const btns = Array.from(document.querySelectorAll('.pfilter__item'));
      return btns.map(b => { const r=b.getBoundingClientRect(); return { text:b.textContent.trim().slice(0,30), w:Math.round(r.width), h:Math.round(r.height), on:b.classList.contains('is-on'), filter:b.getAttribute('data-filter') }; });
    })()`,
  );
  console.log("filters:", JSON.stringify(out.filters));
  // tap a non-default filter
  const target = out.filters.find(f => !f.on && f.filter && f.filter !== "all");
  if (target) {
    await evalJs(page, `document.querySelector('.pfilter__item[data-filter="${target.filter}"]').click(); 1`);
    await sleep(1200);
    out.afterFilter = await evalJs(
      page,
      `({ visibleCells: Array.from(document.querySelectorAll('.pf-cell')).filter(c=>c.offsetParent!==null).length,
         totalCells: document.querySelectorAll('.pf-cell').length,
         onBtn: document.querySelector('.pfilter__item.is-on') ? document.querySelector('.pfilter__item.is-on').textContent.trim() : null,
         h1: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : null,
         scrollW: document.documentElement.scrollWidth, innerW: innerWidth })`,
    );
    console.log(`after tapping filter "${target.text}":`, JSON.stringify(out.afterFilter));
    out.afterFilter.shot = await shot(page, "fn1-filter-tapped.png");
  }
  page.dispose();
}

// ---- lightbox: open from a cell, check controls + close ----
{
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/portfolio");
  await sleep(2500);
  const cellBox = await evalJs(page, `(() => { const c=document.querySelector('.pf-cell'); const r=c.getBoundingClientRect();
     return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cellBox.x, y: cellBox.y, id: 9, radiusX: 12, radiusY: 12, force: 1 }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(1500);
  out.lightbox = await evalJs(
    page,
    `(() => {
      const lb = document.querySelector('.lightbox, #lightbox, [class*=lightbox]');
      if (!lb) return 'NO LIGHTBOX IN DOM';
      const cs = getComputedStyle(lb);
      const r = lb.getBoundingClientRect();
      const img = lb.querySelector('img');
      const btns = Array.from(lb.querySelectorAll('button')).map(b => { const br=b.getBoundingClientRect();
         return { text:(b.textContent||'').trim().slice(0,20) || b.getAttribute('aria-label') || b.className, w:Math.round(br.width), h:Math.round(br.height), x:Math.round(br.left), y:Math.round(br.top) }; });
      return { id: lb.id, cls: lb.className, display: cs.display, visibility: cs.visibility, zIndex: cs.zIndex,
               position: cs.position, rect: {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
               coversViewport: Math.round(r.width) >= innerWidth - 1 && Math.round(r.height) >= innerHeight - 1,
               imgSrc: img ? img.currentSrc.split('/').pop() : null,
               imgRect: img ? (ir=>({w:Math.round(ir.width),h:Math.round(ir.height)}))(img.getBoundingClientRect()) : null,
               buttons: btns, bodyOverflow: getComputedStyle(document.body).overflow,
               ariaHidden: lb.getAttribute('aria-hidden') };
    })()`,
  );
  console.log("lightbox:", JSON.stringify(out.lightbox, null, 1).slice(0, 1200));
  out.lightboxShot = await shot(page, "fn1-lightbox-open.png");
  page.dispose();
}
writeFileSync(OUT + "fn1-interactions.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);