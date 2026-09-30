/**
 * Render the built site in headless Chrome and assert the design matches the
 * reference. Run: node tools/verify.mjs [baseUrl]
 *
 * CDP gotcha: enable every domain FIRST, then Page.navigate. Enabling domains
 * after navigation races the frame and Runtime.evaluate lands on about:blank.
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://localhost:4173/shutterhaus-site").replace(/\/$/, "");
// Hardcoding 9222 here silently ignored CDP_PORT, so domain runs connected to a
// different Chrome instance than the one launched with the host-resolver
// override — which resolved the domain to the stale parking IP and produced a
// bogus "Privacy error" that looked like a site outage.
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const OUT = process.env.SHOT_DIR ?? ".";
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
const grid = await evaluate(`(() => ({
  cols: document.querySelectorAll('.col').length,
  perCol: [...document.querySelectorAll('.col')].map(c => c.querySelectorAll('img').length),
  filters: document.querySelectorAll('.pfilter__item').length,
}))()`);
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
check("portfolio grid has columns", grid.cols >= 1, String(grid.cols));
check("portfolio columns populated", grid.perCol.every((n) => n > 0), grid.perCol.join("/"));
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
const noVideo = await evaluate(`(() => ({
  active: document.querySelector('.nav-link.is-active')?.textContent,
  cols: document.querySelectorAll('.col').length,
  empty: !!document.querySelector('.empty'),
}))()`);
check("no video nav item", !info.nav.includes("video"), info.nav.join(","));
check("#/video falls back to the gallery", noVideo.cols === 3, `active=${noVideo.active} cols=${noVideo.cols}`);
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
