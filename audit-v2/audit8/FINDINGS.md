# audit8 — pixel-level layout audit, all routes × 10 widths

**Measured against the LIVE site** `https://shutterhausvisuals.co.za`, asset
`main-CH4C1nxd.css` (md5 `f7d078fa8cb0af52a09622d7501ceb42`), because the local
`dist/` was being rebuilt during the audit run.

Matrix: `/` `/portfolio` `/about` `/services` `/contact` × 320, 360, 393, 430, 600,
768, 1024, 1280, 1440, 1920 — 50 route/width pairs, all measured, none skipped.

**No files were edited.** Probes live in the Hermes scratch dir, screenshots here.

---

## P1 — visible on a phone, in front of a client

### 1. /services — the four package prices and CTAs do not line up
`/services` @393, card-internal tops measured relative to each card box:

| element | 01 Starter | 02 Essential | 03 Signature | 04 Social | spread |
|---|---|---|---|---|---|
| `.pkg__desc` height | **23.23** (1 line) | 46.47 | 46.47 | 46.47 | — |
| `.pkg__list` height | 140 (5 items) | 112 (4) | 112 (4) | 140 (5) | — |
| `.pkg__price` top | 547.78 | 541.02 | 519.78 | **571.02** | **51.24** |
| `.cta` top | 592.78 | 586.02 | 564.78 | **616.02** | **51.24** |

At 768 (2×2) it is worse *within* a row:

| row | price tops | CTA tops |
|---|---|---|
| row 1 | 529.78 / 523.02 (6.76 apart) | 596.02 / 568.02 (**28 apart**) |
| row 2 | 525.02 / **553.02** (**28 apart**) | 598.02 / 598.02 (aligned) |

At 1440 (4 across): price tops 518.45 / 511.69 / 513.69 / **541.69** — **30px spread**.
CTA tops 586.69 / **558.69** / 586.69 / 586.69 — the popular card's button is **28px high**.

**Why it matters:** the price is the only reason the page exists. Four cards whose
prices are visibly on three different lines and whose buttons are on two reads as
unbuilt, and the R1,500 card is the one that floats.

**Why:** `.pkgrow` is `align-items: normal` (stretch), so all four cards are the same
box height (630.69 at 1440), but nothing inside is bottom-anchored. Card 1's desc is
one line, card 3's list is 4 items and card 4's is 5, so the leftover space lands in a
different place in every card. The equal card heights are masking it — only the
*content* is ragged, and that is the part you see.

**Minimal fix (inside `.pkg` only, cannot leak to another page):**
`.pkg` is already `display:flex; flex-direction:column`. Add `margin-top:auto` to
`.pkg__price`, and move `padding-bottom:28px` from `.pkg--pop` onto `.pkg` so the
popular card's CTA drops to the same baseline as the other three.

### 2. /services — the MOST POPULAR card is inset 24px, so it is off the flush-left grid
@393, inner element offset from its own card's left edge:

| card | `.pkg__num` L | `.pkg__name` L | `.pkg__price` L | `.pkg__desc` L |
|---|---|---|---|---|
| 01 Starter | 0 | 0 | **0** | 0 |
| 02 Essential (dark) | **24** | **24** | **24** | **24** |
| 03 Signature | 0 | 0 | **0** | 0 |
| 04 Social | 0 | 0 | **0** | 0 |

Authored as `.pkg--pop .pkg__fig { margin-left:-24px; margin-right:-24px }` — the
negative margin is applied to the figure only, so the figure is full-bleed inside the
card but every line of text steps 24px right of where the other three cards' text sits.

**Why it matters:** flush-left is the spine of this design. The card the site is asking
people to buy is the only thing on the page that is not flush-left, and its price does
not share a left edge with the other three prices.

**Minimal fix:** either drop the `-24px` figure bleed so the popular card is flush like
the rest, or — better for the brand — keep the bleed but make the bleed *structural*
(full-bleed background) rather than a margin on the figure, so the text stays at L=0.

### 3. /services — the tier numbers are not on a shared line
@1440 and @768: `.pkg__num` top is **241.33** on cards 01/03/04 and **239.33** on card
02 — the dark card's "02." sits **2px above** 01, 03 and 04. Same 2px carries into
`.pkg__name` (265.33 vs 263.33). The 20px of margin above `.pkg__num` on the popular
card vs 22px on the others. Two pixels, but it is the first thing the eye compares
when scanning four cards left to right. Fixing #1's `margin-top:auto` does not fix this
one — it needs the 20 vs 22 reconciled.

---

## P2 — costs money (worse than every pixel above)

### 4. /services and /about have no closing CTA and no contact bar
Closing band + `email / phone / Instagram` bar, by route:

