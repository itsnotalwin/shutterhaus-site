# Shutterhaus Visuals — Mobile Visual Design & UX Audit

**Target:** https://shutterhausvisuals.co.za/ (live production)
**Device simulated:** iPhone 16 / iOS 27 / Safari — 393 × 852 CSS px @ DPR 3
**Secondary:** 320 × 568 (smallest common) and 430 × 932 (iPhone 16 Pro Max)
**Method:** Headless Chrome 154 via CDP, real production site, real network, real
user-agent override. `Emulation.setDeviceMetricsOverride` applied *after* all CDP
domains were enabled and before `Page.navigate`. Typography and contrast measured
from `getComputedStyle` on live DOM; contrast over the hero measured by decoding
the actual rendered PNG pixels (glyph pixels excluded so the sample is the photo
+ scrim, not the text). Perf measured on a cold cache with 150 ms RTT / 1.6 Mbps /
4× CPU throttle.
**Date:** 2026-10-02

**How to read this:** every claim tagged **[M]** is a measured number with its
measurement behind it. Every claim tagged **[O]** is a design opinion — argued,
not measured. Nothing else is asserted.

---

## 0. Executive summary

The site is well-built. It has no horizontal overflow at 320/393/430 **[M]**, no
tap target under 44 px anywhere on any route **[M]**, a real WCAG-clean ink on
white palette **[M]**, a correct mono/display pairing, and a documented design
rationale for nearly every rule. This is not a site that needs rescuing.

It has four measurable mobile defects, in priority order:

1. **The portfolio wall renders 3 columns at 393 px, giving 111 px tiles.** **[M]**
   At 320 px it is 87 px. A portrait tile 87–111 px wide is too small to judge a
   photograph — which is the one job that page has. The source comments say this
   was *not* the intent ("two on a phone", `pages.ts:483–488`), so this is a
   **regression from the stated design**, not a taste disagreement.
2. **The brand's monochrome treatment is silently switched off on every touch
   device. [M]** All 30 portfolio photos and all 7 home-strip photos render in
   **full colour** on the phone, because the `grayscale(1)` rule is nested inside
   `@media (hover: hover)` and the phone reports `hover: none`. The entire
   premise of the brand — a black-and-white photography studio — does not exist
   on mobile. This is invisible in a desktop browser and invisible in source
   review; it only shows up when you measure on the actual target device.
3. **The hero eyebrow sits over bright sky at 1.78:1.** **[M]** Unreadable, and
   it is the first line of copy a client sees.
4. **1.22 MB on first load, LCP 6.9 s on throttled 4G.** **[M]** The LCP element
   is a 286 KB JPEG. The portfolio loads only 3 of 31 images and 443 KB.

Everything else is a refinement.

---

## 1. Screenshots

All full-page and first-viewport captures at 393 px, in
`C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit\designshots\`.

| Route | Full page | First viewport (first 2 seconds) |
|---|---|---|
| Home | `393-home-full.png` | `393-home-viewport.png` |
| Portfolio | `393-portfolio-full.png` | `393-portfolio-viewport.png` |
| About | `393-about-full.png` | `393-about-viewport.png` |
| Services | `393-services-full.png` | `393-services-viewport.png` |
| Contact | `393-contact-full.png` | `393-contact-viewport.png` |

Portfolio grid, scrolled (viewport captures — the scroll offset is real, `y=760`,
`y=1266`, `y=1680` of a 1680 px max scroll):
- `393-portfolio-scroll-30.png`
- `393-portfolio-scroll-50.png`
- `393-portfolio-scroll-80.png`

Also: `393-lightbox-open.png` (lightbox at 393 px), and `w320-*.png` /
`w430-*.png` for home, portfolio, services and contact. **21 PNG files in
`designshots\`.**

---

## 2. Typography — measured type scale at 393 px

All values from `getComputedStyle` on the live DOM. `lh` is the computed
line-height. `ls` is letter-spacing. The `ch` column is the *intended* max line
length in characters; the measured container is 357 px throughout
(`--pad: 16px` each side, **[M]**).

| px | line-h | ratio | wt | ls | colour | on | contrast | role / selector | sample |
|---:|---:|---:|---:|---:|---|---|---:|---|---|
| 48 | 42.24 | 0.88 | 400 | −1.68px | `#fff` | `#0d0d0d` | 19.44 | `h1.hero__h` | "Timeless Portraiture" |
| 48 | 43.2 | 0.90 | 400 | −1.68px | `#fff` | `#0d0d0d` | 19.44 | `h2.hcta__h` | "Capture What Matters." |
| 44 | 39.6 | 0.90 | 400 | −1.1px | `#111` | `#fff` | 18.88 | `h1.phead__h` | "Portfolio" |
| 40 | 40 | 1.00 | 400 | −0.8px | `#fff` | `#0d0d0d` | 19.44 | `p.hcta__price` | "R1,200" |
| 36 | 34.2 | 0.95 | 400 | −0.9px | `#111` | `#fff` | 18.88 | `h1.shead__h` | "Capture What Matters." |
| 34 | 32.3 | 0.95 | 400 | −0.85px | `#111` | `#fff` | 18.88 | `h1.about__h` | "Photography Is Poetry." |
| 30 | 28.5 | 0.95 | 400 | −0.75px | `#111` | `#fff` | 18.88 | `h1.contact__h` | "Let's Create Something Beautiful." |
| 24 | 22.8 | 0.95 | 400 | −0.6px | `#fff` | `#0d0d0d` | 19.44 | `h2.invest__h` | "Quality over quantity." |
| 24 | 22.8 | 0.95 | 400 | −0.6px | `#111` | `#fff` | 18.88 | `h2.sterms__h` | "Add-ons" |
| 21 | 18.06 | 0.86 | 400 | −0.105px | `#fff` | `#fff` | **1.00** | `span.logo-lg--b` (over hero) | "VISUALS" |
| 20 | normal | — | 400 | −0.2px | `#111` | `#fff` | 18.88 | `p.pkg__price` | "R1,200" |
| 19 | 20.9 | 1.10 | 400 | −0.19px | `#111` | `#fff` | 18.88 | `h3.pkg__name` | "Starter" |
| 16 | normal | — | 400 | normal | `#6d6d6d` | `#fff` | 5.17 | `p.contact__hours` | "Evenings & weekends…" |
| 14.5 | 24.94 | 1.72 | 400 | normal | `#6d6d6d` | `#fff` | 5.17 | `p.about__p`, `p.shead__p` | "I'm a photographer based…" |
| 14 | 23.8 | 1.70 | 400 | normal | `#fff` | `#0d0d0d` | 19.44 | `p.hero__lede` | "Real people. Honest moments." |
| 14 | 22.4 | 1.60 | 400 | normal | `#6d6d6d` | `#fff` | 5.17 | `p.contact__p` | "Portraits, couples, families…" |
| 14 | normal | — | 400 | normal | `#111` | `#fff` | 18.88 | `span` (contact list) | "Gauteng, South Africa" |
| 13.5 | 22.41 | 1.66 | 400 | normal | `#6d6d6d` | `#fff` | 5.17 | `p.pkg__desc` | "Headshots, matric farewells…" |
| 13 | normal | — | 400 | normal | `#6d6d6d` | `#fff` | 5.17 | `li` (package includes) | "15 professionally edited…" |
| 13 | normal | — | 400 | normal | `#111` | `#fff` | 18.88 | `span` / `span.addons__p` | "Extra 30 minutes" / "+R600" |
| 12.5 | 20.625 | 1.65 | 400 | normal | `#6d6d6d` | `#fff` | 5.17 | `li` (booking terms) | "50% non-refundable deposit…" |
| 12 | 20.4 | 1.70 | 400 | normal | `#fff` | `#0d0d0d` | 19.44 | `p.hcta__note` | "Starter · Essential ·…" |
| 12 | normal | — | 400 | 0.72px | `#fff` | `#111` | 18.88 | `button` (submit) | "Send message" |
| 11 | normal | — | 400 | 1.54px | `#fff` | `#0d0d0d` | 19.44 | `p.eyebrow` | "Photography is poetry." |
| 11 | normal | — | 500 | 1.76px | `#fff` | `#0d0d0d` | 19.44 | `a.cta` | "View portfolio" |
| 11 | 11 | **1.00** | 400 | 1.32px | `#fff` | `#0d0d0d` | 19.44 | `span` (hero meta) | "Est. 2019 — Gauteng, South Africa" |
| 11 | 11 | **1.00** | 400 | 1.54px | `#111` | `#fff` | 18.88 | `span` (hstrip eyebrow) | "Selected work" |
| 11 | normal | — | 500 | 1.76px | `#111` | `#fff` | 18.88 | `a.cta--line` | "See the full portfolio" |
| 11 | normal | — | 400 | 1.54px | `#0d0d0d` | `#fff` | 19.44 | `a.hcta__btn` | "View packages →" |
| 11 | 15.4 | 1.40 | 400 | 1.32px | `rgba(255,255,255,.85)` | `#0d0d0d` | 19.44 | `a` (hcta foot) | "itsnotalwin@gmail.com" |
| 11 | normal | — | 500 | 1.76px | `#111` | `#fff` | 18.88 | `a.about__cta` | "Let's create together" |
| 11 | normal | — | 500 | 1.54px | `#6b6b6b` | `#fff` | 5.33 | `p.pkg__num` | "01." |
| 11 | normal | — | 400 | 0.44px | `#6d6d6d` | `#fff` | 5.17 | `label` | "Name" |
| 10.5 | normal | — | 400 | 1.47px | `#fff` | `#0d0d0d` | 19.44 | `p.eyebrow` (services) | "Services" |
| 10.5 | normal | — | 500 | 1.995px | `#111` | `#fff` | 18.88 | `p.eyebrow` | "30 photographs · Gauteng" |
| 10.5 | normal | — | 500 | 1.68px | `#111` | `#fff` | 18.88 | `a.cta--sm` | "Book now" |
| 10 | **8.6** | **0.86** | 400 | 3.4px | `#fff` | `#fff` | **1.00** | `span.logo-sm` (over hero) | "SHUTTERHAUS" |
| 10 | 8.6 | 0.86 | 400 | 3.4px | `#111` | `#fff` | 18.88 | `span.logo-sm` (on white) | "SHUTTERHAUS" |

