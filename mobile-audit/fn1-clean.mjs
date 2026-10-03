import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const conn = await connect();
const out = {};

// ---- A: fresh FULL load of each route (no hash-spa carry-over) ----
for (const r of ["home", "portfolio", "about", "services", "contact"]) {
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/" + r);
  await sleep(1000);
  const s = {};
  s.freshClosed = await evalJs(page, `({bodyClass: document.body.className, aria: document.querySelector('.burger').getAttribute('aria-expanded'), navVis: getComputedStyle(document.querySelector('#site-nav')).visibility, bodyOverflow: getComputedStyle(document.body).overflow, scrollW: document.documentElement.scrollWidth, innerW: innerWidth})`);
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 197, y: 41, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(900);
  s.afterTap = await evalJs(page, `({bodyClass: document.body.className, aria: document.querySelector('.burger').getAttribute('aria-expanded'), navVis: getComputedStyle(document.querySelector('#site-nav')).visibility, navOpacity: getComputedStyle(document.querySelector('#site-nav')).opacity})`);
  s.shot = await shot(page, `fn1-clean-open-${r}.png`);
  out["fresh_" + r] = s;
  console.log(`fresh ${r}: closed=${JSON.stringify(s.freshClosed)} afterTap=${JSON.stringify(s.afterTap)}`);
  page.dispose();
}

// ---- B: SPA hash navigation, checking body.nav-open leakage + scroll lock ----
const page = await newPage(conn);
await device(page, 393, 852, 3, true);
await goto(page, SITE + "#/home");
await sleep(900);
// open menu on home
await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 197, y: 41, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await sleep(700);
out.spam = {};
out.spam.homeOpen = await evalJs(page, `({bodyClass: document.body.className, aria: document.querySelector('.burger').getAttribute('aria-expanded'), bodyOverflow: getComputedStyle(document.body).overflow})`);

// tap a nav link (Services) -> route change
out.spam.linkRects = await evalJs(page, `Array.from(document.querySelectorAll('#site-nav a.nav-link')).map(a=>{const r=a.getBoundingClientRect(); return {t:a.textContent.trim(), x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), w:Math.round(r.width), h:Math.round(r.height)};})`);
const svc = out.spam.linkRects.find(l => l.t === "Services");
await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: svc.x, y: svc.y, id: 2, radiusX: 12, radiusY: 12, force: 1 }] });
await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await sleep(1200);
out.spam.afterServicesLink = await evalJs(page, `({hash: location.hash, bodyClass: document.body.className, aria: document.querySelector('.burger').getAttribute('aria-expanded'), navVis: getComputedStyle(document.querySelector('#site-nav')).visibility, bodyOverflow: getComputedStyle(document.body).overflow, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, h1: document.querySelector('h1')?.textContent})`);

// can the page still scroll after that navigation?
await evalJs(page, `window.scrollTo(0, 600); 1`);
await sleep(500);
out.spam.scrollAfterNav = await evalJs(page, `({scrollY: Math.round(scrollY), scrollH: document.documentElement.scrollHeight})`);

// now on services, does the burger still open the menu?
await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 197, y: 41, id: 1, radiusX: 12, radiusY: 12, force: 1 }] });
await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await sleep(900);
out.spam.burgerOnServices = await evalJs(page, `({aria: document.querySelector('.burger').getAttribute('aria-expanded'), navVis: getComputedStyle(document.querySelector('#site-nav')).visibility, bodyClass: document.body.className})`);
out.spam.shot = await shot(page, "fn1-spa-burger-on-services.png");
console.log("SPA:", JSON.stringify(out.spam, null, 2).slice(0, 1800));

writeFileSync(OUT + "fn1-clean.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);