| route | closing CTA band | `mailto:` | `tel:` | Instagram links |
|---|---|---|---|---|
| `/` | `.hcta` ✅ | 1 | 1 | 2 |
| `/portfolio` | `.hcta` ✅ | 1 | 1 | 2 |
| `/about` | **none** | **0** | **0** | 1 (header only) |
| `/services` | **none** (`.invest` is a text band, not a CTA) | **0** | **0** | 1 (header only) |
| `/contact` | n/a | 1 | 1 | 1 |

There is no `<footer>` element on any route. On `/` and `/portfolio` the closing block
is `section.hcta` containing `.hcta__foot`. On `/about` and `/services` nothing.

**This is the finding that would actually cost him money.** `/services` is the page that
ranks and the page that converts. The client scrolls past four "Book now" buttons, past
the ADD-ONS table, and the last thing on the page is **BOOKING TERMS** — a five-line
legal list — followed by ~80px of white. The black "LET'S CREATE SOMETHING TOGETHER"
band that closes the two other pages is simply absent. A visitor who arrived from a
Google search for "photographer Gauteng prices" has no closing prompt, no email and no
phone number anywhere on the page; the only routes out are the four card buttons and the
header's Instagram/WhatsApp icons.

**Minimal fix:** the block already exists and is already verified on two routes. Add
`section.hcta` to `/services` and `/about` after their last section. Copy, not invent —
zero new design risk, and it is the highest-value change in this document.

### 5. /contact leaves 57% of a desktop screen empty
`section.page.contact` width by viewport:

| viewport | content width | dead space on the right |
|---|---|---|
| 1024 | 820 | 278px (27%) |
| 1280 | 820 | 534px (42%) |
| 1440 | 820 | **594px (41%)** |
| 1920 | 820 | **1074px (56%)** |

The form, the lede, the contact list and the hours note are all one 820px flush-left
column. On a 1440 or 1920 monitor the right half of the screen is empty from the header
to the last line of text — the screenshot reads as a page that stopped loading.
`/about` at the same widths fills its width, so the two short pages disagree about what
"done" looks like.

Vertical rhythm on the same page: 19px from the textarea to the SEND MESSAGE button,
then **62px** from that button to the contact list. The form's own two halves are
separated by more space than any of its four fields.

**Minimal fix (low risk, real payoff):** at ≥1024 make `.contact__col` two columns —
form left, the location/email/phone/WhatsApp/hours list right. Everything already
exists in the DOM; it only needs the grid track. Do **not** centre it.

---

## P3 — inconsistency, all cheap, all real

### 6. The eyebrow renders two different ways
Same class, two implementations. Computed at 393:

| route | font-size | family | weight | letter-spacing |
|---|---|---|---|---|
| `/` (dark hero) | **11px** | `ui-monospace` | 400 | **0.14em** |
| `/portfolio` `/about` `/services` `/contact` | **10.5px** | `Inter` | **500** | **0.19em** |

`editorial.css` has **three separate `.eyebrow` rules** (base + two dark-background
overrides, with three different `margin-bottom`: 22px / 18px / 20px). The dark variant
is the *louder* one — bigger, monospaced, wider. The quiet default is the light one.
For a design language whose metadata layer is defined as "a tracked-out uppercase mono
layer", the default should be the mono one and the dark override should only change
colour.

### 7. The CTA is three different sizes
| selector | where | size @393 |
|---|---|---|
| `.cta` | home hero "View portfolio", about "Let's create together" | 12px |
| `.cta.cta--sm` | **all four** /services "Book now" | **10.5px** |
| `.hcta__btn` | home "View packages →" | 11px |

Same interaction, three type sizes, 1.5px between the extremes. The four "Book now"
buttons — the money buttons — are the smallest of the three.

### 8. Three different section-break values for the same gesture
Gap before a full-bleed dark band, constant at all 10 widths:

| route | gap |
|---|---|
| `/` `.hstrip → .hcta` | **88px** |
| `/portfolio` `.pf-rows → .hcta` | **88px** (88.01 / 87.99 sub-pixel) |
| `/services` `.pkgrow → .invest` | **76px** |
| `/about` `.about__body → .about__fig` | **44px** |

88 and 76 are the same gesture 12px apart. The spacing scale in play is 28 / 44 / 76 /
88, which is not a system.

### 9. /contact — the quietest information is the loudest type
`p.contact__hours.dim` ("Evenings & weekends, by appointment") is **16px**. The body
copy above it is 14px and the form's own `.cform__note` is 12px. The final aside on the
conversion page is larger than the body it follows and 4px larger than the note beside
it. Every other metadata line on the site is 10–11px.

