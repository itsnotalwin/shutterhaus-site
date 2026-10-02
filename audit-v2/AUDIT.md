# Shutterhaus Visuals — Site Audit (v2)

**Date:** 2026-10-02
**Target:** https://shutterhausvisuals.co.za — 5 public routes
**Method:** Headless Chrome 154 over CDP against the **live production bytes**, plus source reading. Every number below was measured, not estimated. Scripts and raw output are in `audit-v2/` and `tools/audit2-*.mjs`.

**Context:** the earlier `mobile-audit/` pass was pre-fix and its findings were deployed. This pass re-measures the current live site, so anything it fixed should no longer appear. Where it did not get fixed, that is called out.

---

## Verdict

The site is in good structural health — zero horizontal overflow, zero undersized tap targets, all contrast passing, layout perfectly stable. Those are hard-won and still true.

But **four things are genuinely broken right now**, two of them serious, and one of those has been live since today's changes went out. The reason they went unnoticed is the most important finding in this report: **the test gate is red and nobody is running it.**

---

## 🔴 CRITICAL

### 1. The portfolio wall is 2-up on desktop. The desktop page is 14.6 metres tall.

| Viewport | Rows | Cols/row | Frames | Tile size | Page height |
|---|---|---|---|---|---|
| 320px | 14 | 2 | 28 | 136×204 | 3,685px |
| 393px | 14 | 2 | 28 | 173×259 | 4,406px |
| 768px | 14 | 2 | 28 | 351×527 | 7,852px |
| 1024px | 14 | 2 | 28 | 479×719 | 10,406px |
| **1440px** | **14** | **2** | **28** | **687×1031** | **14,582px** |

Your design is 3 per row. It is 2 per row at every width, including desktop, where each tile is **687px wide and 1031px tall** and the page is 14,582px long.

**Cause.** `src/pages.ts:512` emits `style="--row-cols:${row.length}"`. That is correct code — it guarantees one CSS track per frame. But `src/rows.ts` now holds **two** frames per row, so `row.length` is 2, so the inline variable is 2, so `src/editorial.css:833` builds a 2-column grid at every viewport.

The phone problem was real and the fix was sound in principle: three columns at 393px gives 111px tiles, too small to read a face. The mistake was fixing it **in the data**, because the column count is derived from the data. Fixing the phone silently broke the desktop.

Note the phone is now correct (173px tiles, and `.hstrip__grid` on the home page matches at 173.5px, so the inconsistency between the two pages is gone). The evenness guarantee is intact — row spread is **0px at all five widths**.

**Fix.** Stop deriving the desktop column count from the row length. Compute it from viewport with a media query, capped so tiles stay a sane size on a big monitor:

```css
.pf-row { grid-template-columns: repeat(var(--row-cols, 2), minmax(0, 1fr)); }
@media (min-width: 761px) { .pf-row { --row-cols: 3; } }
```

**Effort: S. Risk: low** — layout only. Re-run `npm run verify` after, since the gate's row/column expectations need updating either way (finding 5).

---

### 2. The word "Investment" is invisible on the services page.

`src/pages-more.ts:86` renders `<p class="eyebrow eyebrow--inv">Investment</p>` inside `<section class="invest">`.

- `.invest` (`src/editorial.css:589`) sets `background: #0d0d0d; color: #fff`
- `.eyebrow--inv` **has no CSS rule anywhere in the project**
- so `.eyebrow` (`src/editorial.css:18-26`) wins, setting `color: var(--ink)` = `#111`

Measured on the live page: foreground `rgb(17,17,17)`, background `rgb(13,13,13)`, **contrast ratio 1.03:1**. WCAG AA needs 4.5:1. The text is painted, so it is in the accessibility tree and to a screen reader — it is just not visible to anyone.

**Root cause is a class-name mismatch.** `src/editorial.css:599` defines `.invest__label` — a rule written for exactly this label. Nothing uses it: **0 elements with that class in the DOM.** The markup says `eyebrow--inv`, the stylesheet says `invest__label`, and nobody noticed because the rule that would have caught it exists but is never applied.

**Fix** — either rename the class in the markup, or add the missing rule. Renaming is one word:

```ts
// src/pages-more.ts:86
<p class="eyebrow invest__label">Investment</p>
```

