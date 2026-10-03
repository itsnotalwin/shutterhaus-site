# Mobile Functionality Audit — shutterhausvisuals.co.za

**Target:** https://shutterhausvisuals.co.za/ (live production)
**Date:** 2026-10-02
**Method:** headless Chrome 154.0.8037.97, raw CDP over WebSocket from Node 26.7.0. Not `browser_exec`.
**Devices:** 320×568 (SE-class), 393×852 @DPR3 (iPhone 16, Alwin's device), 430×932 @DPR3 (16 Pro Max)
**Source of truth for selectors:** local clone `src/config.ts` (nav = home/portfolio/about/services/contact), `src/layout.ts`, `src/main.ts`, `src/pages.ts`, `src/pages-more.ts`, `src/lightbox.ts`, `src/styles.css`, `src/editorial.css`.

---

## PASS/FAIL summary

| # | Check | Result | Evidence that decided it |
|---|---|---|---|
| 1 | Route sweep — all 5 routes load at 393px | **PASS** | 5/5 `h1` present: "Timeless Portraiture", "Portfolio", "Photography Is Poetry.", "Capture What Matters.", "Let's Create Something Beautiful." Document HTTP 200 on every route |
| 2 | Console errors / unhandled rejections | **PASS** | `Log.entryAdded` level=error + `Runtime.exceptionThrown` = **0 events** across all 5 routes, both drawer states |
| 3 | Failed network requests | **PASS** | `Network.loadingFailed` = **0** non-aborted across all 5 routes |
| 4 | Mobile menu opens — **every** route | **PASS** | Fresh load per route, real `Input.dispatchTouchEvent` at (197,41). All 5: `aria-expanded` false→**true**, `#site-nav` visibility hidden→**visible**, opacity 0→**1**. The earlier "menu hidden behind page on non-home routes" bug does **not** reproduce |
| 5 | Nav links hit-testable (not occluded) | **PASS** | `elementFromPoint` at each link centre returned the link itself or a descendant. **0/25 blocked** across 5 routes |
| 6 | Menu closes on link tap | **PASS** | Tapped "Services" from home: hash `#/home`→`#/services`, `aria-expanded`→**false**, body `nav-open` removed, h1 became "Capture What Matters." |
| 7 | Menu closes on **outside tap** | **FAIL** | See **Defect 1** — no listener exists for it |
| 8 | `aria-expanded` toggles | **PASS** | false→true on open, true→false on link tap and on Escape (measured on home/about/portfolio) |
| 9 | Open menu does not overflow horizontally | **PASS** | `#site-nav` right edge = **375px** vs `innerWidth` 393px, on all 5 routes. `scrollWidth` 393 = `innerWidth` 393 with drawer open |
| 10 | Tap targets ≥44×44 CSS px | **PASS** | 73 interactive elements measured across 5 routes (closed + drawer open). **0 offenders**. Nav links 321×46/45px, burger exactly 44×44, form fields 357×44, lightbox controls 78×44 and 70×44 |
| 11 | No horizontal overflow — 320px | **PASS** | `scrollWidth` 326 = `innerWidth` 326 on all 5 routes, closed and drawer-open |
| 12 | No horizontal overflow — 393px | **PASS** | 393 = 393 on all 5 routes, closed and drawer-open |
| 13 | No horizontal overflow — 430px | **PASS** | 430 = 430 on all 5 routes, closed and drawer-open |
| 14 | Viewport meta present | **PASS** | `<meta name="viewport" content="width=device-width, initial-scale=1">` |
| 15 | Form inputs ≥16px (no iOS focus-zoom) | **PASS** | `getComputedStyle` font-size = **16px** on all 4 fields, at both 393 and 320 |
| 16 | Form labels present + associated | **PASS** | All 4 fields wrapped in `<label>`; `el.labels[0]` resolves for each: "Name", "Email", "What do you need?", "Message" |
| 17 | Form usable at 320px, no h-scroll | **PASS** | Form width 284px, `formOverflow` false, page `scrollWidth` 326 = `innerWidth` |
| 18 | Gallery images have `alt` | **PASS** | **0 missing** `alt` across 43 gallery images on all 5 routes |
| 19 | Lightbox open/next/close | **PASS** | Opens from `.pf-cell` tap: `.lb` 393×852 covers viewport, z-index 100, `body` overflow→**hidden**. Next → `48-img-0128.jpg`, caption "02 / 30". Close → `hidden:true`, display none, body overflow→**visible** |
| 20 | Lightbox tap targets ≥44×44 | **PASS** | Close 70×44, Prev 78×44, Next 78×44 — all in viewport |
| 21 | **Header reachable after scrolling** | **FAIL** | See **Defect 2** — `position: relative`, not sticky |
| 22 | **Background scroll locked when menu open** | **FAIL** | See **Defect 3** — `body.nav-open` has no CSS rule |
| 23 | **Mobile data weight per route** | **FAIL** | See **Defect 4** — portfolio 4368KB, home 1286KB |

### Defects, by severity

---

## 1. Menu does not close when tapping outside it — MEDIUM

**Where:** every route. `src/main.ts:198-218` (`wireBurger`).

**Measured:** with the drawer open on `#/home`, a touch tap at (196, 600) — well below the panel, which ends at y=325 — landed on `DIV.hero__meta`, confirmed `insideNav: false`. Result: `aria-expanded` stayed **"true"**, `#site-nav` visibility stayed **"visible"**. Same result on `#/portfolio` (landed on `IMG.is-loaded`) and `#/contact` (landed on `TEXTAREA`).

The only close paths wired are: the burger button, a click inside `#site-nav` that hits an `<a>`, and Escape. There is no `document`-level pointer listener and no scrim element — I confirmed `document.querySelector('.nav-scrim,.scrim,.overlay')` returns **null**, so there is nothing for the tap to hit.

**Why it matters on iPhone:** the user opens the menu, changes their mind, taps the photograph or the body copy to dismiss — and the menu stays. The only escape is the small × or a keyboard (no iPhone keyboard). On `#/contact` the tap point is the **message textarea**, so tapping the page silently focuses the message field while the nav stays open.

**Fix:** in `wireBurger()`, add a document-level close that ignores taps inside the header:

```ts
document.addEventListener("pointerdown", (e) => {
  if (!nav.classList.contains("is-open")) return;
  if ((e.target as HTMLElement).closest(".site-header")) return;
  set(false);
}, { passive: true });
```

---

## 2. Header is not sticky — the burger scrolls away — MEDIUM-HIGH

**Where:** `src/styles.css:47` — `.site-header { position: relative; }`. Measured on 3 routes at 393×852.

**Measured** (scrolled to the very bottom of each page):

| Route | `position` | sticky? | Page height | Max scroll | Burger `top` at bottom | In viewport? |
|---|---|---|---|---|---|---|
| `#/portfolio` | relative | no | 2532px | 1680px | **-1661px** | **no** |
| `#/services` | relative | no | 3976px | 3124px | **-3105px** | **no** |
| `#/contact` | relative | no | 1466px | 614px | **-595px** | **no** |

On `#/services` a user who scrolls to read the booking terms must scroll back **3124px** to reach the menu — or use the in-page CTA links, which is the only escape. Confirmed visually: `fn1-bottom-services.png` shows add-on pricing and booking terms with **no header, logo or burger anywhere in the viewport**.

**Fix:** make the header sticky in the mobile breakpoint (leave the desktop rule alone — on desktop the nav links are inline so this matters less):

```css
@media (max-width: 640px) {
  .site-header {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--paper);
  }
}
```

Note `.site-nav` is `position: absolute` against `.site-header`, so the drawer keeps working unchanged. Home is the exception — it uses `shell--over` with a transparent header over the hero, so sticky there needs an opaque background that appears on scroll (or `position: absolute` retained for `.shell--over` only).

---

## 3. Opening the menu does not lock background scroll — LOW-MEDIUM

**Where:** `src/main.ts:207` sets `document.body.classList.toggle("nav-open", open)`, but **no CSS rule anywhere in `src/styles.css` or `src/editorial.css` matches `body.nav-open`** — I grepped the whole `src/` tree and the class is only ever written, never styled. It is a dead class.

**Measured** on `#/portfolio` at scrollY 800, drawer open:
- `body` overflow = **visible**, `html` overflow = **visible** (expected: hidden if the lock worked)
- a 6-step touch drag moved the page from scrollY **800 → 985** (185px of background scrolling *behind* the open drawer)
- `window.scrollTo(0,0)` succeeded, jump **985 → 0**

So the open menu floats over content the user can still scroll, and the page can be flung far from where the drawer was opened.

**Fix:** add the missing rule.

```css
body.nav-open { overflow: hidden; }
```

---

## 4. Portfolio downloads 4.3MB on mobile data; `sizes` overstates cell width — HIGH

**Where:** `src/pages.ts` (`pictureFor`, called with `sizes` for portfolio cells). Route `#/portfolio` at 393px, DPR3, cold cache.

**Measured transfer** (`Network.loadingFinished.encodedDataLength`, `Network.setCacheDisabled(true)` + `clearBrowserCache`):

| Route | Requests | Total | Image bytes | Image count | Avg/image | JS |
|---|---|---|---|---|---|---|
| `#/portfolio` | 40 | **4368KB** | **4018KB** | 30 | 133.9KB | 258KB |
| `#/home` | 17 | **1286KB** | **935KB** | 7 | 133.6KB | 258KB |
| `#/services` | 13 | 707KB | 356KB | 3 | 118.7KB | 258KB |
| `#/contact` | 11 | 757KB | **406KB** | 1 | 405.9KB | 258KB |
| `#/about` | 11 | 444KB | 93KB | 1 | 93.4KB | 258KB |

**Root cause.** Portfolio cells render at **111×167 CSS px** (3-column grid, `--row-cols:3`), but the `<source sizes>` says:

```
(max-width: 639px) 100vw, (max-width: 999px) 50vw, (max-width: 1399px) 33vw, 50vw
```

At 393px the browser resolves that to `100vw` = 393 CSS px, ×3 DPR = **1179 device px**, so it picks the **1200w** candidate for every thumbnail. The actual need is 111×3 = **333 device px**, which the already-existing **400w** file satisfies.

**Measured waste:** 1200×1800 file area vs 333×500 device px needed = **12.99× more pixels than needed**, on all 30 thumbnails.

**Proof the fix is cheap** — both files already exist and serve HTTP 200:

| File | Bytes | vs 1200w |
|---|---|---|
| `49-img-0131-1200w.webp` | 95,380 | — |
| `49-img-0131-400w.webp` | **14,562** | **6.5× smaller** |
| `18-img-0043-1200w.webp` | 323,414 | — |
| `18-img-0043-400w.webp` | **27,104** | **11.9× smaller** |

Moving portfolio `sizes` from `100vw` to `33vw` in the mobile tier should take the portfolio from ~4018KB to roughly **600KB** — no new assets, no build step.

**Fix** — pass a cell-accurate `sizes` for the portfolio wall:

```
(max-width: 639px) 33vw, (max-width: 999px) 50vw, (max-width: 1399px) 33vw, 50vw
```

**Secondary, same class of problem:** `#/contact` pulls a single **405.9KB** JPEG (`49-img-0131.jpg`, 1600×2400) for a 277×324 CSS box, and it is the one gallery image **not** wrapped in `<picture>` (`inPicture: 0`, `hasSrcset: false`). A 400w/800w derivative would serve it at ~15–40KB.

**Also worth noting:** `loading="lazy"` on the 30 portfolio images does not save anything here — measured `complete: 30, pending: 0` at initial scroll position, because all 30 cells are inside a `pf-rows` container that Chrome resolves eagerly. The byte saving must come from `sizes`, not from lazy-loading.

**Methodological note:** I first read `img.naturalWidth` and it reported **393×589** for a 1200×1800 file, which would have implied the site was rendering images *upscale-blurry*. That was a measurement artifact — Chrome downsamples `naturalWidth` under page memory pressure. A `fetch` + `createImageBitmap` of the same URL in the same document returned the true **1200×1800**, and so did opening the file directly in a tab. All image figures above use the decode-verified intrinsic size, not `naturalWidth`.

---

## Checks that passed, with the numbers

- **Route sweep (393px):** all 5 routes 200, correct `h1`, 0 console errors, 0 exceptions, 0 failed requests.
- **Menu on every route:** `aria-expanded` false→true, `#site-nav` visibility hidden→visible, opacity 0→1 on home, portfolio, about, services, contact. Fresh page per route so no state carried over. The earlier non-home-routes bug does not reproduce.
- **Nav link occlusion:** 25 links hit-tested across 5 routes, **0 blocked**. Each is 321×46px (last 321×45).
- **Drawer overflow:** nav right edge 375px vs viewport 393px.
- **Tap targets:** 73 interactive elements (nav links, burger, social icons, CTAs, filter/portfolio cells, form fields, submit, lightbox controls) — 0 under 44×44.
- **Overflow:** 15 route×width combinations (5 routes × 3 widths, closed and drawer-open) — `scrollWidth` equals `innerWidth` everywhere, 0 offending elements.
- **Form:** 16px on all inputs (no iOS zoom), all labels associated, 44px min height, no overflow at 320px.
- **Lightbox:** opens, covers viewport, locks body scroll, Next advances (caption "01 / 30" → "02 / 30"), Close restores body overflow.
- **Alt text:** 0 missing across 43 gallery images.

## Not tested / out of scope

- **Real iOS Safari on hardware.** Everything here is Chrome 154 emulation at a 393×852 viewport. Chromium and Safari differ on `100vh`, safe-area insets, momentum scrolling and tap-delay. The two scroll findings (Defects 1 and 3) are the ones most likely to differ on real Safari — worth confirming on the actual iPhone 16 before fixing.
- **Form submission end-to-end.** No submit was sent (that would deliver a real enquiry to Alwin). I verified field sizing, font-size, labels and validation wiring only.
- **Orientation change / repaint hook.** The existing `orientationchange` workaround was not exercised.
- **The `#/admin` route** (referenced from the empty-gallery state) was not audited.
- **Third-party embeds** (Instagram/WhatsApp links) were not followed.
- **Wasted-bytes ratio on desktop widths** was not measured; the `sizes` finding is mobile-specific.

## Screenshots

All under `C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit\shots\`.

| File | Shows |
|---|---|
| `fn1-route-{home,portfolio,about,services,contact}-393.png` | Route sweep, each route at 393px |
| `fn1-clean-open-{home,portfolio,about,services,contact}.png` | Defect: drawer opens correctly on **every** route (pass evidence) |
| `fn1-hit-{home,portfolio,about,services,contact}.png` | Defect: drawer open, all 5 links hit-testable (pass evidence) |
| `fn1-menu-open-{home,portfolio,about,services,contact}-393.png` | Drawer open per route from the first pass |
| `fn1-lb-portfolio.png` | Defect: lightbox open, 3 controls in viewport (pass evidence) |
| `fn1-form-393.png`, `fn1-form-320.png` | Contact form at 393 and 320 |
| `fn1-portfolio-top.png`, `fn1-img-{home,portfolio,about,services,contact}.png` | Gallery rendering per route |
| `fn1-bottom-services.png` | **Defect 2** — bottom of services, no header/burger in viewport |
| `fn1-bottom-portfolio.png`, `fn1-bottom-contact.png` | Defect 2 at the bottom of those routes |
| `fn1-scrolled-{home,portfolio,about,services,contact}-393.png` | Defect 2 — header scrolled off at scrollY 1200 |
| `fn1-outside-{home,about,portfolio}.png` | **Defect 1** — drawer still open after an outside tap |
| `fn1-menuscroll-bg.png` | **Defect 3** — background scrolled behind the open drawer |
| `fn1-root-{home,portfolio,about}.png`, `fn1-spa-burger-on-services.png` | Menu state after hash-route navigation |

## Raw evidence files

`fn1-routes.json`, `fn1-menu.json`, `fn1-defects.json`, `fn1-rootcause.json`, `fn1-clean.json`, `fn1-scroll-outside.json`, `fn1-taps.json`, `fn1-overflow.json`, `fn1-forms.json`, `fn1-images.json`, `fn1-images2.json`, `fn1-bytes.json`, `fn1-lb.json`, `fn1-header.json` — all in the same `mobile-audit\` directory. Driver: `fn1-cdp.mjs`.