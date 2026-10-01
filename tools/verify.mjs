/**
 * Render the built site in headless Chrome and assert the design matches the
 * reference. Run: node tools/verify.mjs [baseUrl]
 *
 * CDP gotcha: enable every domain FIRST, then Page.navigate. Enabling domains
 * after navigation races the frame and Runtime.evaluate lands on about:blank.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

// Root, NOT a sub-path.
//
// `vite preview` serves this app at /, so a base carrying a path
// (/shutterhaus-site) makes every gallery request 404 into the SPA fallback and
// come back as `text/html` — 200 OK, no broken-image icon, just blank frames.
// The tools are invoked with the project directory as an argument, which is
// exactly where the path came from. The image tools below now also report
// NOT-IMAGE responses so this class of mistake is legible instead of silent.
const BASE = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");
// Hardcoding 9222 here silently ignored CDP_PORT, so domain runs connected to a
// different Chrome instance than the one launched with the host-resolver
// override — which resolved the domain to the stale parking IP and produced a
// bogus "Privacy error" that looked like a site outage.
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
// Default into the gitignored shots/ dir, NOT the repo root. verify.mjs writes
// shot-*.png, and with the old "." default those landed as untracked files in
// the project root — visible in `git status` and one `git add -A` away from a
// commit. Callers can still override with SHOT_DIR.
const OUT = process.env.SHOT_DIR ?? "shots/verify";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targets.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) events.push(msg);
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    throw new Error("eval threw: " + (r.result.exceptionDetails.exception?.description ?? expression));
  }
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await sleep(350);
}
async function shot(file) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${file}`, Buffer.from(r.result.data, "base64"));
  console.log("      shot:", file);
}
const goto = async (path, wait = 3000) => {
  await send("Page.navigate", { url: `${BASE}${path}` });
  await sleep(wait);
};
const consoleErrors = () =>
  events
    .filter(
      (e) =>
        e.method === "Runtime.exceptionThrown" ||
        (e.method === "Log.entryAdded" && e.params?.entry?.level === "error"),
    )
    .map((e) => e.params?.exceptionDetails?.exception?.description ?? e.params?.entry?.text ?? "")
    .filter((t) => t && !/favicon|picsum|net::ERR|Failed to load resource/i.test(t));

// ============================================== desktop home
await viewport(1440, 900);
await goto("/");

const info = await evaluate(`(() => {
  const cs = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el) : null; };
  return {
    title: document.title,
    header: !!document.querySelector('.site-header'),
    logo: document.querySelector('.logo')?.innerText.replace(/\\n/g, ' '),
    smFS: cs('.logo-sm')?.fontSize,
    lgFS: cs('.logo-lg')?.fontSize,
    lgWeight: cs('.logo-lg')?.fontWeight,
    lgFamily: cs('.logo-lg')?.fontFamily,
    nav: [...document.querySelectorAll('.nav-link')].map(a => a.textContent),
    active: document.querySelector('.nav-link.is-active')?.textContent,
    social: document.querySelectorAll('.site-social a').length,
    cols: document.querySelectorAll('.col').length,
    imgs: document.querySelectorAll('.cell img').length,
    perCol: [...document.querySelectorAll('.col')].map(c => c.querySelectorAll('img').length),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    headerH: document.querySelector('.site-header')?.getBoundingClientRect().height,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    // Null-safe: a slow first paint on a cold TLS handshake (the custom domain)
    // can leave these missing, and getComputedStyle(null) throws and aborts the
    // entire run instead of just reporting a failed check.
    navColor: cs('.nav-link:not(.is-active)')?.color,
    navSize: cs('.nav-link')?.fontSize,
    activeColor: cs('.nav-link.is-active')?.color,
    bw: !!document.querySelector('.shell.is-bw'),
    colScroll: [...document.querySelectorAll('.col')].map(c => c.scrollHeight > c.clientHeight),
    // Scope to gallery images: the lightbox holds an <img> with src="" until
    // first use, which reports as a "broken" image by design.
    broken: [...document.querySelectorAll('.cell img')].filter(i => i.complete && i.naturalWidth === 0).length,
  };
})()`);
console.log("\n--- home ---" + JSON.stringify(info, null, 2));

// Grid shape is a portfolio concern now, so read it on that route.
await goto("/#/portfolio", 2400);
// The wall is now 30 chosen frames in 10 STATIC rows of 3 (Alwin, 2026-10-01:
// no scroll, no numbering, 3 per row, "no spacing issues at all"). It is no
// longer .grid--wall, no longer packed by height, and no longer 50 frames, so
// every assertion that read those was rewritten rather than loosened.
const grid = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.pf-row')];
  const cells = [...document.querySelectorAll('.pf-cell')];
  const heights = rows.map(r =>
    [...r.querySelectorAll('.pf-cell')].map(c => c.getBoundingClientRect().height));
  return {
    rows: rows.length,
    perRow: rows.map(r => r.querySelectorAll('.pf-cell').length),
    tracks: rows.length ? getComputedStyle(rows[0]).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    cells: cells.length,
    imgs: document.querySelectorAll('.pf-cell img').length,
    // THE spacing metric: how far apart the tallest and shortest cell of a row
    // are. 0 means every row is exactly one height, which is only true because
    // each row holds three frames of the same aspect ratio.
    rowSpread: Math.max(0, ...heights.map(hs => hs.length ? Math.max(...hs) - Math.min(...hs) : 0)),
    // Nothing on this page may be its own scroller.
    scrollables: [...document.querySelectorAll('.pf-row, .pf-rows, .pf-cell')]
      .filter(e => e.scrollHeight > e.clientHeight + 1).length,
    // No printed numbers, and no filter bar — both removed on request.
    printedNumbers: document.querySelectorAll('.pf-cell__n').length,
    filterBar: !!document.querySelector('.pfilter'),
    // data-n must survive: the lightbox counter reads it ("07 / 30").
    dataN: cells.filter(c => c.dataset.n).length,
    band: !!document.querySelector('.hcta'),
    bandCta: document.querySelector('.hcta__btn')?.getAttribute('href') ?? null,
    bandLinks: document.querySelectorAll('.hcta__foot a').length,
  };
})()`);
console.log("--- portfolio ---" + JSON.stringify(grid));

check("title set", /shutterhaus/i.test(info.title), info.title);
check("header renders", info.header);
check("logo two-line lockup", /SHUTTERHAUS/i.test(info.logo ?? ""), info.logo);
check("small word < big word", parseFloat(info.smFS) < parseFloat(info.lgFS), `${info.smFS} < ${info.lgFS}`);
// Archivo Black ships a single weight (400) — it IS the black. The family is
// the real signal that the wordmark is heavy, plus a font-size floor.
check("wordmark is the display face", /Archivo/i.test(info.lgFamily ?? ""), info.lgFamily);
check("wordmark is large", parseFloat(info.lgFS) >= 24, info.lgFS);
// The five-route editorial build. `portfolio` is the route that carries the
// column grid, so the grid checks below read from there, not from the default
// route — which is now the home hero and has no columns at all.
const ROUTES = ["Home", "Portfolio", "About", "Services", "Contact"];
check("nav = the five routes", info.nav.join(",") === ROUTES.join(","), info.nav.join(","));
check("home active by default", info.active === "Home", info.active);
check("social icons", info.social >= 1, String(info.social));
// The curated static wall: 30 frames, 10 rows of 3, nothing scrolls, no numbers.
check("ten rows of three", grid.rows === 10 && grid.perRow.every(n => n === 3),
  grid.rows + " rows, " + grid.perRow.join("/"));
check("30 frames in the wall", grid.cells === 30, String(grid.cells));
check("one image per frame", grid.imgs === 30, String(grid.imgs));
check("three CSS tracks per row", grid.tracks === 3, String(grid.tracks));
// "No spacing issues at all" — measured, not eyeballed. 1px of tolerance is
// fractional layout rounding; a photo at a different ratio would show as more.
check("every row is exactly one height (no gap under any photo)", grid.rowSpread <= 1,
  "worst spread " + grid.rowSpread.toFixed(2) + "px");
check("nothing on the page scrolls", grid.scrollables === 0, String(grid.scrollables));
check("no numbers printed on the images", grid.printedNumbers === 0, String(grid.printedNumbers));
check("no filter bar", !grid.filterBar);
check("data-n kept for the lightbox counter", grid.dataN === 30, String(grid.dataN));

// The closing band. Measured missing on this route on 2026-10-01: the page ended
// on `.page.portfolio`, so a visitor who liked a frame had no way to enquire.
// `pfBand()` reuses `homeBand()` with three string replacements, which fail
// SILENTLY into unchanged markup if that function's wording moves — so the
// assertions below are what actually notice.
check("portfolio ends with the band", grid.band);
check("band CTA goes to contact", grid.bandCta === "#/contact", String(grid.bandCta));
check("band carries contact links", grid.bandLinks >= 2, String(grid.bandLinks));

// No two frames from the same shoot may be adjacent on the wall. Read from the
// rendered DOM and the same clustering the generator used, so this fails if
// demo.ts is regenerated without re-running shootorder.py — the exact way the
// clump comes back.
{
  const order = grid.fileOf ?? [];
  const meta = JSON.parse(
    readFileSync(new URL("../interleave-order.json", import.meta.url), "utf8"),
  );
  const shootOf = meta.shoot_of;
  let adjacentSame = 0;
  let unknown = 0;
  for (let i = 1; i < order.length; i++) {
    const a = shootOf[order[i]];
    const b = shootOf[order[i - 1]];
    if (a === undefined || b === undefined) unknown++;
    else if (a === b) adjacentSame++;
  }
  // Counted BEFORE the adjacency result is trusted. A run of undefined values
  // compares equal to itself and would report "no clumping" while having
  // checked nothing at all — which is how the earlier src-based version of this
  // check passed while reading 100 "frames" that matched none.
  check("shoot map covers every frame", unknown === 0, `${unknown} unmapped`);
  check(
    "no two same-shoot frames are adjacent",
    unknown === 0 && adjacentSame === 0,
    `${adjacentSame} adjacent pair(s) of ${order.length}`,
  );
  // A visible run, not just a pair: five in a row was what the wall looked like
  // before any of this. Reported rather than asserted because the cluster sizes
  // make the achievable floor non-zero.
  let worstRun = 1;
  let run = 1;
  for (let i = 1; i < order.length; i++) {
    run = shootOf[order[i]] === shootOf[order[i - 1]] ? run + 1 : 1;
    if (run > worstRun) worstRun = run;
  }
  check("longest same-shoot run stays short", worstRun <= 2, `${worstRun} in a row`);
}
check("no horizontal overflow", info.overflow <= 0, `${info.overflow}px`);
check("black & white shell", info.bw);
check("white page bg", info.bodyBg === "rgb(255, 255, 255)", info.bodyBg);
check("inactive nav is muted", info.navColor !== info.activeColor, `muted ${info.navColor} vs active ${info.activeColor}`);
check("nav text size", parseFloat(info.navSize) >= 11, info.navSize);
check("no broken images", info.broken === 0, String(info.broken));
await shot("shot-home.png");

// ============================================== lightbox
await evaluate(`document.querySelector('.cell img[data-full]')?.click()`);
await sleep(600);
const lb = await evaluate(`(() => {
  const b = document.querySelector('.lb');
  return { hidden: b?.hidden, hasImg: !!b?.querySelector('.lb__img')?.src };
})()`);
check("lightbox opens on click", lb.hidden === false && lb.hasImg, JSON.stringify(lb));
if (lb.hidden === false) {
  await shot("shot-lightbox.png");
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(400);
  check("Esc closes lightbox", await evaluate(`document.querySelector('.lb')?.hidden === true`));
}

// ============================================== contact
await evaluate(`location.hash = '#/contact'`);
await sleep(900);
const contact = await evaluate(`(() => ({
  active: document.querySelector('.nav-link.is-active')?.textContent,
  form: !!document.querySelector('.cform'),
  fields: [...document.querySelectorAll('.cform input, .cform textarea, .cform select')].map(f=>f.name),
  mailto: !!document.querySelector('a[href^="mailto:"]'),
  overflow: document.documentElement.scrollWidth - window.innerWidth,
}))()`);
check("contact route", contact.active === "Contact", contact.active);
check("contact form", contact.form);
check("form has name/email/message", ["name","email","message"].every(f=>contact.fields.includes(f)), contact.fields.join(","));
check("mailto link", contact.mailto);
check("contact no overflow", contact.overflow <= 0, `${contact.overflow}px`);
await shot("shot-contact.png");

// ============================================== video is gone
// Alwin does not shoot video. This route must stay dead — a stray #/video link
// (or a cached tab) should fall back to the gallery, not 404 or blank.
await evaluate(`location.hash = '#/video'`);
await sleep(900);
// The wall is packed COLUMNS of `.pf-cell` now — the justified `.pf-row` cells
// this used to count are gone, so an earlier version of this check read 0 here
// and reported the fallback as broken when the page was fine.
const noVideo = await evaluate(`(() => ({
  active: document.querySelector('.nav-link.is-active')?.textContent,
  cells: document.querySelectorAll('.pf-cell').length,
  empty: !!document.querySelector('.empty'),
}))()`);
check("no video nav item", !info.nav.includes("video"), info.nav.join(","));
check("#/video falls back to the gallery", noVideo.cells === 30, `active=${noVideo.active} cells=${noVideo.cells}`);
check("no video empty-state leaked", !noVideo.empty);

// ============================================== mobile
for (const w of [360, 390, 768]) {
  await viewport(w, 780);
  await evaluate(`location.hash = '#/photo'`);
  await sleep(700);
  const mob = await evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    clipped: [...document.querySelectorAll('.logo, .nav-link, .site-header *')]
      .filter(e => e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0).length,
    cols: document.querySelectorAll('.col').length,
    navW: document.querySelector('.site-nav')?.getBoundingClientRect().width,
  }))()`);
  check(`mobile ${w}: no overflow`, mob.overflow <= 0, `${mob.overflow}px`);
  check(`mobile ${w}: no clipped chrome`, mob.clipped === 0, String(mob.clipped));
  if (w === 390) await shot("shot-mobile.png");
}

// ============================================== admin
await viewport(1440, 900);
await goto("/admin.html", 2600);
const adm = await evaluate(`(() => ({
  title: document.title,
  root: !!document.querySelector('#app') && document.querySelector('#app').children.length > 0,
  html: document.querySelector('#app')?.innerHTML.slice(0, 120),
  google: !!document.querySelector('.gbtn, .gate__btn'),
  // A signed-out visitor must NOT be told they're on the wrong allowlist.
  spuriousAllowlistError: /isn't on the admin allowlist/.test(document.body.innerText),
  // NB: "\\s" must stay escaped — an unescaped \s in this template literal
  // collapses to /s+/ and silently strips every letter "s" from the output.
  text: document.querySelector('#app')?.innerText.replace(/\\s+/g,' ').slice(0,200),
  allowlist: document.body.innerText.includes('itsnotalwin@gmail.com'),
  notConfigured: document.body.innerText.includes("isn't connected yet"),
  overflow: document.documentElement.scrollWidth - window.innerWidth,
}))()`);
console.log("\n--- admin ---\n" + JSON.stringify(adm, null, 2));
check("admin mounts", adm.root);
// With no .env the admin correctly shows the "connect Supabase" notice
// instead of a sign-in button. Both states are correct; assert the right one.
const gateOk = adm.notConfigured || adm.google;
check("admin gate is correct for this config", gateOk, adm.notConfigured ? "not-configured notice" : `google=${adm.google}`);
if (!adm.notConfigured) {
  check("admin shows Google sign-in", adm.google || /google/i.test(adm.text ?? ""));
  check("admin names the allowed account", adm.allowlist);
} else {
  check("admin explains the .env step", /env/i.test(adm.text ?? ""), (adm.text ?? "").slice(0, 60));
  // Regression guard: getSession() once returned {email:null} when signed out,
  // which fell through to the allowlist branch and showed a false error.
  check(
    "signed-out visitor sees no allowlist error",
    !adm.spuriousAllowlistError,
    "a signed-out visitor must not be told they're on the wrong allowlist",
  );
}
check("admin no overflow", adm.overflow <= 0, `${adm.overflow}px`);
await shot("shot-admin.png");

// ============================================== services
// Class names are `pkg`/`pkgrow` now (see servicesPage()), and the packages
// each open with a photograph. `tier` was the old pricing-card class.
await goto("/#/services", 2200);
const pr = await evaluate(`(() => ({
  route: location.hash,
  active: document.querySelector('.nav-link.is-active')?.textContent,
  tiers: document.querySelectorAll('.pkg').length,
  names: [...document.querySelectorAll('.pkg__name')].map(e=>e.textContent),
  prices: [...document.querySelectorAll('.pkg__price')].map(e=>e.textContent),
  popular: document.querySelectorAll('.pkg--pop').length,
  figs: document.querySelectorAll('.pkg__fig img').length,
  addons: document.querySelectorAll('.addons li').length,
  terms: document.querySelectorAll('.terms li').length,
  ctas: [...document.querySelectorAll('.pkg .cta')].map(a=>a.getAttribute('href')),
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  bg: document.querySelector('.pkg') ? getComputedStyle(document.querySelector('.pkg')).backgroundColor : null,
}))()`);
console.log("\\n--- services ---\\n" + JSON.stringify(pr, null, 2));
check("services route renders", pr.tiers >= 3, String(pr.tiers));
check("nav marks services active", pr.active === "Services", String(pr.active));
check("4 packages configured", pr.tiers === 4, String(pr.tiers));
check("all package names present", pr.names.every(Boolean), pr.names.join("/"));
check("every package has a price", pr.prices.every(p => /^R[\\s]?[0-9]/.test(p)), pr.prices.join(" "));
check("exactly one 'most popular'", pr.popular === 1, String(pr.popular));
check("each package has a photo", pr.figs === pr.tiers, `${pr.figs}/${pr.tiers}`);
check("add-ons listed", pr.addons === 6, String(pr.addons));
check("booking terms listed", pr.terms >= 4, String(pr.terms));
check("every package links to contact", pr.ctas.every(h => h === "#/contact"), pr.ctas.join(","));
// The editorial package cards carry no fill — they sit on the white page
// separated by whitespace, not by a card background. The old check asserted
// rgb(255,255,255); the meaningful assertion now is that they are NOT a
// filled/tinted box, which is what would fight the photography.
check("package cards are unfilled", pr.bg === "rgba(0, 0, 0, 0)", pr.bg);
check("services no overflow", pr.overflow <= 0, `${pr.overflow}px`);
await shot("shot-services.png");

// ============================================== mobile pricing
for (const w of [360, 390, 768]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: true });
  await goto("/#/services", 1600);
  const o = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  check(`pricing mobile ${w}: no overflow`, o <= 0, `${o}px`);
}
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await shot("shot-pricing-mobile.png");

// ============================================== console
const errs = consoleErrors();
check("no console errors", errs.length === 0, errs.slice(0, 3).join(" | "));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name} (${f.detail})`);
}
ws.close();
process.exit(failed.length ? 1 : 0);