Do this one. It is the whole bug.

**Effort: S. Risk: very low.**

---

### 3. The "most popular" package looks exactly like the other three.

`src/pages-more.ts:58` adds `pkg--pop` to the recommended tier. **`pkg--pop` has no CSS rule either.**

Measured computed styles, all four cards:

| Card | Class | Border | Background | Shadow | Transform |
|---|---|---|---|---|---|
| Starter | `pkg` | 0 none | transparent | none | none |
| **Essential** (popular) | **`pkg pkg--pop`** | **0 none** | **transparent** | **none** | **none** |
| Signature | `pkg` | 0 none | transparent | none | none |
| Social | `pkg` | 0 none | transparent | none | none |

The recommended package is visually identical to the others. On the one page whose entire job is making a sale.

**Fix.** A treatment that stays inside the black-and-white brand — no colour. An inverted card (black fill, white text) for the popular tier would be strongest and needs no new colour token. A hairline border plus a `Most popular` badge is the minimum viable version.

**Effort: S for a badge, M for the inverted card.**

---

### 4. The homepage H1 breaks mid-word: "PORTRAITUR / E"

Visible in the live baseline capture at `audit-v2/baseline/home-viewport.png`, on the most prominent element on the site.

Measured across 45 headings on 5 routes at 320/393/430px — this is the only heading class affected:

| Viewport | Longest word needs | Has | Ratio | Fits at |
|---|---|---|---|---|
| 393px | 368px | 354px | 1.038 | **46.2px** (currently 48px) |
| 320px | 368px | 281px | 1.308 | **36.7px** (currently 48px) |

**Cause.** `src/editorial.css:237-239` applies `overflow-wrap: anywhere` under `max-width: 640px`. That cured a horizontal scrollbar by letting the browser break inside the word. It traded one defect for a worse-looking one.

**Fix.** Let the size absorb the word instead of breaking it — lower the clamp floor so the heading scales with the viewport, and drop `overflow-wrap` back to normal so it can never silently break again:

```css
.hero__h { font-size: clamp(36px, 9.6vw, 132px); overflow-wrap: normal; }
```

**Effort: S. Risk: low.** This was upgrade #12 on the earlier list; it is still unfixed.

---

## 🟠 HIGH

### 5. The test gate is red: 59 of 67 checks failing, and nothing runs it.

```
npm run verify  →  59/67 passed
FAILED:
  - ten rows of three            (14 rows, 2/2/2/2/…)
  - 30 frames in the wall        (28)
  - one image per frame          (28)
  - three CSS tracks per row     (2)
  - data-n kept for the counter  (28)
  - band CTA goes to contact     (./contact.html)
  - #/video falls back to the gallery
  - every package links to contact
```

`tools/verify.mjs` still asserts a world that stopped existing today when the SPA was split into real per-page documents. It checks for `#/contact` links while the markup emits `./contact.html`, and it drives `location.hash = '#/contact'`, which no longer routes anywhere.

This is why finding 1 survived. The gate would have caught it.

**Fix:** update the eight expectations to the per-page-document world, then wire `npm run verify` into `.github/` so a red gate blocks the deploy. A gate nobody runs is worse than no gate, because `npm run verify` still looks like it passes.

**Effort: M.**

### 6. The entire black-and-white brand is a CSS filter over colour JPEGs.

`src/styles.css:301` is the whole monochrome treatment:

```css
.shell.is-bw .cell img { filter: grayscale(1) contrast(1.06); }
```

The files in `public/gallery/` are **colour photographs**. Nothing about them is
black and white on disk; the browser downloads full-colour images and greyscales
them at paint time.

Three consequences worth knowing:

- **It is a single point of failure.** `.shell.is-bw` is the gate. If that class
  is missing, renamed, or overridden, colour photographs appear on a site whose
  entire identity is that they are not. That is exactly what happened on touch
  devices before the earlier fix.
- **It costs paint performance.** Every photograph is an extra full-image filter
  pass on the compositor. On a 30-frame wall that is not free, and it is part of
  why the portfolio route is the heaviest.
- **It is reversible and lossy for the file.** Baking the conversion into the
  derivatives would ship smaller files and remove the runtime cost — but it also
  makes the treatment permanent, so it is a design decision, not just a
  performance one.

