# Portfolio page — handoff notes (2026-10-01)

For any agent working on this repo. Written by Claude (chat) for Alwin, who
**cannot have Claude push to GitHub**. Claude built and tested this in a scratch
clone and exported it as `portfolio-polish.patch`. **Your job is to apply it
exactly, verify it, and push.** Read "Applying it" before touching anything.

Base commit this was built on: `9955fa9` ("Portfolio: each column scrolls on its
own…"). If `main` has moved, expect small conflicts in `src/editorial.css` and
`src/pages.ts`; resolve them by keeping BOTH sides, never by dropping a hunk.

## Applying it

```bash
git checkout -b portfolio-polish
git am portfolio-polish.patch        # or: git apply --index portfolio-polish.patch
npm ci
npx tsc --noEmit                      # must print nothing
npm run build                         # must say "built"
npx vite preview --port 4173 &        # then, with Chrome on CDP port 9333:
CDP_PORT=9333 node tools/probe-filter.mjs     http://127.0.0.1:4173
CDP_PORT=9333 node tools/probe-lightbox.mjs   http://127.0.0.1:4173
CDP_PORT=9333 node tools/check-home-locked.mjs http://127.0.0.1:4173 1440
CDP_PORT=9333 node tools/check-home-locked.mjs http://127.0.0.1:4173 390
```

Expected: `probe-filter` ends "filter bar filters, repacks and restores";
`probe-lightbox` ends "all lightbox checks pass"; `check-home-locked` ends
"home page matches the locked state" at both widths (at 1440 the grey-at-rest line
prints `skip`, which is correct in headless Chrome — see HOME-LOCKED.md).
Push to a **branch** and open a PR; do not push straight to `main`.

## What was done, and why

| # | Change | Why |
|---|---|---|
| 1 | **Fixed: the Landscapes filter did nothing visible.** `.pf-cell[hidden] { display: none }` | The handler set `hidden` on 46 of 50 cells, but `.pf-cell { display:block }` out-ranks the browser's `[hidden]` rule, so all 50 stayed on screen. Any element given `display` *and* toggled with `hidden` needs this line. |
| 2 | **Compact header.** Eyebrow, title and filter stack tightly; the lede is hidden | The old header spent ~430px before the first photograph. First photo now starts at y=318 on a 1440×900 desktop (was 431) and y=281 on a 390px phone (was 372). |
| 3 | **Filter label "Landscapes" → "Places"** (label only; data key is still `landscape`) | Echoes the page's own copy ("Portraits and places"). `frame_meta.py`, `demo.ts` and the handler all still match on `landscape`. |
| 4 | **Column fade + "Scroll any column ↓" cue** | The column scrollbars are hidden on purpose, so nothing said the columns scroll. The fade says "there is more"; 64px of bottom padding stops the *last* frame sitting inside the fade. Cue is hidden on phones. |
| 5 | **Frame numbers `01`–`50`** on every tile (mono, `mix-blend-mode: difference`) | Same language as the home strip's numbers; lets a client say "I love #23". Numbers are assigned **once** from the unfiltered wall (`readingOrder()` in `pages.ts`) and stored as `data-n`, so filtering never renumbers a photograph. |
| 6 | **Lightbox from the wall:** counter `02 / 50` instead of the alt text; controls read `CLOSE / ← PREV / NEXT →` | The caption was the full alt sentence. The alt text stays on the `<img>` for screen readers. Words appear only under `.lb--wall`, so **the home page's lightbox is unchanged** (verified: it still shows glyphs and the alt caption). |
| 7 | **Lightbox stepping order fixed** — wall frames only, visible ones only, in number order | It used to step through every `.cell img` in DOM order. On the wall that is column by column (Next walked down one column), and it included frames the filter had hidden (with Places selected, the arrows stepped through 46 invisible frames). |
| 8 | **`repackWall()` now feeds the packer in the photos' original order** | It fed it DOM order, so Places → All returned a *different* arrangement, and that scrambled the frame numbers. Now "All" restores the exact original wall (verified: layout identical after Places → Portraits → All, at both widths). |
| 9 | **`tools/probe-filter.mjs` counts rendered frames, not the `hidden` attribute** | The old probe passed with the bug present, because the attribute was always set correctly. Proven both ways: the new probe **fails** on the original build (`visible=50 label=4`) and **passes** on this one. |
| 10 | `max-height` on `.wall__col` gets a `100dvh` line after the `100vh` fallback | Tracks the phone's collapsing URL bar. |

Files: `src/pages.ts`, `src/main.ts`, `src/lightbox.ts`, `src/editorial.css`,
`src/styles.css`, `tools/probe-filter.mjs`, this file.

## Do not undo these

- **Do not put `hidden` handling back on the attribute alone.** Keep
  `.pf-cell[hidden]`. If you add another `display` rule to `.pf-cell`, re-check
  filtering by *looking* (or run `probe-filter`).
- **Do not renumber on filter.** `data-n` is permanent by design; the lightbox
  counter shows it over the *total* (`12 / 50`), so stepping through Places reads
  `12 → 38 → 39 → 50`. That is intended.
- **Do not number by array index.** Frames are packed into columns by height, so
  array order is not reading order. Use `readingOrder()`.
- **`.page .phead__h` needs the `.page` prefix.** `.page h1` (0,1,1) sets margin
  and line-height and beats a bare class (0,1,0). Same trap as the home heading.
- **Keep the lightbox glyph/word spans.** The home page's lightbox is locked and
  must keep `× ‹ ›` and the alt caption. Only `.lb--wall` shows words.
- **Keep independent column scrolling, 3 columns on desktop / 2 on phone, and no
  hover enlargement.** Those are Alwin's explicit decisions (see comments in
  `editorial.css`). Nothing here changes them.
- **The home page is locked** (HOME-LOCKED.md). This change does not touch the
  home route; `check-home-locked.mjs` must still pass.

## Needs Alwin's OK before you go further

- **The lede is hidden, not deleted.** "Portraits and places, shot around
  Gauteng." is still in the markup (`.portfolio .phead__p { display:none }`). It
  repeated the filter and the eyebrow. Ask before deleting it or restoring it.
- **"Places" vs "Landscapes"** is a copy call.

## Not done (ideas, in rough priority)

- With 4 frames the filtered view is ragged (one column holds a single frame).
  Dropping to 2 columns when ≤6 frames are visible would fix it.
- The sticky-filter comment in `editorial.css` still says the page is "~11400px
  tall"; it is ~1800px now, so the sticky barely matters.
- Lightbox: no swipe on phones, no focus trap, focus is not returned on close.
- Phones show the wall in colour (grey filter is hover-only) — matches the home
  decision, but the green-background and sunset frames stand out in a dense wall.
- `repackWall()` still looks photos up in `DEMO_PHOTOS`, so live Supabase rows
  that are not in `demo.ts` would make it bail. Pre-existing; not changed.

## Measured (1440×900 and 390×844, built output)

No horizontal overflow; 50 tiles, 50 unique numbers 1–50 that ascend with each
tile's top edge; Places shows exactly 4 tiles (`12, 38, 39, 50`) with the
lightbox stepping only through those; 0 page errors. Screenshots use fallback
fonts (Google Fonts is blocked in the sandbox), so real type will differ slightly.
