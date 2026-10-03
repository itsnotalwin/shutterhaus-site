import { connect, newPage, device, goto, evalJs, sleep, SITE } from "./fn1-cdp.mjs";
const conn = await connect();
const page = await newPage(conn);
await device(page, 393, 852, 3, true);
await goto(page, SITE + "#/about");
await sleep(2500);

const r = await evalJs(
  page,
  `(() => {
    const img = document.querySelector('figure img, .figure img, img');
    const dpr = window.devicePixelRatio;
    const cs = getComputedStyle(img);
    return {
      src: img.currentSrc,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      devicePixelRatio: dpr,
      widthAttr: img.getAttribute('width'),
      heightAttr: img.getAttribute('height'),
      cssWidth: cs.width, cssHeight: cs.height,
      rectW: img.getBoundingClientRect().width,
      rectH: img.getBoundingClientRect().height,
      complete: img.complete,
      // fresh decode-independent read via createImageBitmap
    };
  })()`,
);
console.log("page read:", JSON.stringify(r, null, 1));

// independent read: fetch the bytes and decode in-page, bypassing any CSS
const r2 = await evalJs(
  page,
  `(async () => {
     const url = document.querySelector('figure img, img').currentSrc;
     const b = await fetch(url);
     const blob = await b.blob();
     const bmp = await createImageBitmap(blob);
     const out = { fetchedBytes: blob.size, bitmapW: bmp.width, bitmapH: bmp.height };
     const probe = new Image();
     probe.src = URL.createObjectURL(blob);
     await probe.decode();
     out.imgNaturalW = probe.naturalWidth;
     out.imgNaturalH = probe.naturalHeight;
     return out;
   })()`,
);
console.log("independent decode:", JSON.stringify(r2, null, 1));
conn.close();
process.exit(0);