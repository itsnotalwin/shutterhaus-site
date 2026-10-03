import { connect, newPage, device, goto, evalJs, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const ROUTES = ["home", "portfolio", "about", "services", "contact"];
const conn = await connect();
const out = {};

// real intrinsic size from the FILE, via fetch+decode (immune to Chrome decode downscaling)
const IMGS = `(async () => {
  const roots = Array.from(document.querySelectorAll('figure, .pf-cell, .cell'));
  const seen = new Set(); const rows = [];
  for (const root of roots) {
    for (const img of root.querySelectorAll('img')) {
      if (seen.has(img)) continue; seen.add(img);
      const r = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      let tw = 0, th = 0;
      try {
        const blob = await (await fetch(img.currentSrc || img.src)).blob();
        const bmp = await createImageBitmap(blob);
        tw = bmp.width; th = bmp.height; bmp.close && bmp.close();
      } catch (e) { }
      const devW = r.width * 3, devH = r.height * 3;
      rows.push({
        file: (img.currentSrc||'').split('/').pop(),
        trueW: tw, trueH: th,
        reportedNatural: img.naturalWidth + 'x' + img.naturalHeight,
        cssBox: Math.round(r.width) + 'x' + Math.round(r.height),
        neededAtDPR3: Math.round(devW) + 'x' + Math.round(devH),
        wasteRatio: tw && th ? Math.round(((tw*th)/(devW*devH))*100)/100 : null,
        tooSmallForDPR3: tw ? (devW > tw + 1) : null,
        loading: img.getAttribute('loading'), fp: img.getAttribute('fetchpriority'),
        alt: img.getAttribute('alt'), altMissing: img.getAttribute('alt') === null,
        hasSrcset: !!img.getAttribute('srcset'),
        inPicture: !!img.closest('picture'),
        pictureSources: img.closest('picture')
          ? Array.from(img.closest('picture').querySelectorAll('source')).map(s => (s.media||'')+'|'+(s.type||'')+'|'+(s.srcset||'').slice(0,60))
          : []
      });
    }
  }
  return { count: rows.length, rows };
})()`;

out.images = {};
for (const r of ROUTES) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  page.reset();
  await goto(page, SITE + "#/" + r);
  await sleep(2000);
  const m = await evalJs(page, IMGS);
  const bytes = page.bucket.responses
    .filter((x) => /\.(jpe?g|webp|png|avif|gif|svg)(\?|$)/i.test(x.url))
    .map((x) => ({ f: x.url.split("/").pop(), status: x.status }));
  out.images[r] = { ...m, imageResponses: bytes };
  const bad = m.rows.filter((x) => x.tooSmallForDPR3);
  console.log(`\n=== ${r}: ${m.count} imgs, image responses=${bytes.length}`);
  console.log(`  inPicture=${m.rows.filter(x=>x.inPicture).length} noSrcset=${m.rows.filter(x=>!x.hasSrcset).length} noAlt=${m.rows.filter(x=>x.altMissing).length} notLazy=${m.rows.filter(x=>x.loading!=='lazy').length}`);
  console.log(`  UNDERSIZED for DPR3 (needs more px than file has): ${bad.length}`);
  bad.slice(0, 8).forEach(x => console.log(`     ${x.file} file=${x.trueW}x${x.trueH} css=${x.cssBox} needs@3x=${x.neededAtDPR3}`));
  m.rows.slice(0, 4).forEach(x => console.log(`     ${x.file} file=${x.trueW}x${x.trueH} reportedNat=${x.reportedNatural} css=${x.cssBox} loading=${x.loading} waste=${x.wasteRatio}`));
  page.dispose();
}
writeFileSync(OUT + "fn1-images2.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);