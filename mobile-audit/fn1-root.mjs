import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const conn = await connect();
const page = await newPage(conn);
await device(page, 393, 852, 3, true);
const out = {};

const inspect = `(() => {
  const nav = document.querySelector('#site-nav');
  const b = document.querySelector('button.burger');
  const cs = getComputedStyle(nav);
  return { navClass: nav.className, burgerClass: b.className,
           aria: b.getAttribute('aria-expanded'), bodyClass: document.body.className,
           vis: cs.visibility, op: cs.opacity, disp: cs.display, pe: cs.pointerEvents,
           pos: cs.position, top: cs.top, rect: (r=>({x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}))(nav.getBoundingClientRect()),
           matchesIsOpen: nav.matches('.site-nav.is-open'),
           mediaMQ640: matchMedia('(max-width: 640px)').matches };
})()`;

for (const r of ["home", "portfolio", "about"]) {
  await goto(page, SITE + "#/" + r);
  await sleep(1000);
  const s = {};
  s.closed = await evalJs(page, inspect);
  // real touch tap
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 197, y: 41, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(900);
  s.afterTouch = await evalJs(page, inspect);
  s.shot = await shot(page, `fn1-root-${r}.png`);
  out[r] = s;
  console.log(`--- ${r}`);
  console.log("  closed    :", JSON.stringify(s.closed));
  console.log("  afterTouch:", JSON.stringify(s.afterTouch));
}
writeFileSync(OUT + "fn1-rootcause.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);