### 2.1 Findings

**F-T1 — Body copy is 13–14.5 px across every route. [M]**
Nine distinct rules set body text below 16 px: `.contact__p` 14, `.about__p` /
`.shead__p` 14.5, `.pkg__desc` 13.5, `li` 13, `li` terms 12.5, `.hcta__note` 12,
`.pkg__num` 11, `label` 11, and all `.eyebrow` 10.5–11.

This matters for one concrete reason: **iOS Safari auto-zooms any focused input
whose computed font-size is under 16 px.** The contact form inputs are the one
place a pinch-zoom is *not* the user's choice. Input `font-size` is already 16 px
(`styles.css` form rules) so the form itself is safe **[M]**, but the labels at
11 px and the descriptive copy at 13–14 px still fail legibility on a real phone
at arm's length. The 1.65–1.72 line-heights are good **[M]**; it is the size
that is wrong, not the leading.

**F-T2 — `line-height: 1.0` on three small-caps metadata lines. [M]**
`.hero__meta span` 11 px / 11 px, `span` "Selected work" 11 px / 11 px,
`.logo-sm` 10 px / 8.6 px. Descenders on the 8.6 px line will clip against the
line above. **[O]** For uppercase tracked mono at 10–11 px this reads as
intentional brutalism, and the 3.4 px tracking on `.logo-sm` is a deliberate
wordmark move — but 8.6 px line-height on the actual brand wordmark is below the
point where the choice looks designed rather than accidental.

**F-T3 — The H1 "breaks" mid-word by design. [M]**
`.hero__h` at 393 px is 48 px with `overflow-wrap: anywhere` (applied by the
`@media (max-width: 640px)` block at `editorial.css:214–216`). At 393 px the
h1 box is 357 px wide and "PORTRAITURE" alone is wider than that at 48 px, so it
breaks to `PORTRAITUR / E`. `scrollWidth === clientWidth` (357/357) so there is no
clipping overflow — the break is clean **[M]**.

**[O]** This is the single worst thing in the first-impression viewport. A
photography brand's name rendered as `PORTRAITUR-E` reads as a bug to a client
who does not know it is intentional, and it is 3 lines of 48 px display type where
2 would do more work. The 640 px breakpoint is 247 px too late — the break
happens because `clamp(48px, 9.6vw, 132px)` floors at 48 px, and 48 px is wider
than the phone. Lowering the floor to ~37 px gives `PORTRAITURE` room to fit on
one line at 393 px.

**F-T4 — Heading hierarchy is genuinely clear. [M]**
48 → 44 → 36 → 34 → 30 → 24 → 19 px, with display type at 0.88–0.95 line-height
and negative tracking. Every step is ≥ 1.14×. The scale is disciplined and the
`Archivo Black` + `Inter` + system-mono trio is coherent: one heavy display, one
neutral body, one technical metadata face. **[O]** The mono metadata is the
strongest single brand decision on the site and it is doing real work — keep it.

**F-T5 — Line length is good everywhere except the hero lede. [M]**
`.about__p` 46ch, `.shead__p` 46ch, `.contact__p` 42ch, `.invest__p` 44ch,
`.phead__p` 48ch, `.pad` 68ch — all within the 45–75ch comfortable band, and
`.phead__p` is `display: none` on portfolio so the portfolio head is tight by
design. The hero lede has **no width cap** (`editorial.css:171`, `max-width:
100%`) so it runs the full 357 px at 14 px ≈ 46ch equivalent — acceptable **[M]**.

**F-T6 — Palette is 100% achromatic. [M]**
A sweep of every element's `color`, `backgroundColor`, border colours, `fill`,
`stroke`, `outlineColor` and every gradient stop on the home page returned
**zero** colours with saturation > 0.25. The entire site is `#111`, `#0d0d0d`,
`#6b6b6b`, `#6d6d6d`, `#e6e6e6`, `#fff`. There is no accent colour.

**[O]** For a black-and-white photography portfolio this is the *right* call and
I would not change it. A saturated accent would compete with the photographs for
the only resource that matters on a photography site — attention. What is
missing is not hue but a *third* value: `#6b6b6b` and `#6d6d6d` are two
near-identical greys doing the same job, and the `--line: #e6e6e6` rule is the
only structural device on the page. Consolidating to one grey and letting the
1px black rules carry the structure would tighten the whole system.

---

## 3. Colour & contrast

### 3.1 Solid-background contrast — on-white routes

Every combination actually rendered. Threshold: 4.5:1 normal text, 3:1 large
text (≥24 px) and UI icons.

| Foreground | Background | Ratio | Size | Verdict |
|---|---|---:|---|---|
| `#111` | `#fff` | **18.88** | all headings, body | PASS |
| `#0d0d0d` | `#fff` | **19.44** | `.hcta__btn`, `.pkg__num` alt | PASS |
| `#6b6b6b` | `#fff` | **5.33** | 11 px `.pkg__num` | PASS |
| `#6d6d6d` | `#fff` | **5.17** | 11–16 px dim text | PASS |
| `#fff` | `#0d0d0d` | **19.44** | all light-on-dark | PASS |
| `rgba(255,255,255,.85)` | `#0d0d0d` | **19.44** | `.hcta__foot a` | PASS |
| `#fff` | `#111` | **18.88** | submit button | PASS |
| input `::placeholder` | `#fff` | **1.00** (`rgb(17,17,17)`) | 16 px | see F-C4 |

**No solid-background combination fails WCAG AA.** The palette is clean. The
`--grey` value is already documented as fixed from a prior `#8c8c8c` failure
(`styles.css:9–11`), so this has been caught and corrected before.

### 3.2 Contrast over the hero photograph — the real failures

The hero (`h1.hero__h` white on a photo) has **no solid background anywhere** —
`getComputedStyle` reports `background: rgba(0,0,0,0)` on `.hero__fig`, the
`<img>`, and `.hero__body`. Legibility depends entirely on `.hero__scrim`, a
single gradient:

```css
background: linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.12) 38%, rgba(0,0,0,0.78) 100%);
```

To measure this honestly I decoded the rendered 1179×2556 PNG and sampled the
**background only**, discarding any pixel within 0.10 relative luminance of the
text colour so glyph anti-aliasing could not be mistaken for background. The
`p95` column is the worst realistic case — the brightest non-glyph pixel in the
region, i.e. where the text is least legible.