### 10. /contact — the SEND MESSAGE label is 13.5px
A fractional one-off, and smaller than the 14px body it sits under. It is the primary
action of the primary conversion page.

---

## P4 — type scale integrity

### 11. Five different h1 sizes at 393px, none a clean step
| route | h1 @393 | h1 @1440 |
|---|---|---|
| `/portfolio` | **44px** | 72px |
| `/` (hero) | **37.728px** | 132px |
| `/services` | 36px | 62px |
| `/about` | 34px | 58px |
| `/contact` | 30px | 40px |

Two problems. (a) The homepage hero is **smaller** than a secondary page's h1 at mobile
widths — the hierarchy inverts exactly where a phone visitor sees it. (b)
**37.728px is a fractional computed size**, the landing point of a fluid `clamp()`. For
Archivo Black — a very tight, near-zero-side-bearing face — a fractional px on a
display size is a real smell, and it means the hero h1 never lands on the same pixel
grid as anything else.

### 12. /services uses nine distinct font sizes at 393px
`10 / 10.5 / 11 / 14 / 14.5 / 19 / 20 / 24 / 36`

The `10 / 10.5 / 11` triple is the tell: `10px` is `.pkg__flag`, `10.5px` is
`.eyebrow` + `.pkg__spec` + `.cta--sm`, `11px` is `.pkg__num`. Three consecutive
half-steps. The `14 / 14.5` pair is the same break.

### 13. Body copy is 14px on two routes, 14.5px on two others
| route | body |
|---|---|
| `/` `.hero__lede` | 14px |
| `/contact` `.contact__p` | 14px |
| `/about` `.about__p` | **14.5px** |
| `/services` `.shead__p` | **14.5px** |

One of these is a one-off. It is the single easiest type fix on the site and also the
one with the widest blast radius — see the risk section.

### 14. Form labels are 11px Inter, not the mono layer
`.cform label` computes to 11px **Inter**. The brief names "a tracked-out uppercase mono
layer" for metadata, and the eyebrow, `.pkg__spec` and the add-on prices all use it —
but the form labels, which are exactly the same kind of metadata, do not. Same size,
same case, same tracking, different family.

---

## P5 — imagery

### 15. /services @393 — four thumbnails, 2.7× height spread
`figure.pkg__fig` heights in the single-column stack: **466.25 / 466.25 / 248.66 /
663.11**. Whole-card heights **854.38 / 875.61 / 608.78 / 1074.47**.

At ≥768 they are all cropped to a uniform **219.33px** (verified identical on all four
cards at 768, 1024, 1280, 1440). So the desktop comparison view is fine and the phone
view is ragged. The brief sanctions cropping the package-card thumbnails — so capping
them to one aspect on mobile is *compliant*, not a deviation, and it turns the worst
rhythm problem on the site into a one-line change.

### 16. /portfolio @320 — 18 wall thumbs upscaled 1.097×
`figure.cell` renders at **147px** from a **134px** natural, on all 18 frames, at 320px
only. Soft on 320-class Android. Not present at 360+. The srcset is one candidate short
at that width.

### 17. Home hero crop swings from 1:2 to 2:1 across the range
`27-img-0297-1600w.webp`, natural ratio 1.286, `object-fit:cover`:

| viewport | rendered ratio | approx. share of image width discarded |
|---|---|---|
| 320 | 0.494 | ~62% |
| 393 | 0.606 | ~53% |
| 768 | 1.094 | ~15% |
| 1440 | 2.051 | 0% (letterbox) |

Sanctioned for the hero, and at mobile it happens to land on the face. Flagged only
because a 1:2 slice is a big ask — one eyeball on a real 393px phone is worth it.

### 18. Wall bottom is ragged, and the gap changes
| viewport | col1 bottom | col2 bottom | ragged by | gap |
|---|---|---|---|---|
| 393 | 1494.16 | 1510.33 | **16.17px** | **6px** |
| 1440 | 3529.20 | 3589.78 | **60.58px** | **14px** |

Two different gaps for one wall, and a 60px step in the bottom edge of the flagship
homepage masonry at 1440.

---

## Micro — real, invisible, ignore these

19. `.invest → .sterms` gap is `0.01` or `−0.01` at 393/430/1024/1920; `88.01`/`87.99`
    on /portfolio. Sub-pixel seams under a dark band. Invisible in practice.
20. `/services` @768 2×2: row 1 cards 640.02, row 2 cards 642.02 — a 2px step between
    rows. Auto-sized grid rows; harmless.
21. Wall columns are **183.5px** at 393 — half-pixel columns, because (393−20−6)/2 =
    183.5. Unavoidable with an odd container and a 1px-scale gap. The 0.5px resample
    costs nothing. **Do not fix.**
