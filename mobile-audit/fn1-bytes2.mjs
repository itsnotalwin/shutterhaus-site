import { connect, newPage, device, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const ROUTES = ["home", "portfolio", "about", "services", "contact"];
const conn = await connect();
const out = {};

for (const r of ROUTES) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  // cold cache so encodedDataLength reflects real wire bytes
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.send("Network.clearBrowserCache");
  await page.send("Page.navigate", { url: "about:blank" });
  await sleep(400);
  page.bucket.finished.length = 0;
  page.bucket.responses.length = 0;
  await page.send("Page.navigate", { url: SITE + "#/" + r });
  await sleep(8000);

  const fin = page.bucket.finished.map((f) => {
    const res = page.bucket.responses.find((x) => x.requestId === f.requestId);
    return {
      url: (res && res.url) || "?",
      kb: Math.round(((f.encodedDataLength || 0) / 1024) * 10) / 10,
      raw: f.encodedDataLength || 0,
      type: res ? res.type : "?",
    };
  });
  let total = 0, imgRaw = 0, imgCount = 0;
  for (const f of fin) {
    total += f.raw;
    if (/\.(jpe?g|webp|png|avif)(\?|$)/i.test(f.url)) { imgRaw += f.raw; imgCount++; }
  }
  const imgs = fin.filter((f) => /\.(jpe?g|webp|png|avif)(\?|$)/i.test(f.url));
  const js = fin.filter((f) => f.type === "Script");
  out[r] = {
    totalKB: Math.round(total / 1024),
    imgKB: Math.round(imgRaw / 1024),
    imgCount,
    jsKB: Math.round(js.reduce((a, b) => a + b.raw, 0) / 1024),
    reqCount: fin.length,
    imgs: imgs.sort((a, b) => b.raw - a.raw).slice(0, 6).map((f) => f.url.split("/").pop().slice(0, 38) + ":" + f.kb + "KB"),
    avgImgKB: imgs.length ? Math.round((imgRaw / imgs.length / 1024) * 10) / 10 : 0,
  };
  console.log(
    `${r}: total=${out[r].totalKB}KB reqs=${out[r].reqCount} imgs=${imgCount}(${out[r].imgKB}KB avg=${out[r].avgImgKB}KB) js=${out[r].jsKB}KB | biggest: ${out[r].imgs.join(", ")}`,
  );
  page.dispose();
}
writeFileSync(OUT + "fn1-bytes.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);