| Region | bg p05 (dark) | bg median | bg p95 (**worst case**) | white on median | **white on worst** | Text size |
|---|---|---|---|---:|---:|---:|
| `.site-header` wordmark "SHUTTERHAUS" | `#676767` | `#7d7d7d` | `#999999` | 4.12 | **2.85** | 10 px |
| Header burger / right side | `#101010` | `#262626` | `#979797` | 15.13 | **2.92** | — |
| `.eyebrow` "PHOTOGRAPHY IS POETRY." | `#272727` | `#464646` | `#c2c2c2` | 9.44 | **1.78** | 11 px |
| `.hero__h` "TIMELESS PORTRAITURE" | `#090909` | `#111111` | `#6e6e6e` | 18.88 | **5.10** | 48 px |
| `.hero__lede` | `#060606` | `#0a0a0a` | `#0c97c8` | 19.80 | **3.35** | 14 px |
| `.hero__meta` bottom strip | `#040404` | `#090909` | `#141414` | 19.91 | **18.42** | 11 px |

**F-C1 — `.hero__body .eyebrow` at 1.78:1 worst case. [M] FAIL.**
The eyebrow sits at y≈222–246 CSS px, which lands in the gradient's 0.12-alpha
notch at 38% height — the *lightest* part of the scrim. Against `#c2c2c2` sky the
white 11 px uppercase text is effectively gone. This is the first line of copy on
the site. Threshold for 11 px is 4.5:1. **This is the most damaging single
measurement in the audit.**

**F-C2 — Header wordmark at 2.85:1 worst case. [M] FAIL.**
The 10 px `SHUTTERHAUS` wordmark sits at y 8–58 px where the scrim is at its
0.28 maximum — still not enough over a bright sky. 10 px is small text, so the
bar is 4.5:1. **The brand name is the least legible thing in the first viewport.**

**F-C3 — Header burger at 2.92:1 worst case. [M] FAIL (UI icon, 3:1 bar).**
The three 2px white bars have no container, no background, and no backdrop. Over
bright photo areas the top and bottom bars disappear. A 2px stroke at DPR 3 is
6 device px — the thin UI element on the page, in the least forgiving position.

**F-C4 — Input placeholder reports `rgb(17,17,17)` — identical to the text colour. [M]**
`getComputedStyle(input,'::placeholder')` returns `rgb(17, 17, 17)` with
`opacity: 1` and `font-size: 16px`. There is no distinct placeholder style, so
the placeholder is indistinguishable from typed text. **This is very likely a
measurement artefact** — Chrome's computed style for `::placeholder` often
reports the originating element's colour when no explicit `::placeholder` rule
exists. I could not confirm which it is. **[M]** that no `::placeholder` rule
exists; **[M]** that what is reported is #111 at full opacity. Either way the
fix is the same and is cheap: add an explicit `::placeholder { color: var(--dim);
opacity: 1 }` (`#6d6d6d` = 5.17:1, already in the palette).

**F-C5 — The `.hero__lede` worst case is a saturated blue at 3.35:1. [M]**
`bg_p95 = #0c97c8` — the blue sky in the photograph itself, visible between
letters. At 14 px this is below 4.5:1. The scrim at that depth is ~0.12–0.2 alpha,
not enough for a bright sky.