Worth a deliberate decision rather than an accident. Do not "fix" it by removing
the filter.

**Effort: M to bake into derivatives at the image-prep step.**

---

### 7. The wall is 28 frames, not the 30 you asked for.

You asked for 30. The lightbox still captions it `02 / 30`. Two frames are missing somewhere in the row-packing.

**Effort: S.** Worth a look at `tools/rows.py` — it is a 14-row-by-2 pack, so the count is a packing artefact rather than a choice.

---

## 🟡 MEDIUM

### 8. A generated file ships a stale docstring that contradicts its own data.

`src/rows.ts` opens with *"The portfolio wall: 30 chosen frames, 10 rows of 3"* and *"Every row holds three frames."* Its actual data is 14 rows of 2.

The source of truth is correct — `tools/rows.py:9,29,49` properly documents the change to two frames per row. The stale text is in `tools/build-rows-ts.py:45,52`, which is the generator that writes the comment into the output file. So every rebuild re-injects the wrong documentation.

**Why it matters:** anyone reading `src/rows.ts` is told the wall is 3-up, which is the exact belief that makes finding 1 look intentional.

**Effort: S.** Edit the comment template in `tools/build-rows-ts.py` and regenerate.

### 9. Portfolio transfer weight — 1,624KB measured on the live route.

The heaviest route by a wide margin (home is 1,113KB). The tiles are also being served larger than they render: at 1440px the first image's natural width is 604px against a 687px box, but at 393px it is 165px against a 173px box — close enough that this is not the problem. The weight is the 28 frames themselves, not a sizing fault.

Fixing finding 1 (3-up desktop) will not reduce total bytes but will cut the page from 14,582px to roughly a third of that scroll depth.

**Effort: M for any real reduction** — deferring offscreen frames, or shipping a second, tighter crop set for the phone.

---

### 10. Real content exists that the live page never shows.

Every one of the four tiers defines a compact spec line in `src/config.ts`:

| Tier | `spec` (config.ts) |
|---|---|
| Starter | 30 min · 1 outfit · 1 location |
| Essential | 60 min · 2 outfits · 1–2 locations |
| Signature | 90 min · 2–3 outfits · multiple locations |
| Social | 45 min · 2 outfits · 1 location |

`src/config.ts:55` documents it as *"duration / outfits / locations, shown as a
compact spec line."* It is not shown.

The only code that renders it is `src/pages-more.ts:125`, inside
`pricingPage()`. **`pricingPage()` is dead code** — declared at line 117,
exported, never imported and never routed. The live route calls
`servicesPage()` (line 48), which uses `pkg__*` classes and never emits `spec`.

So a client comparing Starter against Signature sees two prices and two
paragraphs of prose, but not "30 min" against "90 min" — which is the single
easiest thing to compare and the thing a first-time buyer actually wants.

**Fix.** Render `spec` in `servicesPage()`'s card (`.pkg__num` at line 62 is
the natural place, or directly under `.pkg__desc`). Effort **S**. Then delete
`pricingPage()` — it is 54 lines of unrouted markup that will rot.

---

## 🟠 HIGH (second pass — verified after the mockups came back)

The mockup agents surfaced more leads. Two held up under measurement, one did
not, and the failure is worth recording.

### 11. `object-fit: cover` is live on three figures — a violation of your own rule

You rejected cover-cropping ("when i hover it destroys the crop"). It is still
in the stylesheet, in three places:

| Location | Selector | Effect |
|---|---|---|
| `editorial.css:152` | *(figure image)* | cover crop |
| `editorial.css:558` | `.pkg__fig img` | package card photos forced to fill |
| `editorial.css:620` | `.ct__fig img` | contact figure forced to `aspect-ratio: 4/5` |

Measured live on `/contact`: the photograph's natural ratio is **1600/2400
(2:3)** and it renders into a **277×324px box (≈4:5)**. `object-fit: cover` is
cropping a portrait into a squarer frame. This is happening now, on the live
site, on both the services and contact pages.

Note the mixed signals: `.lb__img` in `styles.css:479` correctly uses
`object-fit: contain`. So the rule was applied inconsistently across the site.

**Effort: S** per site, but each one needs a focal-point decision, so budget
**M** to do them properly rather than deleting the property.

