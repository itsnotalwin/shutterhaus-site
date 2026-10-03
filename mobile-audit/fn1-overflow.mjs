import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const ROUTES = ["home", "portfolio", "about", "services", "contact"];
const DEVICES = [
  { name: "320x568 iPhone SE1", w: 320, h: 568 },
  { name: "393x852 iPhone 16", w: 393, h: 852 },
  { name: "430x932 16 Pro Max", w: 430, h: 932 },
];
const conn = await connect();
const out = { overflow: {}, drawerOverflow: {} };

const OVERFLOW = `(() => {
  const de = document.documentElement;
  const iw = window.innerWidth;
  const sw = de.scrollWidth;
  const over = [];
  if (sw > iw + 1) {
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (cs.position === 'fixed') continue;
      if (r.right > iw + 1 || r.left < -1) {
        over.push({ tag: e.tagName, cls: typeof e.className==='string'?e.className:'',
                    left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
                    text: (e.textContent||'').trim().slice(0,40),
                    sel: (e.id?'#'+e.id:e.tagName.toLowerCase()+(typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\\s+/).join('.'):'')) });
      }
    }
  }
  return { innerWidth: iw, scrollWidth: sw, bodyScrollWidth: document.body.scrollWidth, overflowBy: sw - iw, offenders: over.slice(0, 25), offenderCount: over.length };
})()`;

for (const d of DEVICES) {
  out.overflow[d.name] = {};
  for (const r of ROUTES) {
    const page = await newPage(conn);
    await device(page, d.w, d.h, 3, true);
    await goto(page, SITE + "#/" + r);
    await sleep(900);
    const m = await evalJs(page, OVERFLOW);
    // also with the drawer open
    await evalJs(page, `document.querySelector('.burger').click(); 1`);
    await sleep(600);
    const drawer = await evalJs(page, OVERFLOW);
    out.overflow[d.name][r] = m;
    out.drawerOverflow[d.name] = out.drawerOverflow[d.name] || {};
    out.drawerOverflow[d.name][r] = drawer;
    const flag = m.overflowBy > 1 || drawer.overflowBy > 1 ? "  <<< OVERFLOW" : "";
    console.log(`${d.name} ${r}: scrollW=${m.scrollWidth} innerW=${m.innerWidth} over=${m.overflowBy} n=${m.offenderCount} | drawer: ${drawer.scrollWidth} over=${drawer.overflowBy} n=${drawer.offenderCount}${flag}`);
    (m.offenders || []).slice(0, 6).forEach(o => console.log(`     ${o.sel} left=${o.left} right=${o.right} w=${o.w} "${o.text}"`));
    (drawer.offenders || []).slice(0, 4).forEach(o => console.log(`     [drawer] ${o.sel} left=${o.left} right=${o.right}`));
    page.dispose();
  }
}
writeFileSync(OUT + "fn1-overflow.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);