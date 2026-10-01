# HOME PAGE — LOCKED

**Alwin, 2026-09-30:** "OK PERFECT LETS LOCK IN OUR HOME PAGE AS THIS WE DONT
MAKE MORE CHANGES HERE AT ALL FROM THIS POINT"

No further changes to the home route from here (**one exception, below: it was
reopened and re-locked on 2026-10-01**). This file is the reference for what
"locked" means, so a future session can tell whether something drifted.

## REOPENED AND RE-LOCKED — 2026-10-01 (read this first)

**Alwin reopened the home route once** to apply three upgrades he had seen as
before/after mockups, then asked for the work to be documented so other agents
know what happened and why. The home page is **locked again** as of this
change. Rollback point for the upgrade: `43c1360` (the last commit before it).

### What changed (and what did not)

| Area | Before | After | Why |
|---|---|---|---|
| Hero heading | up to 86px, lede touching it | up to **132px**, tracking -0.035em, leading 0.88, 34px gap before the lede | Too polite for a brutalist site; the lede sat flush under "PORTRAITURE" |
| Hero eyebrow | 10.5px Inter | 11px **monospace** (`--font-mono`), wider tracking | Metadata should read like a spec sheet next to the display type |
| Hero bottom strip | none | **`.hero__meta`**: `EST. 2019 — GAUTENG, SOUTH AFRICA` · tags · `SCROLL ↓` | Gives the hero a base line and states who/where; text comes from config |
| Hero scrim | top stop 0.05 | top stop **0.28** | The nav is white type over the palest part of the frame; it was the weakest contrast on the page |
| Strip header | floating 10px eyebrow | hairline + `SELECTED WORK` / `06 FRAMES` (mono) | Matches the rest of the site's rules-and-labels language |
| Strip frames | unnumbered | unnumbered | **CHANGED 2026-10-01 on Alwin's request** — the `01`-`06` index was removed: "I dont like the number on my photos". The markup, the `.hstrip__n` rule and `readingOrder()` are all gone. `check-home-locked.mjs` now asserts the numbers are ABSENT (0), so an agent re-adding them still fails |
| Closing band | centred, small heading, one link | flush-left three-line heading, **"From R1,200"**, solid white button, **one contact line** | It was the only centred block on a flush-left site and the page ended with no price and no way to reach Alwin |

**Did NOT change** (the hard-won list below still applies verbatim): the hero
photograph, `heroPhoto`, `object-position`, the wordmark, the nav, the strip's
frame count (6), column count (2), `packByHeight()`, `stripCols()`, the
greyscale-at-rest rule, and the hover-to-colour behaviour. Only markup and CSS
*around* those were touched.

### Files

- `src/pages.ts` — `homePage()` gains the hero meta strip, the strip header and
  numbered items, and calls the new `homeBand()`. New helpers: `cheapestTier()`,
  `readingOrder()`, `homeBand()`.
- `src/editorial.css` — hero, `.hero__meta`, `.hstrip__head`, `.hstrip__item`,
  `.hstrip__n`, and the whole `.hcta*` block rewritten. Mobile rules added.
- `src/styles.css` — one new token, `--font-mono` (system monospace stack, **no
  extra font request**).
- `src/config.ts` — `home.est` (`"2019"`) and `home.tags`.
- `tools/check-home-locked.mjs` — four new checks (see below). The original
  checks and `LOCKED` values are untouched.

### Why it is built this way (so nobody "simplifies" it back)

1. **Nothing on the band is hard-coded.** The price is `cheapestTier()` over
   `SITE.pricing.tiers`, the tier names and deposit line come from the same
   config, and the email/phone/Instagram come from `SITE.contact` / `SITE.social`.
   Change a price on Services and Home follows. Do not paste "R1,200" into the
   markup.
