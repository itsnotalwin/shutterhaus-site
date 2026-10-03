import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const ROUTES = ["home", "portfolio", "about", "services", "contact"];
const conn = await connect();
const out = {};

// ---- NAV LINK HIT-TESTING, fresh page per route, menu opened properly ----
out.hit = {};
for (const r of ROUTES) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/" + r);
  await sleep(900);
  await evalJs(page, `document.querySelector('.burger').click(); 1`);
  await sleep(800);
  const res = await evalJs(page, `(() => {
    const nav = document.querySelector('#site-nav');
    const links = Array.from(nav.querySelectorAll('a.nav-link'));
    const ncs = getComputedStyle(nav);
    const nrect = nav.getBoundingClientRect();
    const rows = links.map(a => {
      const r = a.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const inVp = cx>=0 && cy>=0 && cx<innerWidth && cy<innerHeight;
      const hit = inVp ? document.elementFromPoint(cx, cy) : null;
      const stack = inVp ? document.elementsFromPoint(cx, cy).slice(0,4).map(e=>e.tagName+'.'+(typeof e.className==='string'?e.className:'')) : [];
      return { text: a.textContent.trim(), href: a.getAttribute('href'),
               rect:{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
               tapPx: Math.round(r.width)+'x'+Math.round(r.height),
               inViewport: inVp, hitTag: hit?hit.tagName+'.'+(typeof hit.className==='string'?hit.className:''):null,
               reachable: hit ? (a.contains(hit) || hit===a) : false, stack };
    });
    return { navVis: ncs.visibility, navRect:{x:Math.round(nrect.left),y:Math.round(nrect.top),w:Math.round(nrect.width),h:Math.round(nrect.height)},
             navRight: Math.round(nrect.right), innerWidth, overflowsRight: Math.round(nrect.right) > innerWidth,
             links: rows, blocked: rows.filter(x=>!x.reachable).length };
  })()`);
  res.shot = await shot(page, `fn1-hit-${r}.png`);
  out.hit[r] = res;
  console.log(`hit ${r}: navVis=${res.navVis} navRight=${res.navRight}/${res.innerWidth} links=${res.links.length} blocked=${res.blocked} taps=[${res.links.map(l=>l.tapPx).join(', ')}]`);
  res.links.filter(l=>!l.reachable).forEach(l=>console.log(`   UNREACHABLE ${l.text} hit=${l.hitTag} stack=${JSON.stringify(l.stack)}`));
  page.dispose();
}

// ---- TAP TARGETS: every interactive element, all routes, 393px ----
out.taps = {};
const TAPSEL = `(() => {
  const sel = 'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(document.querySelectorAll(sel));
  const bad = [];
  let total = 0;
  for (const e of nodes) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;      // not rendered
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (cs.opacity === '0') continue;
    const parentHidden = e.closest('#site-nav:not(.is-open)');
    if (parentHidden) continue;                            // drawer closed
    total++;
    // allow inline text links inside a paragraph to be judged separately
    const inlineInProse = (e.tagName === 'A') && e.closest('p, li, .dim, address');
    if (r.width < 44 || r.height < 44) {
      bad.push({ tag: e.tagName, cls: typeof e.className==='string'?e.className:'', id: e.id,
                 text: (e.textContent||'').trim().slice(0,44),
                 href: e.getAttribute('href'), type: e.getAttribute('type'),
                 w: Math.round(r.width), h: Math.round(r.height), inlineInProse,
                 sel: (e.id ? '#'+e.id : e.tagName.toLowerCase() + (typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\\s+/).join('.'):'')) });
    }
  }
  return { totalInteractive: total, offenders: bad };
})()`;

for (const r of ROUTES) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/" + r);
  await sleep(900);
  const closed = await evalJs(page, TAPSEL);
  // also measure with the drawer open
  await evalJs(page, `document.querySelector('.burger').click(); 1`);
  await sleep(700);
  const open = await evalJs(page, `(() => {
    const sel='a[href], button, input, select, textarea, [role="button"]';
    const bad=[]; let total=0;
    for (const e of document.querySelectorAll(sel)) {
      const r=e.getBoundingClientRect(); if(!r.width&&!r.height) continue;
      const cs=getComputedStyle(e); if(cs.visibility==='hidden'||cs.display==='none'||cs.opacity==='0') continue;
      total++;
      if(r.width<44||r.height<44) bad.push({tag:e.tagName, cls:typeof e.className==='string'?e.className:'', text:(e.textContent||'').trim().slice(0,44), href:e.getAttribute('href'), w:Math.round(r.width), h:Math.round(r.height)});
    }
    return { totalInteractive: total, offenders: bad }; })()`);
  out.taps[r] = { closed, drawerOpen: open };
  console.log(`taps ${r}: interactive=${closed.totalInteractive} offenders=${closed.offenders.length} | drawer: ${open.totalInteractive} offenders=${open.offenders.length}`);
  closed.offenders.forEach(o => console.log(`   ${r}: ${o.sel || o.tag} "${o.text}" ${o.w}x${o.h} inline=${o.inlineInProse}`));
  open.offenders.forEach(o => console.log(`   ${r} [drawer]: ${o.tag}.${o.cls} "${o.text}" ${o.w}x${o.h}`));
  page.dispose();
}
writeFileSync(OUT + "fn1-taps.json", JSON.stringify(out, null, 2));
console.log("WROTE fn1-taps.json");
conn.close();
process.exit(0);