### 12. The contact page serves a 1600px photograph to render it at 277px

`src/pages-more.ts:179` builds the contact figure as:

```ts
<img src="${escapeHtml(shot.url)}" ... />
```

`shot.url` is the **original file**. Every other image on the site goes through
`bestDerivative()` to pick a sized, re-encoded WebP. `aboutPage()` — 160 lines
above — gets it right. This one was simply missed.

Measured live on a 393px phone: `49-img-0131.jpg`, **natural 1600px, rendered
277px**. The phone downloads a 1600px original to paint a 277px box. On mobile
data that is real money for a decorative image.

**Fix:** use `bestDerivative(shot.url, "webp", shot.width)` and wrap in
`pictureFor()` like every other figure. Effort **S**. This is very likely most
of the contact route's 756KB.

---

## ❌ Claimed by an agent, did NOT reproduce

Worth recording so nobody re-investigates it: **".invest .cta is also
black-on-black."**

The reasoning is sound — `.cta` (`editorial.css:89`) sets `color: var(--ink)`
and `::before { background: var(--ink) }`, and the only white override is
`.hero__body .cta` (`editorial.css:268-269`) — so a `.cta` inside the dark
`.invest` band *would* be invisible.

But there is no `.cta` inside `.invest`. Measured live on `/services`: all four
`.cta` elements are "Book now", each on `rgb(255,255,255)` at **18.88:1**.
The bug is latent, not live — it would bite the moment someone adds a CTA to
that band. Worth knowing; not worth fixing today.

The same check also cleared the class-name worry: both `.contact__fig` and
`.ct__fig` rules exist in the built CSS. Two rules for one element is
duplication worth tidying, but the element is styled.

---

## ✅ Ruled out — do not spend time here

I chased these and they are fine. Recording them so they don't get re-investigated.

- **The contact form works.** `SITE.contact.formEndpoint` is set to a real Formspree endpoint. An empty POST returns `400 {"error":"Can't send an empty form"}`, which is the correct response and proves the form is enabled and accepting submissions. No leads are being silently lost.
- **No broken images anywhere.** The baseline run reported 1 broken image per route; it is the lightbox's empty `<img class="lb__img">`, which has no `src` until a photo is opened. Re-checked after scrolling every route fully: zero real breaks.
- **The saturated reds and greens in `styles.css` are admin-only.** `#b3261e`, `#eaf4ec`, `#1c5c2c` and friends belong to `.gate__err` and `.notice--ok/--err`, which are only rendered by `admin.ts`. The public site stays black-and-white.
- **The wall's evenness guarantee holds.** Row spread is 0px at 320, 393, 768, 1024 and 1440px. Whatever you change about the columns, keep this at 0.
- **Still healthy from the earlier audit, spot-checked and holding:** zero horizontal overflow, zero tap targets under 44px, all solid-background contrast passing, 16px form inputs (no iOS zoom), no console errors, no failed network requests.

---

## Recommended order

1. **Fix the desktop wall** (finding 1) — one media query, restores the whole portfolio page.
2. **Fix the invisible "Investment" label** (finding 2) — one class rename.
3. **Give the popular package a treatment** (finding 3).
4. **Fix the mid-word H1** (finding 4) — one clamp value.
5. **Repair and wire up the test gate** (finding 5) — so the next one is caught automatically.
6. Then the visual upgrades, per page, in `mockups-v2/`.

Items 1–4 are small and mechanical. Item 5 is what stops this recurring.

---

## Files

| Path | What |
|---|---|
| `tools/audit2-baseline.mjs` | Live capture, all 5 routes, 393px, viewport + full page |
| `tools/audit2-broken.mjs` | Broken-image hunt with full-scroll retry |
| `tools/audit2-headings.mjs` | Mid-word break sweep, 45 headings × 3 widths |
| `tools/audit2-verify-bugs.mjs` | Contrast + computed-style proof for findings 2 and 3 |
| `tools/audit2-wall.mjs` | Wall geometry across 5 viewports |
| `audit-v2/baseline/` | Live screenshots + `baseline.json` |
| `audit-v2/headings.json` | Raw heading measurements |
| `audit-v2/wall.json` | Raw wall measurements |
| `mockups-v2/` | Per-page visual upgrade mockups |
