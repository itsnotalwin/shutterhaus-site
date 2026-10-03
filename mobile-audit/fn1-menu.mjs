import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";

const OUT =
  "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const ROUTES = ["home", "portfolio", "about", "services", "contact"];

const conn = await connect();
const page = await newPage(conn);
await device(page, 393, 852, 3, true);
const out = [];

const PROBE = `(() => {
  const de = document.documentElement;
  const nav = document.querySelector('#site-nav');
  const burger = document.querySelector('button.burger');
  const navCS = nav ? getComputedStyle(nav) : null;
  const navR = nav ? nav.getBoundingClientRect() : null;
  const links = nav ? Array.from(nav.querySelectorAll('a.nav-link')) : [];
  const linkData = links.map(a => {
    const r = a.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const hit = (cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight) ? document.elementFromPoint(cx, cy) : null;
    const isSelf = hit === a;
    const inLink = hit ? a.contains(hit) : false;
    return {
      text: a.textContent.trim(), href: a.getAttribute('href'),
      rect: {x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height)},
      cx: Math.round(cx), cy: Math.round(cy),
      hitTag: hit ? (hit.tagName + (hit.className && typeof hit.className === 'string' ? '.'+hit.className.trim().split(/\\s+/).join('.') : '')) : null,
      isSelf, inLink,
      blocked: !!hit && !isSelf && !inLink,
      zOfHit: hit ? getComputedStyle(hit).zIndex : null
    };
  });
  return {
    hash: location.hash,
    innerWidth: innerWidth, scrollWidth: de.scrollWidth,
    ariaExpanded: burger ? burger.getAttribute('aria-expanded') : 'MISSING',
    nav: nav ? {display:navCS.display, visibility:navCS.visibility, opacity:navCS.opacity, position:navCS.position, pointerEvents:navCS.pointerEvents, zIndex:navCS.zIndex,
               rect:{x:Math.round(navR.left),y:Math.round(navR.top),w:Math.round(navR.width),h:Math.round(navR.height)},
               overflowsRight: Math.round(navR.right) > innerWidth,
               rightEdge: Math.round(navR.right)} : 'MISSING',
    linkCount: links.length,
    links: linkData,
    blockedCount: linkData.filter(l=>l.blocked).length
  };
})()`;

// tap helper: real touch dispatch at element centre
const tapSel = async (sel) => {
  const box = await evalJs(
    page,
    `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if(!e) return null;
       e.scrollIntoView({block:'center',behavior:'instant'});
       const r = e.getBoundingClientRect();
       return {x: r.left + r.width/2, y: r.top + r.height/2, w: Math.round(r.width), h: Math.round(r.height)}; })()`,
  );
  if (!box || box.__error) return { ok: false, reason: "not found" };
  for (const type of ["touchStart", "touchEnd"]) {
    await page.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd" ? [] : [{ x: box.x, y: box.y, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
    });
  }
  await sleep(650);
  return { ok: true, box };
};

for (const r of ROUTES) {
  page.reset();
  await goto(page, SITE + "#/" + r);
  await sleep(700);
  const before = await evalJs(page, PROBE);

  const tap = await tapSel("button.burger");
  await sleep(700);
  const open = await evalJs(page, PROBE);
  const spOpen = await shot(page, `fn1-menu-open-${r}-393.png`);

  // link tap should navigate + close menu
  const navHashBefore = open.hash;
  const first = open.links[0];
  let afterLink = null;
  if (first) {
    await page.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: first.cx, y: first.cy, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
    });
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(1100);
    afterLink = await evalJs(page, PROBE);
  }

  // outside-tap close test: reopen, then tap far right of header on empty area
  let outside = null;
  if (r === "home" || r === "contact") {
    await tapSel("button.burger");
    await sleep(600);
    const reopened = await evalJs(page, `document.querySelector('button.burger').getAttribute('aria-expanded')`);
    await page.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 30, y: 780, id: 2, radiusX: 12, radiusY: 12, force: 1 }],
    });
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(700);
    outside = {
      reopenedState: reopened,
      afterOutside: await evalJs(page, PROBE),
    };
  }

  out.push({
    route: r,
    tapBox: tap,
    before,
    open,
    shotOpen: spOpen,
    navHashBefore,
    afterLink,
    outside,
    errors: page.bucket.errors.map((e) => (e.text || "").slice(0, 250)),
  });
  console.log(
    `${r}: expandedBefore=${before.ariaExpanded} -> afterTap=${open.ariaExpanded} navVis=${open.nav.visibility} op=${open.nav.opacity} links=${open.linkCount} blocked=${open.blockedCount} overflowRight=${open.nav.overflowsRight} scrollW=${open.scrollWidth}/${open.innerWidth}` +
      (afterLink ? ` | afterLinkTap: hash=${afterLink.hash} expanded=${afterLink.ariaExpanded}` : "") +
      (outside ? ` | outside: reopened=${outside.reopenedState} afterOutside=${outside.afterOutside.ariaExpanded} navVis=${outside.afterOutside.nav.visibility}` : ""),
  );
  if (open.links.some((l) => l.blocked))
    open.links.filter((l) => l.blocked).forEach((l) => console.log(`   BLOCKED ${l.text} hit=${l.hitTag} z=${l.zOfHit}`));
}
writeFileSync(OUT + "fn1-menu.json", JSON.stringify(out, null, 2));
console.log("WROTE fn1-menu.json");
conn.close();
process.exit(0);