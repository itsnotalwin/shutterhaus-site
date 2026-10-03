import { connect, newPage, device, goto, evalJs, sleep, SITE } from "./fn1-cdp.mjs";
const conn = await connect();
const page = await newPage(conn);
await device(page, 393, 852, 3, true);
await goto(page, SITE + "#/about");
await sleep(2500);

const r = await evalJs(
  page,
  `(async () => {
     const img = document.querySelector('img');
     const url = img.currentSrc;
     const out = { url };

     // 1. the live element as-is
     out.liveElement = img.naturalWidth + 'x' + img.naturalHeight;

     // 2. a brand new Image() in the SAME document, same URL
     const a = new Image();
     a.src = url;
     await a.decode();
     out.newImageSameDoc = a.naturalWidth + 'x' + a.naturalHeight;

     // 3. a clone of the live element (same attrs) appended to body
     const c = img.cloneNode(true);
     c.removeAttribute('style');
     document.body.appendChild(c);
     await c.decode();
     out.cloneNoStyle = c.naturalWidth + 'x' + c.naturalHeight;

     // 4. CSS that could affect decoding
     const fig = img.closest('figure');
     const figCS = getComputedStyle(fig);
     const imgCS = getComputedStyle(img);
     out.css = {
       figureContentVisibility: figCS.contentVisibility,
       figureContain: figCS.contain,
       imgContentVisibility: imgCS.contentVisibility,
       imgContain: imgCS.contain,
       imgWillChange: imgCS.willChange,
       imgFilter: imgCS.filter,
       imgTransform: imgCS.transform,
       imgZoom: imgCS.zoom,
       imgObjectFit: imgCS.objectFit,
       figureFilter: figCS.filter,
       figureTransform: figCS.transform,
       bodyZoom: getComputedStyle(document.body).zoom,
       rootZoom: getComputedStyle(document.documentElement).zoom
     };

     // 5. does removing the inline aspect-ratio style change it?
     const d = img.cloneNode(true);
     d.style.cssText = '';
     document.body.appendChild(d);
     await d.decode();
     out.cloneStrippedAllStyle = d.naturalWidth + 'x' + d.naturalHeight;

     // 6. check for any CSS rule touching these elements from a stylesheet
     out.pageZoomLevel = visualViewport ? visualViewport.scale : null;
     out.hardwareConcurrency = navigator.hardwareConcurrency;
     out.deviceMemory = navigator.deviceMemory || null;
     return out;
  })()`,
);
console.log(JSON.stringify(r, null, 1));

// Does Chrome's memory-pressure decode downscaling explain it? Load the SAME img alone.
const p2 = await newPage(conn);
await device(p2, 393, 852, 3, true);
await p2.send("Page.navigate", { url: SITE + "gallery/49-img-0131-1200w.webp" });
await sleep(2500);
const solo = await evalJs(
  p2,
  `(async () => { const i = document.querySelector('img'); return i ? i.naturalWidth+'x'+i.naturalHeight : 'no img'; })()`,
);
console.log("image opened directly in a tab:", solo);
conn.close();
process.exit(0);