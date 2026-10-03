import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const ROUTES = ["home", "portfolio", "about", "services", "contact"];
const conn = await connect();
const out = {};

// ---------- A: TRANSFER BYTES per route (encodedDataLength) ----------
out.bytes = {};
for (const r of ROUTES) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await page.send("Network.enable");
  const lens = new Map();
  page.send("Page.navigate", { url: SITE + "#/" + r });
  await sleep(6000);
  // encodedDataLength arrives on loadingFinished
  const fin = page.bucket.finished.map((f) => ({
    url: (page.bucket.responses.find((x) => x.requestId === f.requestId) || {}).url || "?",
    encodedDataLength: f.encodedDataLength || 0,
  }));
  let total = 0, imgBytes = 0, imgCount = 0;
  for (const f of fin) {
    total += f.encodedDataLength || 0;
    if (/\.(jpe?g|webp|png|avif)(\?|$)/i.test(f.url)) {
      imgBytes += f.encodedDataLength || 0;
      imgCount++;
    }
  }
  out.bytes[r] = { totalBytes: total, imgBytes, imgCount, count: fin.length,
                   top: fin.sort((a,b)=>b.encodedDataLength-a.encodedDataLength).slice(0,8).map(f=>({f:f.url.split('/').pop().slice(0,40), kb: Math.round((f.encodedDataLength||0)/1024)})) };
  console.log(`bytes ${r}: total=${Math.round(total/1024)}KB imgs=${imgCount} imgBytes=${Math.round(imgBytes/1024)}KB | top: ${out.bytes[r].top.map(t=>t.f+":"+t.kb+"KB").join(", ")}`);
  page.dispose();
}
conn.close();
process.exit(0);