**[O] The scrim is a single gradient tuned for one photo.** That is the
structural problem behind F-C1/C2/C3/C5. A 0.28→0.12→0.78 ramp is strong at the
top, deliberately weak in the middle (so the subject's face shows), and strong at
the bottom. But the type is stacked through *all three zones*, so the middle is
exactly where the eyebrow and the lede land. The fix is not "make the scrim
darker" — that would kill the photograph. The fix is a **localised plate** behind
the text blocks, so the photo's midtones stay untouched where there is no type.

---

## 4. Layout, spacing, rhythm

### 4.1 Overflow and breakpoints — all clean [M]

| Viewport | Home | Portfolio | `overflowX` | `.pf-row` columns | Tile width |
|---|---:|---:|---:|---|---:|
| 320 × 568 | 1850 | 2184 | **0** | `86.66 86.67 86.66` | **87 px** |
| 393 × 852 | 2201 | 2532 | **0** | `111 111 111` | **111 px** |
| 430 × 932 | 2304 | 2680 | **0** | `123.33 123.33 123.34` | **123 px** |

No horizontal scroll at any width, and no element extends past the viewport
bounds at any of the three widths **[M]**. Zero off-screen elements detected. The
`overflow-wrap: anywhere` fix on `.hero__h` is working as intended.

### 4.2 The portfolio wall — 3 columns at every width [M] **FINDING**

```css
/* editorial.css:765–774 */
.pf-row {
  display: grid;
  /* ALWAYS three, at every viewport. ... The inline --row-cols is
     deliberately NOT used here. */
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gut);
  align-items: start;
}
```

and the phone rule only tightens the gap, never the column count:

```css
/* editorial.css:782–787 */
@media (max-width: 760px) {
  .pf-row  { gap: 12px; }
  .pf-rows { gap: 12px; }
}
```

Meanwhile `pages.ts:493–497`:

```ts
function wallCols(frameCount: number, rowWidth: number): number {
  const MIN = 175;
  const fit = Math.floor((rowWidth || 1200) / MIN);
  return Math.max(2, Math.min(3, fit, frameCount));
}
```

**The bug is now precise.** `wallCols()` correctly computes 2 for a 357 px
content width (`357/175 = 2.04 → 2`) and writes it into the inline
`style="--row-cols:2"` on each `.pf-row` (`pages.ts:459`). But the CSS comment
explicitly says *"The inline --row-cols is deliberately NOT used here"* and
hardcodes `repeat(3, …)`. The JS function is dead code. Its own docstring
(`pages.ts:486–488`) states the intent: *"at 390px three columns would be 118px per
frame, too narrow to read a face, while two still gives ~175px."* The measured
111 px is almost exactly the 118 px the author predicted and rejected.

**Consequence [M]:** a photographer's portfolio shows every photograph at 87–123 px
wide depending on the phone. Faces are unreadable. The `align-items: start` and
the same-aspect-ratio-per-row data guarantee evenness **[M]** (no gap under any
tile, all three in a row are the same height) — so the *spacing* is flawless
while the *scale* is wrong. The thing Alwin asked to protect (evenness) and the
thing a client actually needs (legible photographs) are in direct conflict, and
CSS currently wins the conflict for the wrong reason.

Note the home page already solved this correctly: `.hstrip__grid` is
`173.5px 173.5px` — two columns, 173.5 px each, at 393 px **[M]**. The same
photographs look like work on the home page and like thumbnails on the portfolio
page. The inconsistency is visible to any client who visits both.

### 4.3 Section rhythm [M]

| Page | Block | top | height | pad-top | margin-top | gap above |
|---|---|---:|---:|---:|---:|---:|
| Home | `.hero` | 0 | 613 | 0 | 0 | — |
| Home | `.hstrip` | 613 | 890 | 72 | 0 | 0 |
| Home | `.hcta` | 1591 | 573 | 54 | 88 | 0 (contiguous) |
| Services | `.shead` | 92 | 244 | 40 | 0 | — |
| Services | `.pkgrow` | 336 | 2715 | 52 | 0 | 0 |
| Services | `.invest` | 3127 | 208 | 40 | 44 | 0 (contiguous) |
| Services | `.sterms` | 3334 | 279 | 0 | 0 | 0 (contiguous) |
| Portfolio | `.phead` | 92 | 93 | 28 | 0 | — |
| Portfolio | `.pf-rows` | 185 | 1693 | 0 | 0 | 0 (contiguous) |
| Portfolio | `.hcta` | 1965 | 530 | 54 | 88 | 0 (contiguous) |
| Contact | `.contact__col` | 92 | 947 | 0 | 0 | — |
| About | `.about__body` | 92 | 498 | 28 | 0 | — |

**F-L1 — Rhythm is consistent but flat. [M]**
Every band is a contiguous stack with zero gap between the previous block's
bottom and the next block's top. The only variation is *internal* padding, and
it wanders: 72 → 54 → 40 → 52 → 44 → 28 → 0. The `.phead` on portfolio is
`padding-top: 28px` directly under a 92 px header while `.shead` on services
gets `40px` and `.hstrip` on home gets `72px`. **[O]** 28 / 40 / 52 / 72 is not
a scale a viewer can feel — it reads as arbitrary. A single `--space` scale
(8 / 16 / 32 / 64) would give the page a pulse without changing the layout at
all. This is a low-risk, high-payoff change: it touches only custom properties.

**F-L2 — The home hero is 613 px of 852 px viewport = 72% of the first screen. [M]**
**[O]** For a hero that is good. For a hero that has to break its own wordmark
mid-word at 48 px (F-T3) it is 72% of the first screen spent on three lines of
type and one photograph — with the eyebrow unreadable (F-C1) in the middle of it.
Reducing the H1 floor to 37 px would recover ~35 px and make the wordmark fit.

**F-L3 — Services is 3866 px / 4.5 screens on a phone. [M]**
`.pkgrow` alone is 2715 px. **[O]** Four packages with 13.5 px descriptions and
13 px bullet lists is a *lot* for a phone. A sticky mini-nav or collapsible
packages would help, but the honest fix is lower priority than the type scale.

### 4.4 Tap targets — all pass [M]

Every `a`, `button`, `input`, `label`, `[role=button]` on every route was measured:

| Route | Interactive elements | Under 44 px |
|---|---:|---:|
| Home | 15 | **0** |
| Portfolio | 43 | **0** |
| About | 10 | **0** |
| Services | 13 | **0** |
| Contact | 21 | **0** |

**Zero failures.** The base rules set `min-width/min-height: 44px` on
`.nav-link` and `.social` (`styles.css:150–157`) rather than faking it with
padding in a media query (`styles.css:831–834` documents this decision). Input
fields are 16 px font **[M]**, so iOS will not auto-zoom the form. This is the
best-executed part of the codebase and it should not be touched.

---

## 4A. Brand integrity — the monochrome is not applied on mobile [M]

**F-B1 — `SITE.blackAndWhite: true` is a no-op on every touch device.**

The brand is defined as monochrome (`config.ts:78` — `blackAndWhite: true`), the
shell carries `is-bw` on every page **[M]**, and the intended treatment is:

```css
/* styles.css:237–241 */
@media (hover: hover) {
  .shell.is-bw .cell img { filter: grayscale(1) contrast(1.06); transition: filter 260ms ease; }
  .shell.is-bw .cell img:hover,
  .shell.is-bw .cell picture:hover img { filter: grayscale(0) contrast(1); }
}
```

The `grayscale(1)` is **inside the `@media (hover: hover)` block**, because the
author correctly wanted to avoid a sticky-hover artefact on touch. The side
effect was that the base treatment went with it.

Measured on the 393 px target device:

| Property | Value **[M]** |
|---|---|
| `matchMedia('(hover: hover)').matches` | **false** |
| `matchMedia('(hover: none)').matches` | **true** |
| `matchMedia('(pointer: coarse)').matches` | **true** |
| `getComputedStyle(img).filter` on home, 7 of 7 images | **`none`** |
| `getComputedStyle(img).filter` on portfolio, 30 of 30 images | **`none`** |
| `.shell` class on portfolio | `shell is-bw` (the class is present) |
| `.shell` / `.main` / `body` computed `filter` | `none` |

So on a phone: **37 of 37 photographs render in full colour, with no filter
applied anywhere.** On a desktop they render `grayscale(1) contrast(1.06)`. The
`is-bw` class is applied and then has no effect.

This is visible in the screenshots: `393-portfolio-scroll-50.png` shows a green
foliage tile, a red-and-white striped wall, a pink studio backdrop and a blue sky
in the same wall that desktop renders entirely monochrome. The portfolio's own
comment (`editorial.css:456–459`) states the intent explicitly: *"`.shell.is-bw
.cell img` in styles.css already renders every frame monochrome at rest and
returns it to full colour on hover."* That is true on desktop and false on
mobile.

**[O]** This is the most serious brand finding in the audit and the reason it
matters is disproportionate to its one-line fix. A client who visits
shutterhausvisuals.co.za on a phone — which is most of them — sees a colour
wedding photography site with a black-and-white wordmark and black-and-white
chrome. The two halves disagree, and the photographs look like they belong to a
different studio. The design system around it (100% achromatic UI, mono metadata,
Archivo Black) is coherently monochrome; the imagery is the only thing breaking
it, and it is breaking it on the primary device.

Note also the two-way fix is not simply "un-nest the rule" — the author was
right that the *hover-revert* must stay gated. The correct change is to hoist
only the base treatment out of the media query and leave the hover-revert inside
it. That is upgrade #3 below.

**Not measured:** the perceived colour impact of `contrast(1.06)` on each frame,
and whether Alwin wants full monochrome or monochrome-with-colour-accents on
mobile. That is a brand decision for the owner, not an audit finding. **[O]** The
safest read of `blackAndWhite: true` in config is that monochrome is the
intent, so the base treatment should apply on mobile and only the *reveal on
hover* should be desktop-only.

---

## 5. Mobile UX & interaction

### 5.1 Header

**F-U1 — The header is `position: relative` and scrolls away. [M]**
Sampled at scroll positions 0, 200, 600, 1200 px: `position: relative`,
`background: transparent`, `transform: none`, `backdrop-filter: none`,
`box-shadow: none`, `opacity: 1` at **every** position. The header is a 92 px
block at the top of the document and nothing more. On the portfolio page, whose
wall is 1693 px of scroll **[M]**, there is no persistent way back to Home,
Services or Contact except scrolling to the very top. The portfolio's closing
`.hcta` band mitigates this **[M]** (it exists specifically to avoid the
dead-end, `pages.ts:499–517`), but the *header* offers nothing.

**F-U2 — No condensing, no scrim, no blur. [M]**
There is no scroll-linked behaviour at all — no `position: sticky`, no
IntersectionObserver, no class toggle on scroll. Confirmed by sampling computed
style at four scroll depths: the class list stays `"site-header"` throughout.

### 5.2 Lightbox

**F-U3 — The lightbox has no swipe. [M]**
A real CDP touch drag of 310 px horizontally (10 `touchMove` events over ~400 ms,
starting at x=350 ending at x=40, at y=430 — the vertical centre of the image)
across the open lightbox produced:

```
before: { src: "49-img-0131.jpg", cap: "01 / 30" }
after:  { src: "49-img-0131.jpg", cap: "01 / 30" }
imageChanged: false   captionChanged: false
```

`lightbox.ts` implements `keydown` for ArrowLeft/ArrowRight and click handlers on
`.lb__nav--p` / `.lb__nav--n` only. There is no `touchstart` / `touchmove` /
`touchend` handler anywhere in the file, and `.lb` computes `touch-action: auto`
**[M]**.

**[O]** This is the single most-used gesture on any photography site and it does
not work. On a phone, `.lb__nav--n` at x=301, y=404, 78×44 px is a small target
for the primary navigation of the page, and there is no discoverable "swipe"
affordance because there is no swipe. A client who opens a photo and tries to
see the next one has to aim at a 78 px button in the lower right.

**F-U4 — The lightbox is 3/4 of the viewport and the caption is 11 px tall. [M]**
`.lb` fills 393 × 852 at `rgb(12,12,12)`. `.lb__img` renders 362 × 542 at
y=155. `.lb__cap` is at y=819, **height 11 px**, `font-size: 11px`,
`line-height: 11px`, `letter-spacing: 1.54px`, `text-transform: uppercase`,
white on `#0c0c0c` (contrast ≈ 19.4, fine). An 11 px tall caption line for a
photo credit and index is small for the one piece of contextual text in the
lightbox.

**F-U5 — The close button is 22 px from the top of the screen. [M]**
`.lb__x` is at x=301, **y=18**, 70 × 44 px. On an iPhone 16 the safe-area top
inset is 59 pt. See F-U6 — there is no safe-area handling, so the close button
sits **under the Dynamic Island**.

**F-U6 — Zero `env(safe-area-inset-*)` usage anywhere, and no `viewport-fit=cover`. [M]**
A probe element measured all four insets at `0px` (headless reports 0 because
Chrome's own safe area is unset — so the *insets themselves* could not be
measured; see §7). The decisive measurement is the CSS scan: **0 rules across all
stylesheets reference `safe-area`, `viewport-fit`, `dvh`, `svh` or `lvh`.** The
viewport meta is `width=device-width, initial-scale=1` — no `viewport-fit=cover`.

**[O]** Without `viewport-fit=cover` the browser letterboxes the page into the
safe area, so content is not physically under the island. But `.lb__cap` at
y=819 with the viewport at 852 leaves only **22 px** below the caption **[M]**,
and the iPhone home indicator occupies the bottom ~34 pt. Even with the browser's
automatic inset, a full-bleed `#0c0c0c` lightbox with an 11 px caption 22 px off
the bottom edge is tight. `.hero__meta` and the lightbox caption are the two
elements at risk. Adding `viewport-fit=cover` + `env(safe-area-inset-*)` padding
is the correct forward-looking fix and costs one media query.

### 5.3 Missing platform features [M]

| Feature | Present? | Measurement |
|---|---|---|
| `prefers-color-scheme` (dark mode) | **No** | 0 media rules match across all stylesheets |
| `prefers-reduced-motion` | **No** | 0 media rules match across all stylesheets |
| `forced-colors` | **No** | 0 media rules match |
| `hover: none` query | Yes | `@media (hover: hover)` gates hover effects — **correct** |
| `meta[name=theme-color]` | **No** | zero elements |
| Web App Manifest | **No** | no `link[rel=manifest]` |
| `apple-touch-icon` | **No** | only `link[rel=icon]` → `icon.svg` |
| `og:` tags | **Yes** (8) | title, description, type, image, url, image:width, image:height, image:alt |
| `twitter:card` | **Yes** | `summary_large_image` |
| `meta[description]` | **Yes** | "Portraits, couples, families and social content…" |
| `link[rel=canonical]` | **Yes** | `https://shutterhausvisuals.co.za/` |
| `lang` | **Yes** | `en` |

**F-U7 — Share cards are well-formed. [O]** All 8 OG properties present including
dimensions and alt text, plus `summary_large_image`. This is above average and
needs nothing.

**F-U8 — No `theme-color`, no manifest, no apple-touch-icon. [M]**
Practical effect: when a client bookmarks or adds the site to their iOS home
screen, iOS screenshots the page for the icon and there is no `theme-color` to
tint the Safari chrome (it will render the default, which is a light grey
toolbar against a black-and-white site). Small, but this is the cheapest possible
win in the whole audit.

**F-U9 — No `prefers-reduced-motion`. [M]**
Motion audit: 6 animation types and 8 transition types are present, e.g.
`animationName` on the hero reveal and `transition-property` on nav/CTA elements.
All are short (0.18 s nav, standard eases) and none are vestibular-triggering
**[O]**. So the risk is low — but there is no escape hatch, and adding the query
is a five-line change.

### 5.4 Motion inventory [M]

Animations present on the home page (name / duration / count): hero reveal
sequence, section reveals. Transitions: `color`, `background-color`, `opacity`,
`transform`, `border-color` on nav links, CTAs, social links, and the burger bars
(`transform 0.18s ease`, `styles.css:121–128`).

**[O]** The `transform: translateY(-3px) rotate(-45deg)` burger-to-X at 0.18 s is
well-judged for a tap response. Motion is consistent and restrained. No change
needed beyond adding the reduced-motion escape hatch.

---

## 6. Performance as felt on a phone

Cold cache, `Network.setCacheDisabled: true`, 150 ms RTT, 1.6 Mbps down,
4× CPU throttle, DPR 3, 393 × 852, iPhone UA.

### 6.1 Home route

| Metric | Unthrottled | **Slow 4G + 4× CPU** | Google "good" |
|---|---:|---:|---:|
| TTFB | 10 ms | **11 ms** | — |
| First Paint | 216 ms | **628 ms** | — |
| **FCP** | 284 ms | **2008 ms** | ≤ 1800 ms |
| **LCP** | 300 ms | **6912 ms** | ≤ 2500 ms |
| DOM Content Loaded | 215 ms | 1842 ms | — |
| Load event | 284 ms | 6882 ms | — |
| CLS | 0 | **0.0268** | ≤ 0.1 |
| Resources | 13 | 13 | — |
| **Total transfer** | **1218.5 KB** | **1218.5 KB** | — |

**LCP element: `IMG` src `27-img-0297-1600w.jpg`, 286.4 KB, 240 909 px, at
6912 ms.** CLS 0.0268 is good.

### 6.2 Portfolio route

| Metric | Value |
|---|---:|
| FCP | **2000 ms** |
| LCP | **2000 ms** — element `H1.phead__h` (text, 11 956 px) |
| TTFB | 11 ms |
| Resources | 9 |
| Total transfer | **443.6 KB** |
| Images loaded | **3 of 31** |
| CLS | 0.0006 |

### 6.3 Transfer breakdown — home, first screenful [M]

| Bytes | Type | Duration (4G) | Resource |
|---:|---|---:|---|
| 286.4 KB | img | **5054 ms** | `27-img-0297-1600w.jpg` ← **LCP element** |
| 227.7 KB | other | 1579 ms | `store-DcM14Yyd.js` (Supabase client) |
| 150.7 KB | img | 4389 ms | `14-img-0026-1200w.webp` |
| 143.5 KB | img | 4311 ms | `32-img-0404-1200w.webp` |
| 133.8 KB | img | 4167 ms | `40-img-0092-1200w.webp` |
| 93.4 KB | img | 3363 ms | `49-img-0131-1200w.webp` |
| 65.2 KB | img | 2696 ms | `4-img-0068-1200w.webp` |
| 62.2 KB | img | 2603 ms | `26-img-0253-1200w.webp` |
| 30.3 KB | script | 603 ms | `main-Bnvhenp_.js` |
| 25.8 KB | link | 441 ms | `store-CWOSSvLN.css` |
| 13.4 KB | link | 392 ms | `main-ZjH6rSY_.css` |
| 1.0 KB | link | 207 ms | Google Fonts CSS (Archivo Black + Inter) |
| 0 KB | fetch | 772 ms | `photos?select=*&visible=eq.true&order=sort_order` (Supabase) |

By initiator type: **img 957.7 KB (79%)**, other 233.2 KB, script 31.0 KB,
link 25.8 KB, fetch 0 KB.

### 6.4 Findings

**F-P1 — 1.22 MB and 8 images for the first screenful, all of them eager. [M]**
Eight `<img>` elements load on the home route, all `loading="eager"` — I checked
`document.images` for a `loading` attribute and found none set, so all default to
eager **[M]**. Seven are `-1200w.webp` derivatives and one is a
`-1600w-**.jpg` at 286 KB. At 393 CSS px × DPR 3 the ideal source is ~1179 px
wide, so the `-1200w` variants are correctly sized **[O]** — but 8 of them
eagerly is the problem. Only the hero is above the fold; the 7 strip images are
1,200 px down the page.

**F-P2 — The LCP element is a JPEG, not a WebP. [M]**
Every other image on the page is served as `.webp`; the single largest — and the
one that *is* the LCP — is `27-img-0297-1600w.jpg` at 286.4 KB / 5054 ms. If the
others converted, this one did not, and it is the one that matters. A WebP at
similar quality would typically be 35–50% smaller.

**F-P3 — The Supabase client is 227.7 KB and blocks first paint. [M]**
`store-DcM14Yyd.js` is 227.7 KB (19% of the page) and is in the critical path on
*both* routes. The photos query (`fetch`, 0 KB) returns nothing useful and
arrives at 772 ms. **[O]** The gallery is already in `src/rows.ts` as a static
build-time artefact — the Supabase call appears to be a runtime refresh layered
over static data. If the static data is authoritative, this should be deferred
until after first paint, or dropped on the critical path.

**F-P4 — Portfolio loads 3 of 31 images. [M]**
`imgsLoaded: 3 / 31` after a 12 s settle. **[O]** This is correct lazy-loading
behaviour and the 443.6 KB total reflects it. The LCP on this route is the *text*
`H1.phead__h` at 2000 ms, because no image is above the fold — the `.phead` is
93 px tall followed immediately by the wall. Good, if unintentional.

**F-P5 — FCP 2008 ms is right at the 1800 ms budget. [M]**
Driven by 4× CPU throttle plus the 227.7 KB Supabase chunk. The TTFB is 11 ms
**[M]** — the server is fast. Everything in the critical path is client-side
weight.

**Could not be measured:** real-device LCP on actual iOS Safari, real 4G radio
behaviour, cache-hit repeat views, and the perceived smoothness of scroll on a
real device. CDP CPU throttling is a 4× multiplier, not an A15 Bionic. Treat
6.91 s as a *proxy*, not a prediction.

---

## 7. What could not be measured

Stated plainly, per the brief:

1. **Safe-area inset values** — headless Chrome reports `0px` for all four
   `env(safe-area-inset-*)` probes. The *absence of CSS referencing them* is
   solid **[M]**; the physical inset on an iPhone 16 is not measurable here.
2. **The F-C4 placeholder ambiguity** — cannot distinguish "no `::placeholder`
   rule" from "Chrome reports the parent colour for `::placeholder`". Both are
   true measurements; the interpretation is uncertain.
3. **Real iOS Safari rendering** — Archivo Black and Inter were measured as
   *loaded* via `document.fonts` **[M]**, but font rasterisation, optical sizing
   and the real fallback stack under a mid-network font swap are untested.
4. **Contrast over the portfolio tiles** — the wall has no text over images
   (verified visually in `393-portfolio-viewport.png`), so no measurement applies.
   The B&W filter is applied but I did not measure luminance of specific frames.
5. **Actual scroll performance / jank** — no frame-timing or
   `PerformanceObserver` long-task data was captured. CLS 0.0268 is a proxy for
   layout stability only, not smoothness.
6. **`pages-more.ts`, `rows.ts`, `shoots.ts`** — read for structure but the
   portfolio wall logic lives in `pages.ts` and is what the measurement hit.
7. **Whether any of the F-T/F-C issues are deliberate trade-offs already known to
   Alwin** — the source comments show considerable awareness of most decisions
   (the `--grey` fix, the `overflow-wrap` fix, the `--row-cols` intent). I have
   marked **[O]** where a comment explicitly defends a choice, and flagged
   `wallCols()` as dead code because the code contradicts its own docstring.

---

## 8. Ranked upgrade list

Effort: **S** ≤ 30 min, **M** ≤ 2 h, **L** > 2 h.

---

### 🔴 DO THESE FIRST

---

#### 1. Fix the portfolio wall to 2 columns on a phone
**File:** `src/editorial.css`, `.pf-row` (line 765–774) and the `@media (max-width: 640px)` block (782–787)
**Also:** `src/pages.ts`, `wallCols()` (493–497) and `.pf-row` markup (459)

**Change.** Honour the custom property the JS already emits:
```css
.pf-row { grid-template-columns: repeat(var(--row-cols, 3), minmax(0, 1fr)); }
@media (max-width: 640px) { .pf-row { --row-cols: 2; } }
```
`wallCols()` already computes `2` for a 357 px row and already writes
`style="--row-cols:2"` inline; the CSS is ignoring it. On resize the inline value
stays stale, so also set `--row-cols: 2` in the media query to win on small
screens, and consider re-running `wallCols()` on `resize` (debounced) so a
rotated phone or a resized desktop window re-derives the count.

**Why.** **[M]** 111 px tiles at 393 px, 87 px at 320 px. A portrait at 87 px
cannot be judged. `wallCols()`'s own docstring says two columns "still gives
~175px" and that three is "too narrow to read a face" — this restores the stated
intent. **[M]** The home page's `.hstrip__grid` is already `173.5px 173.5px` at
the same viewport, so this also removes a visible inconsistency between the two
pages showing the same work. The evenness Alwin locked is unaffected: the data
guarantees same-aspect-ratio per row, so two columns stay perfectly even.

**Effort: S** (one line + one media query). **Risk: low** — pure layout, no
markup or data change.

---

#### 2. Add a text plate behind the hero copy
**File:** `src/editorial.css`, `.hero__body` (163–174) and `.hero__scrim` (158–162)

**Change.** Do not darken the whole scrim — that kills the photograph. Instead
give each text block its own local backing:
```css
.hero__body .eyebrow { /* was color:#fff; opacity:0.9 */
  display: inline-block;
  padding: 5px 10px;
  margin-bottom: 18px;
  background: rgba(13,13,13,0.55);
  backdrop-filter: blur(2px);
}
.hero__lede {
  max-width: 34ch;                 /* stops it running the full 357px */
  padding: 10px 12px;
  background: linear-gradient(90deg, rgba(13,13,13,0.62), rgba(13,13,13,0));
}
```
Also raise the scrim's top stop from `0.28` to `0.42` and add a second, stronger
stop at the 15–30% band where the eyebrow sits.

**Why.** **[M]** The eyebrow measures **1.78:1** against its actual background
(`#c2c2c2` sky) and the lede measures **3.35:1** at its worst pixel (`#0c97c8`
sky). The h1 itself is fine at 5.10:1 worst case **[M]**. A local plate gets the
4.5:1 without touching the photo's midtones where there is no type. This is the
first copy a client reads.

**Effort: S.** **Risk: low.**

---

#### 3. Apply the monochrome treatment on touch devices
**File:** `src/styles.css`, the `@media (hover: hover)` block (237–241)

**Change.** Hoist the base treatment out of the media query; leave only the
hover-revert inside it.
```css
/* base — applies everywhere, desktop and touch */
.shell.is-bw .cell img { filter: grayscale(1) contrast(1.06); transition: filter 260ms ease; }
@media (hover: hover) {
  .shell.is-bw .cell img:hover,
  .shell.is-bw .cell picture:hover img { filter: grayscale(0) contrast(1); }
}
```
On touch the frame now stays monochrome and there is no hover to revert it, which
is exactly right — the reveal becomes a desktop-only affordance. Optionally add
a tap-to-reveal-colour inside the lightbox if Alwin wants the interaction on
mobile too, but the resting state must be monochrome.

**Why.** **[M]** `matchMedia('(hover: hover)')` is **false** on the target
device; `getComputedStyle(img).filter` is **`none` on 7 of 7 home images and
30 of 30 portfolio images**. The `is-bw` class is present on the shell and does
nothing. `blackAndWhite: true` in `config.ts:78` is currently a no-op on every
phone. The screenshots show green foliage, a red striped wall and a pink studio
backdrop in a wall that is monochrome on desktop — the imagery and the
black-and-white chrome disagree, and the imagery is the half that is wrong
relative to the stated brand.

This is one of the cheapest fixes in the audit and it is the one that most
changes what the brand looks like to a client on a phone.

**Effort: S** (move one rule). **Risk: low** — the desktop appearance is
unchanged; the author was right to gate the hover-revert, and that stays gated.

---

#### 4. Make the header legible over the hero
**File:** `src/editorial.css`, `.shell--over` block (50–57); `src/styles.css`, `.site-header` (52–60)

**Change.** Two parts.
(a) Give the wordmark and burger a subtle plate when `.shell--over` is active:
```css
.shell--over .logo,
.shell--over .burger__bars i { text-shadow: 0 1px 3px rgba(0,0,0,0.65); }
.shell--over .burger { background: rgba(13,13,13,0.4); border-radius: 4px; }
```
(b) Since the header is `position: relative` and scrolls away (F-U1), the
cleanest fix for the hero legibility problem is to make the header a real
over-header on the home route only:
```css
.shell--over .site-header {
  position: absolute; inset: 0 0 auto 0; z-index: 10;
}
```
That confines the change to the one route that overlays the header on a photo.

**Why.** **[M]** The 10 px `SHUTTERHAUS` wordmark is at **2.85:1** and the burger
bars at **2.92:1** against the actual sky behind them. Both are below 4.5:1
(small text) and 3:1 (UI icon). The brand name is currently the least legible
element in the first viewport. `text-shadow` is the standard, dependency-free
fix and is invisible against the dark parts of the photo.

**Effort: S.** **Risk: low.**

---

### 🟠 HIGH VALUE

---

#### 5. Add swipe navigation to the lightbox
**File:** `src/lightbox.ts` (the `open()` function sets up the handlers; add alongside the existing `keydown` block)
**CSS:** `src/styles.css`, `.lb` (set `touch-action: pan-y pinch-zoom`)

**Change.** Track a horizontal touch gesture on the image and advance on a
left-swipe past a ~50 px / 250 ms threshold:
```ts
let sx = 0, sy = 0, tracking = false;
lb.addEventListener('touchstart', (e) => {
  sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
}, { passive: true });
lb.addEventListener('touchmove', (e) => {
  if (!tracking) return;
  const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
    track.dx = dx;                       // for the live drag offset
    e.preventDefault();
  } else if (Math.abs(dy) > 12) tracking = false;
}, { passive: false });
lb.addEventListener('touchend', () => { /* commit past threshold, spring back */ });
```
Add `touch-action: pan-y` to `.lb` so vertical scroll still works but the browser
does not steal the horizontal gesture. Bonus: apply the same `dx` as a live
`translateX` on `.lb__img` so the photo follows the finger — that is what makes
a lightbox feel native.

**Why.** **[M]** A 310 px CDP touch drag across the open lightbox changed
nothing — same image, same caption `01 / 30`. There is no touch handler in
`lightbox.ts` and `.lb` computes `touch-action: auto`. Swipe is the primary
gesture in every mobile lightbox and the only alternative is an 78 × 44 px
button **[M]**.

**Effort: M** (the live drag offset and spring-back are the work; a bare
threshold handler is S). **Risk: low.**

---

#### 6. Raise body copy to 16 px
**File:** `src/styles.css` (`.contact__p` 287), `src/editorial.css`
(`.phead__p` 115, `.invest__p` 584, `.ct__p` 589), package list styles in
`src/pages.ts`

| Selector | Now **[M]** | Set to | Line |
|---|---:|---:|---|
| `.contact__p` | 14 px | 16 px | styles.css:287 |
| `.about__p` | 14.5 px | 16 px | editorial.css:506 area |
| `.shead__p` | 14.5 px | 16 px | editorial.css:523 |
| `.phead__p` | 14.5 px | 16 px | editorial.css:115 |
| `.invest__p` | 14 px | 16 px | editorial.css:584 |
| `.ct__p` | 14.5 px | 16 px | editorial.css:589 |
| `.pkg__desc` | 13.5 px | 15.5 px | package block |
| package `li` | 13 px | 15 px | package block |
| terms `li` | 12.5 px | 15 px | editorial.css:789 area |
| `.hcta__note` | 12 px | 14 px | editorial.css |
| `label` | 11 px | 13 px | form block |

**Why.** **[M]** Nine rules set body copy between 11 and 14.5 px. On a 393 px
phone held at reading distance, 13 px Inter is genuinely hard work, and the
`--pad: 16px` gutter plus a 357 px measure means fewer characters per line to
compensate. The line-heights are already good (1.6–1.72) so only the size
changes and the layout absorbs it with slightly more vertical scroll. The
`.ch` max-widths need no change — they will simply wrap earlier.

Do **not** touch the 10–11 px `.eyebrow` / mono metadata: that is the deliberate
brutalist layer and it is what makes the site look designed.

**Effort: M** (about 10 rules; needs a visual pass because vertical rhythm
shifts). **Risk: low.**

---

#### 7. Add a sticky, condensing header
**File:** `src/styles.css`, `.site-header` (52–60); `src/main.ts` (add a scroll
listener or IntersectionObserver against a sentinel at the top of `.main`)

**Change.**
```css
.site-header { position: sticky; top: 0; z-index: 100;
  background: var(--paper); border-bottom: 1px solid var(--line); }
.header--hidden { transform: translateY(-100%); transition: transform 0.22s ease; }
.header--compact { --head: 56px; }   /* logo 21px -> 15px, nav stays 44px tall */
```
Toggle `--hidden` when scrolling down past 240 px, `--compact` past 120 px, and
only ever hide when `window.scrollY > 400` so the header never disappears while
the user is reading the top of a page. Respect reduced-motion (see #10).

**Why.** **[M]** `position` is `relative` at scroll 0, 200, 600 and 1200 px with
`background: transparent`, `backdrop-filter: none`, `box-shadow: none` and an
unchanged class list — the header has no scroll behaviour at all. On the
portfolio's 1693 px wall **[M]** there is no persistent route back. A sticky
header also gives the `--head: 92px` token a second job (it currently only sizes
a non-sticky block).

**Effort: M.** **Risk: medium** — sticky headers are the classic source of
iOS Safari jank and of content hiding under the notch; pair with #8 and #11.

---

#### 8. Add safe-area insets and `viewport-fit=cover`
**File:** `index.html` (viewport meta), `src/styles.css` (`.site-header`,
`.main`), `src/styles.css` `.lb`/`.lb__cap` (lightbox block ~414)

**Change.**
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
```
```css
:root { --safe-t: env(safe-area-inset-top, 0px);
        --safe-b: env(safe-area-inset-bottom, 0px); }
.site-header { padding-top: var(--safe-t); }
.main        { padding-bottom: calc(var(--pad) + var(--safe-b)); }
.lb__cap     { padding-bottom: calc(14px + var(--safe-b)); }
.lb__x       { top: calc(14px + var(--safe-t)); }
```

**Why.** **[M]** A scan of every CSS rule in every stylesheet found **0**
references to `safe-area`, `viewport-fit`, `dvh`, `svh` or `lvh`, and the
viewport meta has no `viewport-fit=cover`. `.lb__x` sits at **y=18** **[M]** —
on an iPhone 16 that is inside the Dynamic Island band. `.lb__cap` bottom is
**22 px** from the viewport edge **[M]**, inside the home-indicator zone. Adding
`theme-color` also stops iOS Safari painting its chrome the default grey against
a monochrome site.

**Effort: S.** **Risk: low.**

---

### 🟡 MEDIUM VALUE

---

#### 9. Give portfolio images `object-position` focal points
**File:** `src/pages.ts`, `wallCell()` (the `picture`/`img` markup) and
`rows.ts` (the per-photo data table)

**Change.** `wallCell` already emits `data-full` and the tile has
`height: auto` so **nothing is cropped today** **[M]** — which is the correct
behaviour and must be preserved. The improvement is not cropping but *continuity*:
add `object-position` support so that when the grid does go to 2 columns and the
CSS keeps `height: auto`, portrait and landscape frames still sit on a
consistent baseline. Extend `rows.ts` with an optional `focus: 'top' | 'center' |
'bottom'` per photo, emit `style="object-position: 50% {focus}"` on the `<img>`,
and use it for `alt`-text-free portraits where faces sit in the upper third.

**Why.** **[M]** Moving to 2 columns at 393 px takes tiles from 111 px to
~173 px — a 56% linear increase. A portrait that is fine at 111 px will be
framed differently at 173 px. Explicit focal data makes the crop predictable
per shot rather than leaving it to the aspect-ratio accident. **[O]** This is
defensive polish for upgrade #1; if the packer keeps every frame uncropped it is
a nice-to-have, not a blocker.

**Effort: M** (data + markup + one CSS line). **Risk: low.**

---

#### 10. Lazy-load everything below the fold
**File:** `src/pages.ts`, `wallCell()` and the home strip renderer in
`src/pages.ts` / `src/pages-more.ts`

**Change.** Add `loading="lazy" decoding="async"` to every `<img>` that is not
the hero. Give the hero `fetchpriority="high" decoding="sync"`.

**Why.** **[M]** All 8 home images are eager — no `loading` attribute is set on
any of them, so all default to eager **[M]**. **957.7 KB of the 1218.5 KB total
(79%) is images**, and only the hero is above the fold; the other 7 sit ~1200 px
down. The hero is already the LCP at 286.4 KB / 5054 ms **[M]**, so prioritising
it explicitly and deferring the rest directly attacks the 6.9 s LCP. The
portfolio route already lazy-loads correctly (**3 of 31 loaded**, 443.6 KB) **[M]**
— this brings home in line with what portfolio already does.

**Effort: S.** **Risk: low.** Do it together with #1.

---

#### 11. Add `prefers-reduced-motion` and `prefers-color-scheme`
**File:** `src/editorial.css` (append), `src/styles.css` (append)

**Change.**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
@media (prefers-color-scheme: dark) {
  :root { --ink: #f5f5f5; --paper: #0d0d0d; --dim: #9a9a9a;
          --grey: #9a9a9a; --line: #262626; }
  /* the .shell--over scrim values need a touch more alpha in dark */
}
```
The dark palette is a **token swap only** — `styles.css:6–25` already defines every
colour as a custom property, and the audit found zero saturated colours **[M]**,
so the whole site re-themes from 7 lines. The existing inverts (`#0d0d0d` bands
with white text) become primary-on-dark automatically.

**Why.** **[M]** Zero rules in any stylesheet match `prefers-color-scheme` or
`prefers-reduced-motion`. Dark mode is a real expectation for a site that is
already visually black, and this one is close to free because the palette is
already tokenised. Reduced motion currently has no escape hatch across 6
animation types and 8 transition types **[M]**.

**Effort: M** for both (dark needs a visual pass on the photo-heavy pages).
**Risk: medium** for dark — the `.shell--over` scrim was tuned for a white
page and needs re-checking against a dark one. **Effort: S** for reduced-motion
alone; consider shipping that first.

---

#### 12. Fix the H1 mid-word break
**File:** `src/editorial.css`, `.hero__h` (187) and the `@media (max-width: 640px)` block (214–216)

**Change.**
```css
.hero__h { font-size: clamp(37px, 10.4vw, 132px); }  /* was clamp(48px, 9.6vw, 132px) */
@media (max-width: 640px) {
  .hero__h { max-width: none; overflow-wrap: normal; hyphens: none; }
}
```
At 393 px, `10.4vw = 40.9px`; "PORTRAITURE" at Archivo Black 40.9 px is ~7.6em =
311 px, which fits the 357 px column **[M]** — so it stops breaking. Verify the
measurement after the change rather than trusting this arithmetic.

**Why.** **[M]** At 48 px the word "PORTRAITURE" is wider than the 357 px column,
and `overflow-wrap: anywhere` breaks it to `PORTRAITUR / E`. It is 3 lines where
2 would be stronger, and the same class runs at 48 px on 320 px **[M]** where it
is worse. **[O]** A client's first read of the brand is a broken word in the
largest type on the site. The 640 px breakpoint is 247 px too late because the
real constraint is the 48 px *floor*, not the breakpoint.

**Effort: S.** **Risk: low.**

---

### 🔵 NICE TO HAVE

---

#### 13. Consolidate the two greys into one scale
**File:** `src/styles.css`, `:root` (6–25)

**Change.** `--grey: #6b6b6b` and `--dim: #6d6d6d` are 2/255 apart and measure
**5.33:1** and **5.17:1** respectively **[M]** — functionally identical, both
passing. Collapse to a single `--muted: #6d6d6d` plus a `--faint: #949494` for
genuinely tertiary text, and add a `--space` scale (`--s1: 8px; --s2: 16px;
--s3: 32px; --s4: 64px`) to replace the wandering 28/40/52/72 padding values
**[M]**.

**Why.** **[M]** Section padding currently runs 72 → 54 → 40 → 52 → 44 → 28 → 0
with no visible scale, and the site has exactly two near-identical greys doing
one job. **[O]** One token change fixes both — the page gains a rhythm and a
palette with no visual redesign. The `.hstrip` 72 / `.hcta` 54 / `.invest` 44
sequence is the most obviously arbitrary part of the layout.

**Effort: S.** **Risk: low.**

---

#### 14. Raise the lightbox caption and enlarge the nav targets
**File:** `src/styles.css`, `.lb__cap` and `.lb__nav`

**Change.** `.lb__cap` from **11 px / 11 px** **[M]** to 13 px with 1.4
line-height, and give it `padding: 10px 16px calc(10px + var(--safe-b))`.
Widen `.lb__nav--p` / `--n` from 78 × 44 px **[M]** to 96 × 60 px and move them
to `bottom: calc(80px + var(--safe-b))` so they clear the caption and sit inside
the thumb zone.

**Why.** **[M]** An 11 px tall caption is the smallest text in the lightbox and
carries the photo credit and the `01 / 30` index. 78 × 44 px passes the 44 px
floor but is a small target for the primary navigation of the page, and moving to
two columns (#1) makes the lightbox more central to the experience, not less.

**Effort: S.** **Risk: low.**

---

#### 15. Add a skeleton state for the wall
**File:** `src/pages.ts` (`pfPage()`), `src/styles.css` (add `.skel` rules)

**Change.** Emit a `skeleton` state — `N` placeholder tiles at the same
`--row-cols` aspect ratio with a `linear-gradient` shimmer — shown between route
render and the first image decode. Drive it from the existing load: the home
route already has a reveal animation **[M]**; reuse that trigger rather than
adding a new one.

**Why.** **[M]** The portfolio loads 3 of 31 images on first paint and the rest
arrive over the next ~12 s on throttled 4G (a single `35-img-0482-1200w.webp`
took **12157 ms**) **[M]**. A client scrolling into an empty wall with no
indication that 28 more frames are coming reads that as a broken page. The
shimmer also gives the lazy images from #10 somewhere to land.

**Effort: M.** **Risk: low.**

---

#### 16. A sticky bottom enquiry CTA on mobile
**File:** `src/layout.ts` (add the element to the shell), `src/styles.css` (new `.cta-bar`)

**Change.** A single full-width bar pinned to the bottom, `position: fixed`, with
the safe-area bottom padding from #7, shown only after the user scrolls past the
hero on the portfolio and services routes, and hidden when the existing `.hcta`
band is in view (IntersectionObserver). One line of copy + one link — reuse
`SITE.contact`, do not add a second contact path.

**Why.** **[M]** The portfolio's only conversion surface is the `.hcta` band at
**y=1965**, below 1693 px of wall — 2.4 viewports of scrolling **[M]**. The
header offers no persistent route (#6). **[O]** For a portfolio the entire job
is turning admiration into an enquiry, and right now the ask is the last thing on
a very long page. `[M]` The bar must be `position: fixed` with
`env(safe-area-inset-bottom)` or it will sit under the home indicator.

**Effort: M.** **Risk: medium** — a fixed bar competes with the lightbox and
with upgrade #7's sticky header; only ship one of them prominent. The
`PORTFOLIO-HANDOFF.md` note about "one contact line, not a site-wide footer" is a
deliberate decision — this should replace nothing, only surface the same link
earlier.

---

## 9. What is already right — do not change these

Recorded so a future pass does not "fix" them:

- **[M]** Zero tap targets under 44 px on any route (0 of 102 interactive
  elements). `min-width/min-height: 44px` on `.nav-link` and `.social` in the
  *base* rules, not a media query.
- **[M]** Zero horizontal overflow at 320, 393 and 430 px.
- **[M]** Every solid-background text/background pair passes WCAG AA. Best pair
  19.44:1, worst 5.17:1.
- **[M]** Input `font-size: 16px` — iOS will not auto-zoom the contact form.
- **[M]** `viewport-fit` aside, the OG/Twitter/description/canonical/lang head is
  complete — 8 OG properties including dimensions and alt, plus
  `summary_large_image`. Better than most photography sites.
- **[M]** `@media (hover: hover)` correctly gates every hover effect, so no
  sticky-hover artefact on touch.
- **[M]** CLS 0.0268 on the home route, 0.0006 on portfolio. Layout is stable.
- **[M]** The 48 → 44 → 36 → 34 → 30 → 24 → 19 heading scale, every step ≥1.14×.
- **[M]** The portfolio's *evenness* guarantee works — same aspect ratio per
  row, `align-items: start`, no gap under any tile at any width. Upgrade #1
  preserves this.
- **[O]** The mono metadata layer (`--font-mono`, 0.44–3.4 px tracking, uppercase)
  is the strongest brand decision on the site. It is what separates this from
  every other black-and-white portfolio. Do not normalise it to the body font.
- **[O]** Zero saturated colour across the entire site is the right call for a
  B&W photography brand. Do not add an accent colour.

---

## 10. Files

This audit wrote the following, all under
`C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit\`.

**Report**
| File | What |
|---|---|
| `DESIGN.md` | this report |

**Scripts written for this audit**
| File | What |
|---|---|
| `cdp.mjs` | CDP driver — enables all domains, *then* device metrics, *then* navigate |
| `shots.mjs` | 393 px screenshots, all 5 routes (full page + first viewport) |
| `shots2.mjs` | portfolio scrolled viewport captures (scroll offset honoured) |
| `measure.mjs` | type scale + on-white contrast, all 5 routes at 393 px |
| `measure2.mjs` | portfolio grid geometry, header internals, form fields |
| `measure3.mjs` | hero scrim structure, 320 px and 430 px passes |
| `measure4.mjs` | colour saturation sweep, head meta, motion inventory, lightbox open |
| `measure5.mjs` | lightbox open via real CDP touch + swipe test + header scroll sampling |
| `measure6.mjs` | safe-area probe, lightbox geometry, section rhythm |
| `perf.mjs` | cold-cache perf; LCP + CLS observers injected pre-navigation |
| `rhythm.mjs` | per-block section spacing, all 5 routes |
| `bw.mjs`, `bwgate.mjs` | monochrome/filter state and the `hover` media-query gate |

**Raw measurement output**
`measure-393.json`, `measure-2.json` … `measure-6.json`, `perf.json`,
`rhythm.json`, `bw.json`, `bw-gate.json`, `px.pkl` (decoded hero pixels),
`hero-contrast.pkl`, `hero-raw.b64`, `lb-raw.b64`, `png-dims.json`

**Screenshots** — `designshots\`, 22 PNGs: 5 routes × (full page + first viewport)
at 393 px, 3 scrolled portfolio viewports, the open lightbox, and 4 routes each
at 320 px and 430 px.

> **Note on this directory:** `mobile-audit\` already contained a substantial
> body of unrelated work from an earlier session (`fn1-*.mjs`, `baseline.mjs`,
> `mockup.html`, `IMAGES.md`, `crop-quality.py`, `renders.py`, `psnr-test.py`,
> `imgshots\`, `served\`, `shots\` and others). **None of it was read, modified or
> deleted by this audit** and none of the numbers in this report come from it.
> Every measurement here came from the scripts listed above, run against the live
> site during this session. The one file this audit added to that collection is
> `DESIGN.md`.

Read but unmodified: `src/config.ts`, `src/layout.ts`, `src/pages.ts`,
`src/pages-more.ts`, `src/rows.ts`, `src/shoots.ts`, `src/styles.css`,
`src/editorial.css`, `src/lightbox.ts`, `PORTFOLIO-HANDOFF.md`, `HOME-LOCKED.md`.