2. **The strip is unnumbered (CHANGED 2026-10-01, on Alwin's request).** The
   `01`-`06` index was removed at his request, along with the `.hstrip__n` rule
   and the `readingOrder()` helper that existed only to compute it. The note
   below is kept for history: numbering HAD to follow reading order rather than
   array order, because frames are packed by height and index numbering printed
   `01, 04, 06` down the left column. If numbers ever come back, that trap comes
   back with them — do not number by array index.
3. **The band's contact line is one line, not a footer.** An earlier site-wide
   footer was reverted by Alwin. Do not grow this into a footer without asking.
4. **The band heading wraps by `max-width: 9ch`, not by `<br>`**, so the heading
   stays editable in `config.services.heading`.
5. **CSS specificity bug found on the way — do not reintroduce it.** The global
   `.page h1, .page h2` rule (specificity 0,1,1) sets `margin`, `line-height`
   and `letter-spacing`, and it silently **beat** the bare `.hero__h` rule
   (0,1,0). That is why the old `margin-bottom: 24px` never applied and the
   lede sat flush under the heading. The hero and band headings now use
   `.page .hero__h` / `.page .hcta__h` (0,2,0). If a spacing change on a heading
   "does nothing", check this first.
6. **The hero heading is capped at `7.5em`** (desktop only) so "Timeless
   Portraiture" breaks onto two lines. The `.hero__body` width cap was removed
   because the heading is now ~810px at its largest — the old 720px (and before
   that 640px) caps are exactly what the overflow audit used to flag as clipped
   text. Do not put a pixel cap back on `.hero__body`.
7. **Phone behaviour:** the hero meta strip shows only `EST. … — GAUTENG…`
   under 640px (tags and scroll cue are hidden — they do not fit), and the band
   drops the `© …` span. The band stacks to one column.

### Open items for whoever picks this up

- **Confirm the founding year before this goes public.** `home.est` is `"2019"`
  because that is the year Alwin has given for Shutterhaus Visuals, but an
  earlier note flagged a founding-date discrepancy that was never resolved. The
  year also feeds the `© 2019–2026` line. One config value, two places.
- `SCROLL ↓` is decoration (`aria-hidden`), not a link — the router is
  hash-based, so an in-page anchor would navigate away.
- Ideas raised but **not** built: phones show the strip in colour while the hero
  is black-and-white (deliberate per the lock notes, but the least consistent
  moment on the site); the hero and strip both end in a "portfolio" CTA; no
  social-proof line yet.

### Verified

Typecheck and build clean. Measured at 1440, 900 and 390: no horizontal
overflow, no clipped text in `.hero`/`.hstrip`/`.hcta`, heading-to-lede gap
34px, strip still 6 frames in 2 columns, numbers `01 03 06 | 02 04 05` in the
left and right columns respectively.

---

## The locked state (original, 2026-09-30 — still true except where the table above says otherwise)

| | |
|---|---|
| Commit | `abbdba8` — *Home strip: 6 frames in 2 columns* |
| Deploy | `36778082302` (success) |
| Live JS | `main-DgdPSrwW.js` |
| Live CSS | `main-BTLAxQ_v.css`, `store-BEGN4Zg8.css` |
| Screenshots | `shots/live-LOCKED-home/` (5 routes × 4 widths, full-page) |

## What the home page is

- **Hero** — full-bleed photograph, `27-img-0297.jpg` (pinned in
  `config.heroPhoto`), `object-position: 50% 0%` so her head is never clipped.
  The header floats over it: transparent, white type, no white bar.
- **Wordmark** — `SHUTTERHAUS` over `VISUALS`, Archivo Black, both words tracked
  out to a shared ~134px measure, left edges flush. Sized with
  `tools/probe-mark-width.mjs`, not by eye.
- **Selected work** — 6 frames, **2 columns at every width**, packed by
  `packByHeight()`. Ragged bottom: 42px at 1440, 10px at 390.
- **Filter** — greyscale at rest, full uploaded colour on hover, inside
  `@media (hover: hover)` so phones show true colour instead of stuck grey.
  **Display-only** — the JPEG bytes are never touched.

## The three things that were hard-won here

Worth preserving, because each one is a regression someone will re-introduce:

1. **The strip count and column count are one decision.** 6 frames only divides
   evenly as 3/3 or 2/2. In 3 columns it forces 2/1/3 and strands the middle
   column ~252px short — the white hole. `stripCols()` returns 2
   unconditionally; it must NOT reuse the portfolio's `columnsFor()`.
   Counts 8 and 9 both strand a column. 12 is clean but Alwin called it "too
   many images on home now".
2. **`packByHeight()` balances on `height/width`, not `width/height`.** The
   inverse packs columns exactly backwards — it clustered the short landscapes
   and made the ragged bottom *worse* (561px).
3. **Stale Supabase rows override the bundled gallery.** The nine old
   `finals-*.jpg` rows in the `photos` table rendered the entire site as 404s
   while the served bundle was provably clean. `adoptable()` in `main.ts` now
   only adopts the DB set when every row names a file we actually ship. **Those
   9 rows are still in the table** and need clearing in the Supabase dashboard
   (RLS needs the service role key; `.env` only has the anon key).

## How to check the lock

```bash
CDP_PORT=9333 node tools/check-home-locked.mjs https://shutterhausvisuals.co.za 1440
CDP_PORT=9333 node tools/check-home-locked.mjs https://shutterhausvisuals.co.za 390
```

Exits 0 when the home page matches this file, non-zero on any drift. It
asserts the hero filename, the strip frame count, the strip column count, the
`--strip-cols` value, that the hero is **not** greyscaled, and that the strip
**is** grey at rest.

Run it at a **hover** width (>= 640) and at a **touch** width (390) — the two
assert opposite filter states, so one width alone cannot cover the rule.

Under `W < 640` the guard now calls `Emulation.setTouchEmulationEnabled`
before navigating. This is not cosmetic: `setDeviceMetricsOverride` changes
layout only, so headless Chrome kept reporting `(hover: hover) == true` at
390px, the CSS rule stayed on, and the "phones show true colour" half of the
contract was asserting grey every run. Anyone reading a 390 FAIL as "the CSS
is wrong" would be debugging a correct file. Note also that this Chrome build
(154) **ignores** `Emulation.setEmulatedMedia({features: [{name: "hover"}]})`
— it returns success and changes nothing. `setTouchEmulationEnabled` is the
lever that actually flips the media feature.

If a screenshot at a mobile width looks greyscale, check whether the tool
enabled touch emulation before believing it. Layout-only emulation will show
you the hover state, not the phone one.

Run it after any change that could touch the home route — including work
aimed at Portfolio, Services or About. The header, the `.cell` greyscale
rule and `homePage()` are all shared, so a change "to another page" can still
move this one.

## If a check ever fails here

Do not "fix" the home page — that is what the lock means. Fix the tooling or
the data layer, and confirm against the screenshots above. If Alwin explicitly
reopens the home route, the rollback point is `43c1360` (the state before the
2026-10-01 upgrade); `abbdba8` is the original lock.
