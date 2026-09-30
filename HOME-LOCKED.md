# HOME PAGE — LOCKED

**Alwin, 2026-09-30:** "OK PERFECT LETS LOCK IN OUR HOME PAGE AS THIS WE DONT
MAKE MORE CHANGES HERE AT ALL FROM THIS POINT"

No further changes to the home route from here. This file is the reference for
what "locked" means, so a future session can tell whether something drifted.

## The locked state

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

Run it after any change that could touch the home route — including work
aimed at Portfolio, Services or About. The header, the `.cell` greyscale
rule and `homePage()` are all shared, so a change "to another page" can still
move this one.

## If a check ever fails here

Do not "fix" the home page — that is what the lock means. Fix the tooling or
the data layer, and confirm against the screenshots above. If Alwin explicitly
reopens the home route, the rollback point is `abbdba8`.
