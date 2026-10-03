import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";

const OUT =
  "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const ROUTES = ["home", "portfolio", "about", "services", "contact"];

const conn = await connect();
const page = await newPage(conn);
await device(page, 393, 852, 3, true);

const out = [];
for (const r of ROUTES) {
  page.reset();
  await goto(page, SITE + "#/" + r);
  await sleep(800);
  const info = await evalJs(
    page,
    `(() => {
      const de = document.documentElement;
      return {
        route: location.hash,
        title: document.title,
        innerWidth: window.innerWidth,
        scrollWidth: de.scrollWidth,
        scrollHeight: de.scrollHeight,
        bodyChildren: document.body.children.length,
        mainHTML: (document.querySelector('main')||{innerHTML:''}).innerHTML.length,
        h1: Array.from(document.querySelectorAll('h1')).map(e=>e.textContent.trim().slice(0,60)),
        navVisible: (()=>{const n=document.querySelector('#site-nav'); if(!n) return 'MISSING'; const cs=getComputedStyle(n); const r=n.getBoundingClientRect(); return {display:cs.display, visibility:cs.visibility, opacity:cs.opacity, w:Math.round(r.width), h:Math.round(r.height), top:Math.round(r.top)};})(),
        burger: (()=>{const b=document.querySelector('button.burger'); if(!b) return 'MISSING'; const r=b.getBoundingClientRect(); const cs=getComputedStyle(b); return {w:Math.round(r.width),h:Math.round(r.height),display:cs.display,expanded:b.getAttribute('aria-expanded'),controls:b.getAttribute('aria-controls')};})(),
        headerZ: (()=>{const h=document.querySelector('.site-header'); if(!h) return 'MISSING'; const cs=getComputedStyle(h); return {position:cs.position, zIndex:cs.zIndex, pointerEvents:cs.pointerEvents};})(),
      };
    })()`,
  );
  const netBad = page.bucket.failed.filter((f) => !f.canceled && f.errorText !== "net::ERR_ABORTED");
  const errs = page.bucket.errors.map((e) => ({ text: (e.text || "").slice(0, 300), source: e.source, url: e.url }));
  const docs = page.bucket.responses.filter((x) => x.type === "Document");
  const sp = await shot(page, `fn1-route-${r}-393.png`);
  out.push({ route: r, url: SITE + "#/" + r, info, errors: errs, netFailed: netBad, documents: docs, shot: sp });
  console.log(
    `${r}: h1=${JSON.stringify(info.h1)} innerW=${info.innerWidth} scrollW=${info.scrollWidth} errs=${errs.length} netfail=${netBad.length}`,
  );
}
writeFileSync(OUT + "fn1-routes.json", JSON.stringify(out, null, 2));
console.log("WROTE fn1-routes.json");
conn.close();
process.exit(0);