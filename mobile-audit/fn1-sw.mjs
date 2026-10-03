import { connect, newPage, device, goto, evalJs, sleep, SITE } from "./fn1-cdp.mjs";
const conn = await connect();
const page = await newPage(conn);
await device(page, 393, 852, 3, true);
await goto(page, SITE + "#/about");
await sleep(2500);

const sw = await evalJs(
  page,
  `(async () => {
     const regs = await navigator.serviceWorker.getRegistrations();
     return { count: regs.length, scopes: regs.map(r => r.scope), controller: !!navigator.serviceWorker.controller };
  })()`,
);
console.log("service workers:", JSON.stringify(sw));

const dom = await evalJs(
  page,
  `(() => {
    const img = document.querySelector('img');
    const d = img.ownerDocument;
    return {
      outerHTML: img.outerHTML.slice(0, 400),
      srcset: img.getAttribute('srcset'),
      sizes: img.getAttribute('sizes'),
      src: img.getAttribute('src'),
      currentSrc: img.currentSrc,
      allAttrs: Array.from(img.attributes).map(a => a.name + '=' + a.value.slice(0,90)),
      parentCls: img.parentElement ? img.parentElement.className : null,
      figCls: img.closest('figure') ? img.closest('figure').className : null,
      bgImage: img.closest('figure') ? getComputedStyle(img.closest('figure')).backgroundImage.slice(0,120) : null
    };
  })()`,
);
console.log("img DOM:", JSON.stringify(dom, null, 1));

// what did the network actually return for this image?
const imgs = page.bucket.responses.filter((r) => /gallery\//.test(r.url));
console.log("\nimage responses:", JSON.stringify(imgs.map(r => ({ url: r.url.split('/').pop(), status: r.status })), null, 1));

// get the response body length for the 1200w webp the page used
const target = imgs.find((r) => r.url.includes("49-img-0131-1200w.webp"));
if (target) {
  try {
    const b = await page.send("Network.getResponseBody", { requestId: target.requestId });
    console.log("\nbody for 49-img-0131-1200w.webp: base64Len=" + b.body.length + " (approx " + Math.round((b.body.length * 3) / 4) + " bytes decoded)");
    const buf = Buffer.from(b.body, "base64");
    console.log("magic:", buf.slice(0, 16).toString("hex"), "| ascii:", JSON.stringify(buf.slice(0, 12).toString("latin1")));
    // VP8 lossy dims at offset 26
    if (buf.slice(12, 16).toString() === "VP8 ") {
      const w = buf.readUInt16LE(26) & 0x3fff;
      const h = buf.readUInt16LE(28) & 0x3fff;
      console.log("served VP8 dims:", w + "x" + h, "bytes=" + buf.length);
    }
    if (buf.slice(12, 16).toString() === "VP8L") {
      const bits = buf.readUInt32LE(21);
      console.log("served VP8L dims:", (bits & 0x3fff) + "x" + ((bits >> 14) & 0x3fff), "bytes=" + buf.length);
    }
  } catch (e) {
    console.log("getResponseBody failed:", e.message);
  }
}
conn.close();
process.exit(0);