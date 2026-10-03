import { connect, newPage, device, goto, evalJs, sleep, SITE } from "./fn1-cdp.mjs";
const conn = await connect();
const url = SITE + "gallery/49-img-0131-1200w.webp";

// A) bare page with only an <img>, vary DPR
for (const dpr of [1, 2, 3]) {
  const page = await newPage(conn);
  await device(page, 393, 852, dpr, true);
  await page.send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  const r = await evalJs(
    page,
    `(async () => {
       const img = new Image();
       img.src = ${JSON.stringify(url)};
       await img.decode();
       return { dpr: devicePixelRatio, natural: img.naturalWidth + 'x' + img.naturalHeight };
    })()`,
  );
  console.log("bare img DPR" + dpr + ":", JSON.stringify(r));
  page.dispose();
}

// B) real site at varying DPR + with/without CSS applied
for (const dpr of [1, 2, 3]) {
  const page = await newPage(conn);
  await device(page, 393, 852, dpr, true);
  await goto(page, SITE + "#/about");
  await sleep(2200);
  const r = await evalJs(
    page,
    `(() => {
      const img = document.querySelector('img');
      const cs = getComputedStyle(img);
      return { dpr: devicePixelRatio, natural: img.naturalWidth+'x'+img.naturalHeight,
               css: cs.width+'x'+cs.height, imageRendering: cs.imageRendering };
    })()`,
  );
  console.log("site #/about DPR" + dpr + ":", JSON.stringify(r));
  page.dispose();
}

// C) same file, but does a scaled-down CSS box change naturalWidth? (isolate DPR vs CSS)
{
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await page.send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  const r = await evalJs(
    page,
    `(async () => {
      const out = {};
      for (const w of [100, 357, 1200]) {
        const d = document.createElement('div');
        d.style.width = w + 'px';
        const img = document.createElement('img');
        img.style.width = '100%';
        d.appendChild(img); document.body.appendChild(d);
        img.src = ${JSON.stringify(url)};
        await img.decode();
        out['cssBox_' + w] = img.naturalWidth + 'x' + img.naturalHeight;
      }
      return out;
    })()`,
  );
  console.log("CSS-box isolation (DPR3):", JSON.stringify(r));
  page.dispose();
}
conn.close();
process.exit(0);