22. Nav hrefs are `./portfolio.html` (extension form). Correct on GitHub Pages' SPA
    rewrite; verify it holds on whatever host he actually deploys to.
23. `tel:+277****8363` in the built DOM. Check that is a redaction in this environment
    and not literally in the shipped href — if it is, the phone link is dead sitewide.

---

# What is already excellent — do not touch it

- **The gutter grid is flawless.** Every top-level block on all 5 routes at all 10 widths
  returns identical insets — 10/10 at ≤430, 26/26 at ≥600. Not one outlier, not one
  route. Level-2 blocks too: `hero`, `hcta` and `invest` are full-bleed and re-enter at
  exactly the gutter, so there is never a double-gutter. Full-bleed-with-matching-padding
  is the single easiest thing to get wrong and it is correct everywhere.
- **The closing-CTA gap is constant to within 0.01px** across all 10 widths on both
  routes that have it. The rhythm is *stable*, just not shared with /services.
- **The card breakpoints are clean.** 1-across → 2×2 → 4-across with no layout break at
  600, 768 or 1024 on any route. No orphaned column, no stretched track.
- **The form is beautifully regular.** Four label blocks at an exact **80px pitch**
  (313.67 / 393.67 / 473.67 / 553.67), every field 820px, every field inset 10/10. Only
  the textarea is taller, correctly, because it should be.
- **The add-on table is perfect** — labels left, prices right-aligned to one shared
  edge, hairline rules consistent on all seven rows including the last.
- **Type never goes below 10px**, and everything under 14px *is* the mono metadata
  layer — with exactly the two exceptions in P4 (#9, #10).
- **The discipline holds.** No colour, no radii, no shadows, no gradients. The only
  `border-radius` in the entire layout is the browser's own textarea resize handle and
  the select. Six routes' worth of redesign pressure has not introduced a single
  rounded box. That restraint is the product.
- The `h2` in the CTA band is byte-identical on `/` and `/portfolio` at both 393 and
  1440 (48px / 118px) — proof the component is genuinely shared, which is what makes
  finding #4 a copy rather than a design job.

---

# The judgement: worth the risk tomorrow, or wait

He launches tomorrow. A regression costs real money. Ranked by
**embarrassment ÷ risk**:

### Do tonight — high value, contained, cannot break anything else
- **#4 the missing closing CTA on /services and /about.** By far the highest value in
  this document and the lowest risk: the block exists, is verified on two routes, and
  you copy it. It is the difference between a pricing page that asks for the sale and
  one that ends in a legal list. Touch this first.
- **#1 + #2 + #3 the package card alignment.** Three declarations, all inside `.pkg`,
  which exists on no other page. It cannot leak. It is also the most visible thing on
  the most embarrassing page, and it is the kind of thing a paying client notices in
  four seconds without being able to say why. Highest embarrassment-per-risk on the list.
- **#9 the 16px hours note.** One value, one selector, restores it to the 10–11px
  metadata layer everything else obeys.

### Do not touch tomorrow
- **#6, #7, #12, #13 — every type-scale fix.** These are all *correct* findings and all
  of them are the same class of risk: they change how text renders on every page at
  once, the day before launch, with no time to re-shoot. A type regression is the one
  failure mode that is visible on all five routes simultaneously. If he does any of
  them, do exactly one per page, re-shoot that page at 393 and 1440, and stop.
- **#5 the /contact dead right half.** It is the most *satisfying* fix in this document
  and the wrong one to make tonight. It is a layout change to the one page that
  converts, it needs the DOM restacked, and it deserves a look on a real monitor
  rather than a screenshot. It is a v1.1 change.
- **#15 the mobile thumbnail crop.** Also correct, also sanctioned by the brief, also
  not tonight. It changes the height of four cards on the pricing page, which changes
  the page from 4073px to something else, which you want to see scrolled.

### Never "fix" these
- **#21 the half-pixel wall columns** — mathematically unavoidable, costs nothing.
- **#19 the 0.01px seams** — sub-pixel, invisible, chasing them is how you introduce a
  real seam.
- **The gutter grid** — it is correct. Every instinct will be to touch it. Don't.
- **#17 the hero crop** — it is the best thing on the site.

### One thing to check before he ships
The local `dist/` I saw mid-rebuild had `.pkg` figure heights of **411 / 411 / 219 /
585px** at 1440 — unequal by 2.7×, on the same four cards. Live does not have this;
all four are 219.33px. If that is an in-flight change rather than an artefact of a
half-written build, it is about to reintroduce finding #15 on the **desktop** pricing
page, which is currently correct. Worth confirming before the deploy.
