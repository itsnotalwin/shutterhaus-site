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
await send("Page.bringToFront");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
// Deployment checks use the committed baseline; admin selections evolve independently.
if (process.env.OFFLINE_GALLERY) await send("Network.setBlockedURLs", { urls: ["*.supabase.co/*"] });

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
if (!process.env.REVIEW_ONLY) {
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
    // 2026-10-02: the greyscale filter is GONE at Alwin's instruction — the
    // photographs render exactly as uploaded. This used to be a black & white
    // shell; recording any surviving filter means a future edit cannot quietly
    // put a grade back over his work.
    imageFilters: [...document.querySelectorAll('img')]
      .map(i => getComputedStyle(i).filter).filter(f => f && f !== 'none'),
    coverCrops: [...document.querySelectorAll('img')]
      .filter(i => getComputedStyle(i).objectFit === 'cover')
      .map(i => (i.closest('[class]')?.className || i.className || '?').split(' ')[0]),
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
// The wall is 30 chosen frames in 3 packed COLUMNS on desktop, 2 on a phone
// (Alwin, 2026-10-05: "3 columns on portfolio on desktop version only"). It is
// no longer `.pf-row` rows of 2 — that shape cannot make three columns, because
// a row of two frames leaves the third track empty (measured at 1440px as 467px
// of dead space at the right edge).
//
// Rows.ts still supplies the frames and their ORDER, and the short-row guard
// still drops a row whole; only the arrangement changed. `packByHeight()` in
// pages.ts does the packing, so this probe reads columns, not rows.
const grid = await evaluate(`(() => {
  const cols = [...document.querySelectorAll('.pf-col')];
  const cells = [...document.querySelectorAll('.pf-cell')];
  // Spacing metric for a COLUMN wall. There are no rows to compare against, so
  // the equivalent of the old rowSpread is the gap between consecutive frames
  // INSIDE a column: it must equal the gutter, with no white notch under a
  // short frame. Any frame shorter than the gutter + 1px would mean a gap.
  const gaps = [];
  for (const col of cols) {
    const boxes = [...col.querySelectorAll('.pf-cell')].map(c => {
      const r = c.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }).sort((a, b) => a.top - b.top);
    for (let i = 1; i < boxes.length; i++) gaps.push(boxes[i].top - boxes[i - 1].bottom);
  }
  const colBottoms = cols.map(c => {
    const b = [...c.querySelectorAll('.pf-cell')].map(x => x.getBoundingClientRect().bottom);
    return b.length ? Math.round(Math.max(...b)) : 0;
  });
  const gut = parseFloat(getComputedStyle(cols[0] ?? document.body).rowGap || '0');
  return {
    cols: cols.length,
    perCol: cols.map(c => c.querySelectorAll('.pf-cell').length),
    cells: cells.length,
    imgs: document.querySelectorAll('.pf-cell img').length,
    tracks: cols.length ? getComputedStyle(document.querySelector('.pf-rows')).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    cellW: Math.round(cols[0]?.querySelector('.pf-cell')?.getBoundingClientRect().width ?? 0),
    gutter: gut,
    // Worst under-gap between stacked frames. ~0 or less means frames are
    // touching/overlapping; anything meaningfully above the gutter means a
    // white notch opened up under a short frame.
    worstGap: gaps.length ? Math.round(Math.max(...gaps) * 100) / 100 : 0,
    // How level the column bottoms are. Masonry cannot be 0 here the way
    // ratio-grouped rows were, because a frame cannot be split between columns.
    bottomSpread: colBottoms.length ? Math.max(...colBottoms) - Math.min(...colBottoms) : 0,
    // Nothing on this page may be its own scroller.
    scrollables: [...document.querySelectorAll('.pf-col, .pf-rows, .pf-cell')]
      .filter(e => e.scrollHeight > e.clientHeight + 1).length,
    // No horizontal page scroll at the current viewport.
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    // No printed numbers, and no filter bar — both removed on request.
    printedNumbers: document.querySelectorAll('.pf-cell__n').length,
    filterBar: !!document.querySelector('.pfilter'),
    // data-n must survive: the lightbox counter reads it ("07 / 30").
    dataN: cells.filter(c => c.dataset.n).length,
    // data-n must be a contiguous 1..30 run, or the lightbox counter shows gaps
        // and stepping order skips a frame.
        nSeq: cells.map(c => Number(c.dataset.n)).sort((a, b) => a - b).every((v, i) => v === i + 1),
    band: !!document.querySelector('.hcta'),
    bandCta: document.querySelector('.hcta__btn')?.getAttribute('href') ?? null,
    bandLinks: document.querySelectorAll('.hcta__foot a').length,
    // Every heading, for the mid-word-break check. The homepage H1 broke
    // "PORTRAITURE" across two lines for months and nothing caught it: this
    // suite had no typography assertion at all.
    headings: [...document.querySelectorAll('h1, h2, h3')]
      .map((e) => ({
        tag: e.tagName,
        text: (e.textContent || '').trim().slice(0, 44),
        // scrollWidth exceeding clientWidth means the glyphs need more room
        // than the box gives them — the signature of a word being split or
        // clipped mid-character.
        overflowing: e.scrollWidth > e.clientWidth + 1,
        size: Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10,
      })),
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

// `/index.html` must render the HOMEPAGE, exactly like `/`. It did not: the
// stem "index" is in KNOWN_ROUTES, so route() returned "index", no ALIASES
// entry matched, and paint() fell through to the portfolio tail — the
// homepage URL served the 30-cell wall under the title "Index — …". Asserted
// here because the homepage is the most linked and most crawled url there is.
await goto("/index.html", 2400);
const viaIndex = await evaluate(`JSON.stringify({
  hero: !!document.querySelector('.hero'),
  cells: document.querySelectorAll('.pf-cell').length,
  title: document.title
})`);
const ix = JSON.parse(viaIndex);
check("index.html serves the homepage, not the wall", ix.hero && ix.cells === 0, viaIndex);
check("index.html has the homepage title", !/^Index/i.test(ix.title), ix.title);
await goto("/#/portfolio", 2400);
// The packed wall: 30 frames in THREE columns on desktop (Alwin, 2026-10-05:
// "3 columns on portfolio on desktop version only"), two on a phone. The phone
// count is unchanged since 2026-10-02, when three columns at 393px gave 111px
// tiles — too small to read a face. wallCols() in pages.ts owns the count.
check("three columns on desktop", grid.cols === 3, grid.cols + " columns, " + grid.perCol.join("/"));
check("30 frames in the wall", grid.cells === 30, String(grid.cells));
check("one image per frame", grid.imgs === 30, String(grid.imgs));
check("three CSS tracks", grid.tracks === 3, String(grid.tracks));
// "No spacing issues at all" — measured, not eyeballed. In a COLUMN wall the
// metric is the gap between stacked frames inside a column: it must be exactly
// the gutter. A short frame in a ratio-mixed stack cannot open a notch here,
// which is the property the old ratio-grouped rows existed to buy; this asserts
// it directly rather than trusting that.
check("no gap under any photo (frames butt up to the gutter)",
  grid.worstGap <= grid.gutter + 1,
  `worst under-gap ${grid.worstGap}px vs gutter ${grid.gutter}px`);
// The column bottoms are as level as masonry allows. A frame cannot be split
// between columns, so this is a bound, not zero — the packer got 112px at 1440
// against 478px for CSS multi-column. Above ~400px it is the ragged edge the
// packer exists to prevent and this should fail.
check("column bottoms are level enough", grid.bottomSpread <= 400,
  `spread ${grid.bottomSpread}px`);
// Cells must stay photo-sized. Three columns across a 1378px cap is ~450px;
// the 111px that was rejected on a phone would show up here as a collapse.
check("cells are photo-sized", grid.cellW >= 300, grid.cellW + "px");
check("nothing on the page scrolls", grid.scrollables === 0, String(grid.scrollables));
check("no horizontal page scroll", grid.overflowX <= 0, grid.overflowX + "px");
check("no numbers printed on the images", grid.printedNumbers === 0, String(grid.printedNumbers));
check("no filter bar", !grid.filterBar);
check("data-n kept for the lightbox counter", grid.dataN === 30, String(grid.dataN));
check("data-n is a contiguous 1..30 run", grid.nSeq, String(grid.nSeq));

// The closing band. Measured missing on this route on 2026-10-01: the page ended
// on `.page.portfolio`, so a visitor who liked a frame had no way to enquire.
// `pfBand()` reuses `homeBand()` with three string replacements, which fail
// SILENTLY into unchanged markup if that function's wording moves — so the
// assertions below are what actually notice.
check("portfolio ends with the band", grid.band);
// `pageHref` emits the REAL document since the per-page split (414812d), so the
// band CTA is "./contact.html" and not the old "#/contact" hash. Assert it still
// lands on the contact document either way, so a regression to a dead hash fails.
check("band CTA goes to contact", /(^|\/)contact(\.html)?$/.test(grid.bandCta ?? ""), String(grid.bandCta));
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
// Alwin's instruction, 2026-10-02: the photographs stay as they were uploaded.
// The whole monochrome look was `.shell.is-bw .cell img { filter: grayscale(1)
// contrast(1.06) }` — the JPEGs on disk were always colour. That filter is gone
// and no replacement was put in its place, so this asserts no grade at all is
// sitting over his photographs.
check("no filter over the photographs", info.imageFilters.length === 0,
  info.imageFilters.join(" | ") || "none");
// object-fit: cover is a crop, and Alwin rejected cropping his work outright.
// The hero is the one deliberate exception: it is a full-bleed background behind
// a scrim, where `contain` would letterbox and expose the page behind it. Every
// other figure must stay uncropped.
check("only the hero crops", info.coverCrops.every(c => c === "hero__fig"),
  info.coverCrops.join(", ") || "none");
check("white page bg", info.bodyBg === "rgb(255, 255, 255)", info.bodyBg);
check("inactive nav is muted", info.navColor !== info.activeColor, `muted ${info.navColor} vs active ${info.activeColor}`);
check("nav text size", parseFloat(info.navSize) >= 11, info.navSize);
check("no broken images", info.broken === 0, String(info.broken));
// Typography guard. "Timeless Portraiture" shipped for months rendering as
// "TIMELESS PORTRAITUR / E" — the H1 split a word mid-character on every phone
// and this suite, with 69 assertions, had no typography check at all. Asserted
// at the same breakpoint the split was measured at.
const splitHeadings = grid.headings.filter((h) => h.overflowing);
check("no heading splits or clips a word", splitHeadings.length === 0,
  splitHeadings.map((h) => `${h.tag} "${h.text}" @${h.size}px`).join("; ") || `${grid.headings.length} headings clean`);
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
  google: !!document.querySelector('.gbtn, .gate__btn, #gate-btn'),
  // A signed-out visitor must NOT be told they're on the wrong allowlist.
  spuriousAllowlistError: /isn't on the admin allowlist/.test(document.body.innerText),
  // NB: "\\s" must stay escaped — an unescaped \s in this template literal
  // collapses to /s+/ and silently strips every letter "s" from the output.
  text: document.querySelector('#app')?.innerText.replace(/\\s+/g,' ').slice(0,200),
  // Asserts ADMIN_EMAILS, not the business contact address. Those are two
  // different things: enquiries go to alwin@shutterhausvisuals.co.za, but the
  // gallery is signed into with Alwin's personal Google account, and
  // is_admin() in the database matches that. Keep this tied to
  // ADMIN_EMAILS in src/config.ts, not to SITE.contact.email.
  allowlist: document.body.innerText.includes('itsnotalwin@gmail.com'),
  notConfigured: /not connected|isn't connected yet/.test(document.body.innerText),
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
  check("signed-out admin does not claim an account mismatch", !adm.spuriousAllowlistError);
} else {
  check("admin explains connection is unavailable", /not connected|connected yet/i.test(adm.text ?? ""), (adm.text ?? "").slice(0, 60));
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
  // All columns sit on paper; the recommended name and label remain distinct.
  filled: [...document.querySelectorAll('.pkg')].map(p => getComputedStyle(p).backgroundColor)
            .filter(b => b !== 'rgba(0, 0, 0, 0)').length,
  popularMarked: (() => {
    const p = document.querySelector('.pkg--pop');
    const flag = p?.querySelector('.pkg__flag');
    return !!flag && /popular choice/i.test(flag.textContent) &&
      getComputedStyle(flag).opacity === '1' &&
      flag.getBoundingClientRect().height > 0;
  })(),
  specs: [...document.querySelectorAll('.pkg__spec')].map(e => e.textContent.trim()),
}))()`);
console.log("\\n--- services ---\\n" + JSON.stringify(pr, null, 2));
check("services route renders", pr.tiers >= 3, String(pr.tiers));
check("nav marks services active", pr.active === "Services", String(pr.active));
check("4 packages configured", pr.tiers === 4, String(pr.tiers));
check("all package names present", pr.names.every(Boolean), pr.names.join("/"));
check("every package has a price", pr.prices.every(p => /^R[\\s]?[0-9]/.test(p)), pr.prices.join(" "));
check("exactly one 'most popular'", pr.popular === 1, String(pr.popular));
check("each package has a photo", pr.figs === pr.tiers, `${pr.figs}/${pr.tiers}`);
// Asserts the add-ons list is non-empty and contains no print or album.
// The floor was 6 while prints were on the menu; with prints removed the
// count is 5, so the floor follows the product rather than gating on a number
// that only means something in combination with the print check below.
check("add-ons listed", pr.addons >= 4, `${pr.addons} add-ons`);
check("booking terms listed", pr.terms >= 4, String(pr.terms));

// Alwin, 2026-10-02: "no reels at all". Reels and vertical crops came out of
// every tier and out of the add-ons. Asserted against config.ts, which is where
// every customer-visible string actually lives, rather than against the DOM --
// the earlier attempt read document.body and crashed, because that code runs in
// Node, not in the page. "vertically" is stripped first: it is a placement word
// used in the booking terms ("travel beyond 25km"), not a format promise.
const reelsGone = (() => {
  // Strip comments and type declarations: the assertion is about what a CUSTOMER
  // reads, and an engineer's note about an image's 4:5 ratio is not a promise.
  const copy = readFileSync(new URL("../src/config.ts", import.meta.url), "utf8")
    + readFileSync(new URL("../src/pricing.json", import.meta.url), "utf8");
  const visibleCopy = copy
    .replace(/\/\*[\s\S]*?\*\//g, " ")      // block comments
    .replace(/\/\/.*$/gm, " ")                // line comments
    .replace(/vertically|vertical-first/gi, "");
  return !/reel|9:16|\b4:5\b/i.test(visibleCopy);
})();
check("no reels or vertical crops promised anywhere", reelsGone);

// Prints are gone ENTIRELY, not merely de-promoted to an add-on.
//
// Alwin, 2026-10-03: "remove the prints completely, we won't be doing those for
// now." So the old distinction this check drew -- a PAID ADD-ON is fine, only a
// promise that prints are INCLUDED is wrong -- no longer holds. Any surviving
// mention is now a defect, in either form.
//
// This replaced a check that asserted `addons >= 6`, which had to be lowered
// rather than reasoned about: removing two add-ons failed the gate without the
// gate ever asking whether the removal was intended. Asserting the ABSENCE of
// prints is the stronger claim and cannot be satisfied by adding more.
const printsGone = (() => {
  const copy = readFileSync(new URL("../src/config.ts", import.meta.url), "utf8")
    + readFileSync(new URL("../src/pricing.json", import.meta.url), "utf8");
  const visibleCopy = copy
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ");
  return !/print|album/i.test(visibleCopy);
})();
check("no prints or albums promised anywhere", printsGone);

// "Book now" now carries the tier it belongs to, so the contact form can
// preselect it. The regex allows the optional `?package=<name>` query rather
// than pinning the exact string: the NAME is what matters, and asserting one
// literal would fail every time a tier is renamed, which trains the gate to be
// ignored.
check("every package links to contact with its name",
  pr.ctas.length > 0 && pr.ctas.every(h => /contact\.html(\?package=.+)?$/.test(h)),
  pr.ctas.join(","));
// The editorial package cards carry no fill — they sit on the white page
// separated by whitespace, not by a card background. The old check asserted
// rgb(255,255,255); the meaningful assertion now is that they are NOT a
// filled/tinted box, which is what would fight the photography.
check("package cards are unfilled", pr.bg === "rgba(0, 0, 0, 0)", pr.bg);
check("the popular tier has a visible recommendation", pr.popularMarked === true, String(pr.popularMarked));
check("all package columns are unfilled", pr.filled === 0, `${pr.filled} filled of ${pr.tiers}`);
// Every tier carries its config `spec` line ("30 min · 1 outfit · 1 location"),
// which used to be defined in config.ts and rendered only by pricingPage() — a
// function nothing routed, so the content was never actually shown to anyone.
check("every tier shows its spec line", pr.specs.length === pr.tiers && pr.specs.every(Boolean),
  pr.specs.join(" | "));
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
}

// Fresh review evidence from this exact build. Legacy shots above describe
// intermediate test states; these numbered captures explicitly name the page
// and viewport and wait for fonts and photographs to finish loading.
const reviewWidths = process.env.REVIEW_WIDTHS
  ? process.env.REVIEW_WIDTHS.split(',').map(Number)
  : [390, 1440];
for (const width of reviewWidths) {
  await viewport(width, ({ 320: 667, 390: 844, 430: 932, 768: 1024, 1024: 768, 1920: 1080 })[width] ?? 900);
  await send("Emulation.setTouchEmulationEnabled", { enabled: width <= 1000 });
  for (const [index, route] of ["home", "portfolio", "about", "services", "contact"].entries()) {
    await goto(route === "home" ? "/" : `/${route}.html`, 1000);
    await evaluate(`(async () => {
      await document.fonts.ready;
      const images = [...document.querySelectorAll('main img')];
      // Decode lazy frames for a full-page screenshot as well as the viewport.
      images.forEach(img => { img.loading = 'eager'; });
      await Promise.all(images.map(img => img.decode().catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations()
        .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {})));
    })()`);
    const state = await evaluate(`({
      heading: document.querySelector('main h1')?.textContent,
      broken: [...document.querySelectorAll('main img')].filter(img => !img.naturalWidth).length,
      overflow: document.documentElement.scrollWidth - innerWidth,
      headingsFit: [...document.querySelectorAll('main h1, main h2')].every(heading => heading.scrollWidth <= heading.clientWidth + 1),
      fontsLoaded: ['Inter', 'Archivo Black'].every(family => [...document.fonts].some(face => face.family.replace(/["']/g, '') === family && face.status === 'loaded')),
      priceTops: [...document.querySelectorAll('.pkg__price')].map(price => price.getBoundingClientRect().top),
      bandHref: document.querySelector('.hcta__btn')?.getAttribute('href'),
      bandFits: [...document.querySelectorAll('main .hcta')].every(band => {
        const edge = band.getBoundingClientRect();
        return [...band.querySelectorAll('.hcta__h, .hcta__side, .hcta__btn')].every(item => {
          const rect = item.getBoundingClientRect();
          return rect.left >= edge.left - 1 && rect.right <= edge.right + 1;
        });
      }),
    })`);
    check(`review ${route} ${width}: page loaded`, !!state.heading, state.heading);
    check(`review ${route} ${width}: no broken images`, state.broken === 0, state.broken);
    check(`review ${route} ${width}: no overflow`, state.overflow <= 0, state.overflow);
    check(`review ${route} ${width}: headings fit`, state.headingsFit);
    check(`review ${route} ${width}: local fonts loaded`, state.fontsLoaded);
    check(`review ${route} ${width}: booking band fits`, state.bandFits);
    if (route === 'services') {
      check(`review services ${width}: closing enquiry goes to contact`, state.bandHref === './contact.html', state.bandHref);
      if (width === 1440) check('desktop package prices align', Math.max(...state.priceTops) - Math.min(...state.priceTops) <= 1);
      const framing = await evaluate(`(() => [...document.querySelectorAll('.pkg__fig')].map(fig => {
        const image = fig.querySelector('img'), r = fig.getBoundingClientRect();
        return { ratio:r.width/r.height, fit:getComputedStyle(image).objectFit, position:getComputedStyle(image).objectPosition };
      }))()`);
      check(`review services ${width}: complete landscape frames`, framing[0].fit === 'contain' && framing[2].fit === 'contain');
      if (width > 760) {
        check(`review services ${width}: taller desktop portrait slots`, framing.every(fig => Math.abs(fig.ratio - 1) < .01));
        check(`review services ${width}: Essential preserves the top of the portrait`, framing[1].position === '50% 0%');
        check(`review services ${width}: Social preserves the top of the portrait`, framing[3].position === '50% 0%');
      } else {
        check(`review services ${width}: recommended package selected`, await evaluate(`document.querySelector('[name="package-view"]:checked')?.value === 'Essential'`));
        check(`review services ${width}: only the chosen package is visible`, await evaluate(`[...document.querySelectorAll('.pkg')].filter(p => p.getBoundingClientRect().height > 0).length === 1`));
        check(`review services ${width}: photographic cover preserves the top`, await evaluate(`getComputedStyle(document.querySelector('.session-cover__photo img')).objectPosition === '50% 0%'`));
        for (const name of ['Starter', 'Essential', 'Signature', 'Social']) {
          await evaluate(`document.querySelector('#package-${name.toLowerCase()}').click()`);
          check(`review services ${width}: ${name} selection and enquiry`, await evaluate(`(() => { const visible = [...document.querySelectorAll('.pkg')].filter(p => p.getBoundingClientRect().height > 0); return visible.length === 1 && visible[0].dataset.package === '${name}' && visible[0].querySelector('.cta').getAttribute('href') === './contact.html?package=${name}'; })()`));
        }
        await evaluate(`document.querySelector('#package-essential').click()`);
      }
    }
    if (route === 'home') {
      const strip = await evaluate(`(() => {
        const grid = document.querySelector('.hstrip__grid');
        return { tracks:getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          count:grid.querySelectorAll('.hstrip__item').length,
          widths:[...grid.querySelectorAll('.hstrip__item')].map(frame => frame.getBoundingClientRect().width),
          width:grid.getBoundingClientRect().width };
      })()`);
      check(`review home ${width}: six showcase images`, strip.count === 6);
      check(`review home ${width}: correct showcase columns`, strip.tracks === (width <= 760 ? 1 : 2));
      if (width <= 760) check(`review home ${width}: each image uses the full showcase width`, strip.widths.every(frame => Math.abs(frame-strip.width) <= 1));
    }
    if (route === 'portfolio') {
      const wall = await evaluate(`(() => ({
        visible:[...document.querySelectorAll('.pf-cell')].filter(cell => !cell.closest('details:not([open])')).length,
        more:!!document.querySelector('.pf-more'), cols:document.querySelector('.pf-rows').style.getPropertyValue('--pf-cols'),
        targets:[...document.querySelectorAll('.pf-cell')].filter(cell => !cell.closest('details:not([open])')).map(cell => cell.getBoundingClientRect().top)
      }))()`);
      check(`review portfolio ${width}: correct initial image count`, wall.visible === (width <= 760 ? 10 : 30));
      check(`review portfolio ${width}: disclosure appears only on phones`, wall.more === (width <= 760));
      check(`review portfolio ${width}: correct column count`, Number(wall.cols) === (width <= 760 ? 2 : 3));
      if (width <= 760) {
        check(`review portfolio ${width}: icon-only disclosure remains accessible and centred`, await evaluate(`(() => {
          const summary=document.querySelector('.pf-more__toggle'), icon=summary.querySelector('svg');
          const label=summary.querySelector('.pf-more__closed'), rect=summary.getBoundingClientRect();
          const parent=summary.parentElement.getBoundingClientRect(), style=getComputedStyle(label);
          return label.textContent==='Show more images' && style.clipPath==='inset(50%)' &&
            label.getBoundingClientRect().width<=1 && icon.getAttribute('aria-hidden')==='true' &&
            rect.width>=44 && rect.height>=44 && Math.abs((rect.left+rect.right-parent.left-parent.right)/2)<=1;
        })()`));
      }
    }
    const metrics = await send("Page.getLayoutMetrics");
    const size = metrics.result.cssContentSize;
    const capture = await send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: Math.ceil(size.height), scale: 1 },
    });
    const name = `${String(index + 1).padStart(2, "0")}-${route}-${width}.png`;
    writeFileSync(`${OUT}/${name}`, Buffer.from(capture.result.data, "base64"));
    if (route === 'home') {
      const firstScreen = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(`${OUT}/01-home-${width}-viewport.png`, Buffer.from(firstScreen.result.data, 'base64'));
      check(`review home ${width}: photograph starts at the top`, await evaluate(`document.querySelector('.hero').getBoundingClientRect().top === 0`));
      await evaluate(`scrollTo(0, document.querySelector('.hstrip').offsetTop + 80)`);
      await sleep(150);
      const header = await evaluate(`(() => {
        const header = document.querySelector('.site-header');
        return { top: header.getBoundingClientRect().top, background: getComputedStyle(header).backgroundColor };
      })()`);
      check(`review home ${width}: menu stays visible while scrolling`, Math.abs(header.top) <= 1 && header.background === 'rgb(255, 255, 255)', JSON.stringify(header));
      if (width === 390 || width === 1440) await shot(`01-home-${width}-scrolled.png`);
      await evaluate(`scrollTo(0, 0)`);
      await sleep(100);
    }
    if (route === 'portfolio' && width <= 760) {
      await evaluate(`window.reviewTopTen=[...document.querySelector('.pf-rows').querySelectorAll('.pf-cell')].map(cell=>cell.getBoundingClientRect().top+scrollY); document.querySelector('.pf-more__toggle').focus({preventScroll:true})`);
      await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await sleep(100);
      check(`review portfolio ${width}: keyboard expands all photos`, await evaluate(`document.querySelector('.pf-more').open && document.querySelectorAll('.pf-cell').length === 30 && [...document.querySelectorAll('.pf-cell')].every(cell => cell.checkVisibility())`));
      check(`review portfolio ${width}: first ten stay in place on expansion`, await evaluate(`(()=>{const frames=[...document.querySelector('.pf-rows').querySelectorAll('.pf-cell')];return frames.length===10 && frames.every((frame,i)=>Math.abs(frame.getBoundingClientRect().top+scrollY-window.reviewTopTen[i])<=1);})()`));
      check(`review portfolio ${width}: disclosure has a touch target`, await evaluate(`document.querySelector('.pf-more__toggle').getBoundingClientRect().height>=44`));
      if (width === 390) await shot('02-portfolio-390-expanded.png');
      await evaluate(`document.querySelector('.pf-more__toggle').click()`);
      await sleep(100);
      check(`review portfolio ${width}: closing hides the remaining twenty`, await evaluate(`!document.querySelector('.pf-more').open && [...document.querySelectorAll('.pf-more .pf-cell')].every(cell=>!cell.checkVisibility())`));
      if (width === 390) {
        const y = await evaluate(`document.querySelector('.pf-more').getBoundingClientRect().top+scrollY-90`);
        await evaluate(`document.querySelector('.pf-more__toggle').blur()`);
        const detail=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:Math.max(0,y),width,height:250,scale:1}});
        writeFileSync(`${OUT}/02-portfolio-390-disclosure.png`,Buffer.from(detail.result.data,'base64'));
      }
      await evaluate(`scrollTo(0,0)`);
    }
    if (width <= 1000) {
      await evaluate(`document.querySelector('.burger').click()`);
      await sleep(200);
      const menu = await evaluate(`(() => {
        const links = [...document.querySelectorAll('.site-nav a')];
        return {
          expanded: document.querySelector('.burger').getAttribute('aria-expanded') === 'true',
          linksVisible: links.length === 5 && links.every(link => {
            const rect = link.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth &&
              link.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
          }),
          focused: document.activeElement === links[0],
          inert: document.querySelector('main').inert,
          active: document.activeElement?.tagName,
          visibility: getComputedStyle(document.querySelector('.site-nav')).visibility,
        };
      })()`);
      check(`review ${route} ${width}: all five menu links visible`, menu.expanded && menu.linksVisible);
      check(`review ${route} ${width}: menu focus and background isolation`, menu.focused && menu.inert, JSON.stringify(menu));
      if (width === 390 && ['home', 'portfolio', 'contact'].includes(route)) await shot(`${String(index + 1).padStart(2, '0')}-${route}-${width}-menu.png`);
      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      check(`review ${route} ${width}: Escape restores focus and closes menu`, await evaluate(`document.querySelector('.burger').getAttribute('aria-expanded') === 'false' && document.activeElement === document.querySelector('.burger') && !document.querySelector('main').inert`));
      await evaluate(`document.querySelector('.burger').click(); document.querySelector('.nav-scrim').click()`);
      check(`review ${route} ${width}: tapping outside closes menu`, await evaluate(`document.querySelector('.burger').getAttribute('aria-expanded') === 'false' && !document.querySelector('.nav-scrim') && !document.documentElement.classList.contains('nav-locked')`));
    }
    console.log("      review screenshot:", name);
  }
}

// Width changes must repack the wall without dropping frames or breaking the
// viewer's return focus. Contact drafts must survive width AND height changes.
await viewport(1024, 768);
await goto('/portfolio.html', 1000);
await evaluate(`(() => {
  const frame = document.querySelector('.pf-cell');
  window.reviewFrameUrl = frame.querySelector('img').dataset.full;
  frame.focus({ preventScroll: true });
  frame.querySelector('img').click();
})()`);
await viewport(390, 844);
await sleep(200);
check('rotation gives Portfolio two mobile columns and ten initial frames', await evaluate(`document.querySelector('.pf-rows').querySelectorAll('.pf-col').length === 2 && document.querySelector('.pf-rows').querySelectorAll('.pf-cell').length === 10 && document.querySelectorAll('.pf-cell').length === 30`));
await shot('02-portfolio-390-viewer.png');
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
check('viewer restores focus to the same photo after repacking', await evaluate(`document.querySelector('.lb').hidden && document.activeElement?.querySelector('img')?.dataset.full === window.reviewFrameUrl`));
await evaluate(`scrollTo(0, 400)`);
await viewport(1024, 768);
await sleep(200);
check('desktop resize restores three columns without jumping to the top', await evaluate(`document.querySelectorAll('.pf-col').length === 3 && document.querySelectorAll('.pf-cell').length === 30 && Math.abs(scrollY - 400) <= 1`));

await viewport(390, 844);
await goto('/contact.html?package=Social', 1000);
await evaluate(`(() => {
  window.reviewForm = document.querySelector('form');
  document.querySelector('[name="message"]').value = 'A draft to preserve';
})()`);
await viewport(390, 500);
await evaluate(`document.querySelector('.burger').click()`);
await viewport(1024, 768);
check('Contact preserves the form, draft and selected package through resizing', await evaluate(`document.querySelector('form') === window.reviewForm && document.querySelector('[name="message"]').value === 'A draft to preserve' && document.querySelector('[name="kind"]').value === 'Social'`));
check('resizing an open compact menu to desktop unlocks the page', await evaluate(`!document.documentElement.classList.contains('nav-locked') && !document.querySelector('main').inert && document.querySelector('.burger').getAttribute('aria-expanded') === 'false'`));

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
