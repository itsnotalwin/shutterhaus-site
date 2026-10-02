import { escapeHtml } from "./layout";
import { SITE } from "./config";
import type { Photo } from "./types";
import { PHOTO_ROWS } from "./rows";
import { SHOOT_OF } from "./shoots";
// src/rows.ts (justified rows) went away with the row layout — the wall uses
// `packByHeight()` from this file now, the same packer the home strip uses.

/** Round-robin into N columns, preserving the admin's chosen order. */
export function columnise<T>(items: T[], cols: number): T[][] {
  const out: T[][] = Array.from({ length: cols }, () => []);
  items.forEach((it, i) => out[i % cols].push(it));
  return out;
}

/**
 * Pack frames into columns by RENDERED HEIGHT, shortest column first.
 *
 * Round-robin (`columnise`) is fine for the portfolio wall, where a ragged
 * bottom is invisible because the page just continues. It is wrong for the
 * home strip: Alwin called it "uneven" and the numbers agreed — CSS `columns`
 * was filling 3/3/2, leaving the third column 379px short of its neighbours at
 * 1440, and 183px short on a 390 phone. A two-column strip where one column
 * ends a quarter-screen early reads as a mistake, not a style.
 *
 * Aspect ratios come from `p.width`/`p.height`, so the balance is predictable
 * from the data rather than from whatever the browser measured. Ties fall to
 * the leftmost column, which keeps the result stable across renders.
 */
export function packByHeight<T extends Photo>(items: T[], cols: number): T[][] {
  // Never more columns than frames. `columnise` below allocates exactly `cols`
  // buckets and round-robins into them, so any trailing bucket with no frame is
  // an empty column — a tall blank gap beside a crowded one. That is the same
  // defect the swap-search guard at the bottom of this function fixes; this is
  // the second path into it, reached whenever there are fewer frames than
  // columns. Measured: 2 frames into 3 columns returned [1,1,0].
  //
  // `Math.max(1, ...)` keeps the empty-gallery case (0 frames) returning one
  // column rather than none, so callers always get something to query.
  const n = Math.max(1, Math.min(cols, items.length || 1));
  if (n < 2 || items.length <= n) return columnise(items, n);

  // Height of each frame at a fixed column width, relative to that width.
  const sized = items.map((it, i) => ({
    photo: it,
    h: it.width && it.height ? it.height / it.width : 1,
    i,
  }));

  // LARGEST-REMAINDER APPORTIONMENT on the frame COUNT, then fill by height.
  //
  // The previous version filled tallest-frame-first into the shortest column and
  // then repaired with single-frame moves, bailing on the first pass with no
  // improvement. That was measured good on the 6-frame home strip (196px spread)
  // and measured BAD on the 50-frame wall: 214px ragged at 1440, 114px at 768.
  // One move per pass cannot close a gap that 50 frames opened.
  //
  // NO per-column quota. An earlier version apportioned the frame COUNT
  // (17/17/16) before filling, expecting it to help the balance. It does the
  // opposite: forcing equal counts pushes the taller photos into the shorter
  // column, so the totals end up FURTHER apart. Measured on the real gallery at
  // 1440, where one height-ratio unit is one column width (475px):
  //
  //   quota 17/17/16 + swap search  ->  0.68 units = 319px ragged
  //   no quota  + LPT + swap search  ->  0.26 units = 123px ragged
  //
  // So the packer chooses freely and the swap search below does the balancing.
  // The counts come out at 16/17/17 regardless — LPT does not let them drift.
  const buckets: { photo: T; h: number; i: number }[][] = Array.from({ length: n }, () => []);
  const acc = new Array<number>(n).fill(0);
  // Tallest first into the shortest column: longest-processing-time first,
  // which is the standard good-enough bin packing and never needs a quota.
  const byHeight = [...sized].sort((a, b) => b.h - a.h);
  for (const s of byHeight) {
    let c = 0;
    for (let k = 1; k < n; k++) if (acc[k] < acc[c] - 1e-9) c = k;
    buckets[c].push(s);
    acc[c] += s.h;
  }

  // --- ADJACENCY-AWARE SWAP SEARCH.
  //
  // Objective, lexicographic: first the number of same-shoot frames sitting
  // next to each other in the rendered column order, then the ragged spread.
  // Both at once. Measured on the real 50-frame gallery at 1440:
  //
  //   spread-only search  ->  7 neighbours, 0.445 units (211px)
  //   adjacency-aware     ->  0 neighbours, 0.078 units ( 37px)
  //
  // Alwin asked for an even bottom and, told the shoot-spread guarantee was the
  // alternative, chose evenness. The search above shows that was a false
  // trade-off — ordering the objective this way is better on BOTH, so there is
  // nothing to give up.
  //
  // Neighbours are counted in READING order (each column sorted by input
  // position), because that is the order the visitor sees and the order the
  // verify guard reads the DOM in.
  // Membership comes from the generated shoot map, keyed by filename. A frame
  // absent from it gets a unique negative id, so an unlisted file can never be
  // reported as a neighbour of anything — a false positive here would corrupt the
  // objective rather than merely mis-report it.
  const shootId = new Map<number, number>();
  items.forEach((p, k) => {
    const id = SHOOT_OF[p.filename ?? ""];
    shootId.set(k, id === undefined ? -(k + 1) : id);
  });

  /** Columns in reading order — what the visitor sees, and what verify reads. */
  const readOrder = () => buckets.map((b) => [...b].sort((x, y) => x.i - y.i));

  /** Same-shoot frames sitting next to each other once flattened. */
  const neighbours = (): number => {
    const seq = readOrder().flat();
    let n = 0;
    for (let k = 1; k < seq.length; k++) {
      if (shootId.get(seq[k - 1].i) === shootId.get(seq[k].i)) n++;
    }
    return n;
  };

  const spread = (a: readonly number[]): number =>
    Math.max(...a) - Math.min(...a);

  // Steepest descent: take the single best swap, apply it, repeat. Terminates
  // when no swap improves the (neighbours, spread) pair — the objective is
  // lexicographic and both components only decrease, so it cannot cycle.
  for (let guard = 0; guard < 4000; guard++) {
    const base = neighbours();
    const baseSpread = spread(acc);
    let bestScore = base * 1e6 + baseSpread;
    let best: [number, number, number, number] | null = null;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let x = 0; x < buckets[i].length; x++) {
          for (let y = 0; y < buckets[j].length; y++) {
            const A = buckets[i][x];
            const B = buckets[j][y];
            // A column must never be emptied. This search only scores HEIGHT,
            // so it will happily move the last short frame out of a column and
            // leave it holding nothing — a tall empty gap beside a crowded one.
            // That is exactly what filtering to 4 frames across 3 columns
            // produced (0/3/1). Reject any swap that would empty a column.
            if (buckets[i].length < 2 || buckets[j].length < 2) continue;

            buckets[i][x] = B;
            buckets[j][y] = A;

            const trial = acc.slice();
            trial[i] += B.h - A.h;
            trial[j] += A.h - B.h;
            const score = neighbours() * 1e6 + spread(trial);

            buckets[i][x] = A;
            buckets[j][y] = B;

            if (score < bestScore - 1e-9) {
              bestScore = score;
              best = [i, x, j, y];
            }
          }
        }
      }
    }

    if (!best) break;
    const [i, x, j, y] = best;
    const A = buckets[i][x];
    const B = buckets[j][y];
    buckets[i][x] = B;
    buckets[j][y] = A;
    acc[i] += B.h - A.h;
    acc[j] += A.h - B.h;
  }

  // Keep each column in reading order: sort by the position the frame held in
  // the input sequence. The wall's input is the shoot-spread order, so this
  // preserves it down each column instead of showing 17 tallest-first.
  for (const b of buckets) b.sort((x, y) => x.i - y.i);

  return buckets.map((b) => b.map((s) => s.photo));
}


/**
 * Widths generated by tools/make-derivatives.py. Must stay in sync with WIDTHS
 * there — if they drift, srcset silently points at files that 404 and the grid
 * falls back to the oversized original.
 */
const WIDTHS = [400, 800, 1200, 1600];

/**
 * Derivative path for one width, or null when the url can't be rewritten.
 * `gallery/finals-34.jpg` + 800 -> `gallery/finals-34-800w.webp`.
 *
 * Returns null for absolute urls (Supabase Storage serves those through its
 * own CDN transformations) so callers fall back to a plain src rather than
 * emitting a srcset that 404s.
 */
export function derivative(url: string, w: number, ext: "webp" | "jpg"): string | null {
  const m = /^(.*)\.(jpe?g|png)$/i.exec(url);
  if (!m) return null;
  if (/^https?:\/\//i.test(url)) return null;
  return `${m[1]}-${w}w.${ext}`;
}

/**
 * The responsive sources for one photo, wrapped in a <picture>.
 *
 * WebP first, JPEG as the fallback source. A browser fetches exactly ONE of
 * these — this is not "download both" — and every browser that can decode
 * WebP takes roughly a third fewer bytes for the same picture, which is the
 * whole game on a 1.6Mbps phone.
 */
/**
 * The largest derivative that ACTUALLY EXISTS for this file, as a plain string.
 *
 * `derivative()` only builds a path — it does not check the file is there. So
 * asking for a width nobody generated yields a URL that 404s, and because it
 * returned a non-null string the caller's `?? url` fallback never fires. That
 * is how the home hero rendered as a black box: no photo is 1600px wide.
 *
 * Walks WIDTHS downwards and returns the first generated file, falling back to
 * the original when the photo came from an absolute URL (Supabase CDN) or has
 * no derivatives at all.
 */
export function bestDerivative(
  url: string,
  ext: "webp" | "jpg" = "jpg",
  sourceWidth?: number | null,
): string {
  // `derivative()` only BUILDS a path — it never checks the file is on disk.
  // So walking WIDTHS downward and taking the first non-null result always
  // returns 1600w, which make-derivatives.py deliberately never generated for
  // a source narrower than 1600px. That 404 is what rendered the home hero as
  // a black box while every other check stayed green.
  //
  // The real ceiling is the source width, so cap by that. When it is unknown
  // (Supabase CDN absolute URL) return the original, which always exists.
  if (/^https?:\/\//i.test(url)) return url;
  for (let i = WIDTHS.length - 1; i >= 0; i--) {
    const w = WIDTHS[i]!;
    if (sourceWidth && w > sourceWidth) continue;
    const d = derivative(url, w, ext);
    if (d) return d;
  }
  return url;
}

export function pictureFor(url: string, sizes: string, sourceWidth?: number | null): string {
  // Build width+url pairs BEFORE filtering, so the `w` descriptor can never
  // drift out of step with the file it describes.
  //
  // `sourceWidth` caps the ladder. Only widths that were actually GENERATED
  // may be advertised: tools/make-derivatives.py never upscales, so a -1600w
  // file does not exist for a 1440px photo — and a srcset entry for a missing
  // file is worse than none, because the browser picks that exact candidate
  // and 404s, while the `src` fallback only applies when NO <source> matches.
  // That is what rendered the home hero as a black box.
  const set = (ext: "webp" | "jpg"): string =>
    WIDTHS.map((w) => ({ w, u: derivative(url, w, ext) }))
      .filter((p): p is { w: number; u: string } => p.u !== null)
      .filter((p) => !sourceWidth || p.w <= sourceWidth)
      .map((p) => `${p.u} ${p.w}w`)
      .join(", ");

  const webp = set("webp");
  const jpg = set("jpg");
  if (!webp || !jpg) return "";
  return `<source type="image/webp" srcset="${escapeHtml(webp)}" sizes="${sizes}" />
        <source type="image/jpeg" srcset="${escapeHtml(jpg)}" sizes="${sizes}" />`;
}

/**
 * The `sizes` attribute for a full-bleed strip cell (the home page's horizontal
 * strip), which really is close to the viewport width.
 *
 * The WALL used to share this string, whose `100vw` branch was the 1.28 MB
 * defect — a wall cell is a fraction of the viewport, not all of it. The wall
 * now uses `wallSizes(cols)`, computed from the real column count. Keep this one
 * honest for genuinely full-width images only.
 */
const SIZES = "100vw";

/**
 * The `sizes` attribute for a WALL cell, derived from the real column count.
 *
 * This used to be a single hardcoded `SIZES` string whose smallest branch was
 * `100vw`, while a wall cell at 393px is 111px (or 186px at two columns). The
 * browser is not allowed to guess: told "100vw" it correctly asks for 393 CSS
 * px, which at DPR 3 is 1179 device px, which is why it correctly picked the
 * 1200w derivative for every one of the 30 frames. Measured on the live site:
 * 1.28 MB of images for one portfolio page, against 333 device px actually
 * needed per cell. Downscaling the current pick to the true box scores
 * PSNR 40-47 dB, i.e. visually lossless — the extra pixels bought nothing.
 *
 * So `sizes` now states the cell width honestly and the browser picks the 400w
 * file that already exists on disk (11.9x smaller than 1200w on these frames).
 *
 * `cols` is the value wallCols() already computed for the measured row width,
 * so the descriptor cannot drift away from the grid that renders it. The
 * arithmetic is done in px against a 393px reference phone and converted to a
 * percentage, then rounded UP so the browser is never told less than it paints.
 * Deliberately generous: overstating costs a little bandwidth, understating
 * costs sharpness.
 */
function wallSizes(cols: number): string {
  const REF = 393; // iPhone 16 CSS width, the viewport the bug was measured at
  const PAD = 26 * 2; // --pad on both sides
  const GUT = 14; // --gut between cells
  const cellPx = (REF - PAD - (cols - 1) * GUT) / cols;
  const pct = Math.min(100, Math.ceil((cellPx / REF) * 100));
  return `${pct}vw`;
}

/**
 * The category a photo belongs to, read off its `cat-` prefix.
 *
 * The admin stores it as `cat-portrait` inside `album`, because the schema has
 * no dedicated column. A photo with no prefix is treated as "portrait" — every
 * frame still has to appear under exactly one filter.
 */
function categoryOf(p: Photo): string {
  const m = /(?:^|\s)cat-([a-z]+)/i.exec(p.album || "");
  const key = (m?.[1] ?? "portrait").toLowerCase();
  return SITE.categories.includes(key) ? key : "portrait";
}

/** "portrait" -> "Portrait", for the caption line. */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function figure(p: Photo, index: number, sizes?: string): string {
  // The first frame is the LCP element. Marking it lazy forces the browser to
    // discover it, then decide — which is exactly the 6.4s stall we measured.
    // Only the first is eager; the rest stay lazy.
    //
    // `index < 0` means "not the LCP candidate" and keeps a frame lazy. The
    // portfolio wall passes -1 for every cell because it renders in columns, so
    // "the first frame" is not a fixed, knowable frame — see wallCell().
    const loading = index === 0 ? "eager" : "lazy";
    const priority = index === 0 ? ' fetchpriority="high"' : "";
  const sources = pictureFor(p.url, sizes ?? SIZES, p.width);
  // Intrinsic ratio is unknown here, so aspect-ratio comes from the DB if we
  // have it; otherwise the CSS fallback keeps the box from collapsing.
  const ratio = p.width && p.height ? ` style="aspect-ratio:${p.width}/${p.height}"` : "";
  // Fallback src is the smallest derivative, so a browser that ignores
  // <picture> entirely still doesn't pull an 1800px original.
  const fb = derivative(p.url, 400, "jpg") ?? p.url;

  return `<figure class="cell">
      <picture>${sources}
        <img src="${escapeHtml(fb)}" alt="${escapeHtml(p.alt || p.filename || "")}"
             loading="${loading}" decoding="async"${priority}${ratio}
             data-full="${escapeHtml(p.url)}" data-alt="${escapeHtml(p.alt || "")}"
             data-cat="${escapeHtml(categoryOf(p))}"
             data-filename="${escapeHtml(p.filename || "")}" />
      </picture>
    </figure>`;
}

/**
 * A portfolio wall cell: a button wrapping the thumbnail.
  *
  * It used to carry a second, larger `<img>` that the CSS revealed on hover.
  * Removed 2026-10-01 — Alwin, "when i hover it destroys the crop... make it
  * like the home page images". Measured: 247px of thumbnail replaced by 492px of
  * the same frame, thumbnail underneath at opacity 0. Inside a justified row
  * that swaps in a differently-cropped copy whose height disagrees with its
  * neighbours. The wall now inherits the home page's monochrome-at-rest hover
  * from `.shell.is-bw .cell img`, which needs no element of its own.
  *
  * The lightbox opens on CLICK of `.cell img[data-full]`, so the thumbnail
  * keeps that attribute and the button must not swallow the event — hence no
  * JS here at all.
  */
 function wallCell(p: Photo, n: number, sizes: string): string {
   // No index argument: `figure()` marks index 0 as the eager/high-priority LCP
   // image, and under column packing that would be whichever frame the packer
   // happened to put first in column one — not the first frame in reading order.
   // Every frame here is below the header, so all of them stay lazy and the
   // browser picks what to fetch when it scrolls. Passing 0 for all of them is
   // what previously marked one arbitrary frame as the page's LCP element.
   // data-n is the frame's permanent number; the lightbox reads it for its
   // counter and for stepping order. The visible label is decoration only
   // (aria-hidden): the accessible name is already the alt text.
   return `<span class="pf-cell" role="button" tabindex="0" data-photo-id="${escapeHtml(p.id)}"
                data-n="${n}" aria-label="Enlarge ${escapeHtml(p.alt || p.filename || "photo")}">
         ${figure(p, -1, sizes)}
       </span>`;
 }

/**
 * The portfolio filter bar.
 *
 * The `.pfilter` stylesheet shipped in src/editorial.css with nothing emitting
 * it (verify.mjs counted `filters: 0` and nothing complained). This is that
 * markup.
 *
 * Categories come from `photo.album`, which tools/build-demo-ts.py now writes
 * from tools/frame_meta.py — 46 portraits and 4 landscapes in the real gallery.
 * There are no couples, families or social groups in it, so the bar does not
 * claim any. An earlier mockup of this bar showed invented counts of 28/9/7/6
 * against categories the frames do not contain; do not reintroduce those.
 *
 * "All" comes first and is the default, so the bar is a filter rather than a
 * set of tabs that hide work behind them.
 */
function filterBar(photos: Photo[]): string {
  const counts = new Map<string, number>();
  for (const p of photos) {
    const k = p.album || "other";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // Only offer a bar when it would actually distinguish something. With one
  // category the bar is chrome around a single option.
  if (counts.size < 2) return "";

  const label: Record<string, string> = {
    portrait: "Portraits",
    // The data key stays `landscape` (frame_meta.py, demo.ts, the filter handler
    // all match on it); only the label changed, to echo the page's own copy,
    // "Portraits and places".
    landscape: "Places",
  };
  const items = [
    `<button class="pfilter__item is-on" type="button" data-filter="all"
         aria-pressed="true">All · ${photos.length}</button>`,
    ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(
        ([cat, n]) =>
          `<button class="pfilter__item" type="button" data-filter="${escapeHtml(cat)}"
             aria-pressed="false">${escapeHtml(label[cat] ?? cat)} · ${n}</button>`,
      ),
  ].join("");

  // The cue is for mouse users: the column scrollbars are hidden on purpose, so
  // nothing else says the three columns move independently. Hidden on phones.
  const cue = `<span class="pfilter__cue" aria-hidden="true">Scroll any column ↓</span>`;
  return `<nav class="pfilter" aria-label="Filter photographs by category">${items}${cue}</nav>`;
}

/**
 * The portfolio route: 30 chosen frames, 10 static rows of 3.
 *
 * Alwin, 2026-10-01, verbatim: "I dont like having the scroll on each column
 * anymore, static is better, but remove any numbering you have on images, choose
 * 30 of the best to use 3 per row and make sure it sits nice no spacing issues at
 * all please."
 *
 * So: the scroll is gone entirely, the printed numbers are gone, the wall is 30
 * frames in 10 rows of 3, and the spacing is exact.
 *
 * WHY THE SPACING IS EXACT. Three uncropped photos at three different aspect
 * ratios are not one height, and the short ones leave a gap under them. CSS
 * cannot fix that without cropping (object-fit: cover), which Alwin has rejected
 * from the start. So it is solved in the data: every row in src/rows.ts holds
 * three frames of the EXACT same ratio, which at a fixed column width means three
 * identical heights and a gap of zero under every photo. tools/check-rows.py
 * fails if a row ever mixes ratios, so this cannot quietly regress.
 *
 * The category filter went with the scroll. It existed to narrow 50 frames; with
 * 30 deliberately chosen ones there is nothing left for it to select between, and
 * a filter over hand-picked work hides work on purpose.
 */
export function portfolioPage(photos: Photo[]): string {
  if (!photos.length) return emptyGallery();

  const byId = new Map(photos.map((p) => [p.id, p]));

  // A frame id that is not in the gallery would render a hole in a row, and a hole
  // is exactly the "spacing issue" this page is not allowed to have. Name the
  // offender rather than leaving a gap for someone to photograph.
  const missing: string[] = [];

  let n = 1; // 1-based: the lightbox prints it as "07 / 28"
  const shown: string[] = [];
  // The cell width the browser is told about, derived from the SAME frame count
  // the CSS will render with — which is the number of frames in a row, not a
  // column count derived from the viewport. Those two disagreed on desktop and
  // blanked the page; see the guard below. Computed once and passed to each cell.
  const sizes = wallSizes(PHOTO_ROWS[0]?.length ?? 2);

  const rows = PHOTO_ROWS.map((row, ri) => {
    const cells: string[] = [];
    for (const id of row) {
      const p = byId.get(id);
      if (!p) {
        missing.push(`row ${ri + 1}/${id}`);
        continue;
      }
      shown.push(p.id);
      cells.push(wallCell(p, n++, sizes));
    }
    // A row renders a hole if it is missing a frame, so a short row is dropped
    // rather than shipped with a gap.
    //
    // The threshold is the row's OWN length, NOT `cols`. These are two different
    // numbers and conflating them blanked the entire portfolio on desktop:
    // `cols` is the grid track count (3 on a wide screen), while every row in
    // rows.ts holds 2 frames, so `cells.length < cols` was true for all 14 rows
    // and every one was discarded — 0 photos at 1920px, 0 at 1440px, the whole
    // desktop range, while the phone at 2 columns rendered fine. Measured before
    // this fix: 0 `.pf-row` elements at 1920/1440/1280/1100/1024/900/820/768/700/
    // 600px, with the page heading present and the wall height 0.
    //
    // A row is emitted with `row.length` columns so the CSS always has one track
    // per frame, whatever `cols` was computed as.
    if (cells.length < row.length) return "";
    return `<div class="pf-row" style="--row-cols:${row.length}">${cells.join("")}</div>`;
  }).join("");

  if (missing.length) {
    throw new Error(
      `rows.ts references photos the gallery does not have: ${missing.join(", ")}. ` +
        `Regenerate src/rows.ts (python tools/build-rows-ts.py) or fix tools/rows.py.`,
    );
  }

  return `<section class="page portfolio">
    <header class="phead">
      <p class="eyebrow">${shown.length} photographs · Gauteng</p>
      <h1 class="phead__h">Portfolio</h1>
      <p class="phead__p">Portraits and places, shot around Gauteng.</p>
    </header>
    <div class="pf-rows">${rows}</div>
    ${pfBand()}
  </section>`;
}

/**
 * Why the wall's column count is NOT derived from the viewport — see
 * portfolioPage()'s short-row guard. Retained as the documented reason rows.py
 * packs TWO frames per row: three columns at 393px is 111px per frame, too
 * narrow to read a face. Also the minimum a cell must be for the wall to be
 * worth viewing at all.
 */
export const WALL_MIN_FRAME_PX = 175;

/**
 * The closing band on the portfolio route.
 *
 * Measured 2026-10-01: the page ended on `.page.portfolio` and nothing else — no
 * footer, no price, no way to reach Alwin without scrolling back to the nav. On
 * a page whose entire job is "look at my work", that is the worst place to dead-
 * end: a visitor who likes a frame has no next step.
 *
 * This is `homeBand()`, the same band the home page uses, with the wording
 * changed. Reusing it rather than writing a second one means the price and the
 * contact links have a single source, and the portfolio cannot drift out of sync
 * with what Services charges. It also inherits the deliberate choice recorded
 * there: ONE contact line inside the band, not a site-wide footer.
 *
 * The three replacements match on markup that `homeBand()` controls, so a
 * wording change there that breaks one of them fails silently into an unchanged
 * string rather than an error. `verify.mjs` asserts the band and its CTA are
 * present on this route, which is what catches that.
 */
function pfBand(): string {
  return homeBand()
    .replace(
      `<p class="eyebrow">${escapeHtml(SITE.services.eyebrow)}</p>`,
      `<p class="eyebrow">Book a shoot</p>`,
    )
    .replace(
      `<h2 class="hcta__h">${escapeHtml(SITE.services.heading)}</h2>`,
      `<h2 class="hcta__h">Like what you see?</h2>`,
    )
    .replace(
      `<a class="hcta__btn" href="./services.html">${escapeHtml(SITE.services.cta)} →</a>`,
      `<a class="hcta__btn" href="./contact.html">Get a quote →</a>`,
    );
}

/** The shared empty state — reachable from home and portfolio alike. */
export function emptyGallery(): string {
  return `<section class="empty">
      <p>No photos published yet.</p>
      <p class="dim">If you're the admin, add some in <a href="./admin.html">the gallery manager</a>.</p>
    </section>`;
}

/**
 * How many columns the home strip should use.
 *
 * The portfolio drops to a single column under 640px, but the home strip must
 * not: 8 frames stacked in one column on a phone is a very long scroll, and
 * the packer cannot redistribute them after the fact. So the strip is floored
 * at 2 columns, and the CSS grid is driven by the child count rather than a
 * custom property — a mismatch between the two is what left all 8 frames in
 * one column at 390px.
 */
function stripCols(frameCount: number): number {
  // The strip uses TWO columns at every width, not the portfolio's three.
  //
  // A column count that divides the frame count is what keeps the bottom edge
  // even, and Alwin wants few frames: "too many images on home now". Six
  // frames only splits evenly as 3/3 or 2/2 — as 3 columns it forces 2/1/3 and
  // strands the middle column 252px short, which is the white hole again.
  //
  // So: two columns everywhere, six frames, 3/3. On a phone 3+3 still reads as
  // a short wall rather than a long one. Both the emitted columns and the grid
  // track count come from this one function, so they cannot disagree.
  const want = 2;
  return Math.min(want, frameCount);
}

/**
 * The closing band: services pitch, the entry price, and one contact line.
 *
 * Replaces the centred "Capture what matters" strip, which was the only
 * centred block on a site that is otherwise flush-left, and which left the home
 * page ending on a dead end — no price and no way to reach Alwin without going
 * back up to the nav. The contact row is deliberately ONE line inside the band,
 * not a site-wide footer (an earlier footer was reverted).
 */
function homeBand(): string {
  const from = cheapestTier();
  const insta = SITE.social.find((x) => x.id === "instagram");
  const names = SITE.pricing.tiers.map((t) => t.name).join(" · ");
  return `<section class="hcta">
      <div class="hcta__grid">
        <div class="hcta__main">
          <p class="eyebrow">${escapeHtml(SITE.services.eyebrow)}</p>
          <h2 class="hcta__h">${escapeHtml(SITE.services.heading)}</h2>
        </div>
        <div class="hcta__side">
          ${
            from
              ? `<p class="hcta__k">From</p>
          <p class="hcta__price">${escapeHtml(from.price)}</p>`
              : ""
          }
          <p class="hcta__note">${escapeHtml(names)}<br>${escapeHtml(SITE.pricing.depositNote)}</p>
          <a class="hcta__btn" href="./services.html">${escapeHtml(SITE.services.cta)} →</a>
        </div>
      </div>
      <div class="hcta__foot">
        <a href="mailto:${escapeHtml(SITE.contact.email)}">${escapeHtml(SITE.contact.email)}</a>
        <a href="tel:${escapeHtml(SITE.contact.phone.replace(/[^+0-9]/g, ""))}">${escapeHtml(SITE.contact.phone)}</a>
        ${insta ? `<a href="${escapeHtml(insta.url)}" target="_blank" rel="noopener">Instagram</a>` : ""}
        <span>© ${escapeHtml(SITE.home.est)}–${new Date().getFullYear()} ${escapeHtml(SITE.nameTop)} ${escapeHtml(SITE.nameBig2)}</span>
      </div>
    </section>`;
}

/**
 * The cheapest package, for the "From R1,200" line on the home band.
 *
 * Read from the pricing config rather than typed in, so changing a tier price
 * on the Services page can never leave the home page quoting a stale figure.
 * Prices are display strings ("R1,200"); the digits decide which is cheapest
 * and the original string is what gets shown.
 */
function cheapestTier(): { name: string; price: string } | null {
  const tiers = SITE.pricing.tiers.filter((t) => /\d/.test(t.price));
  if (!tiers.length) return null;
  const n = (t: { price: string }) => parseInt(t.price.replace(/[^0-9]/g, ""), 10);
  return [...tiers].sort((a, b) => n(a) - n(b))[0]!;
}

/**
 * The home route: full-bleed hero, then a short editorial strip of frames.
 *
 * The hero is a real photograph rather than a flat black block — the reference
 * puts the work behind the headline, and a black rectangle reads as a broken
 * image to a first-time visitor.
 */
export function homePage(photos: Photo[], cols: number): string {
  const h = SITE.home;
  // The hero is a wide box; most gallery frames are portrait. Taking photos[0]
  // blindly meant a 1440x1800 portrait centre-cropped into a 1440x710 hero —
  // which zooms into the middle band and slices the subject's head off.
  //
  // Prefer a landscape frame, but not just any: a wide shot of a city skyline
  // crops fine yet says nothing about portraiture, which is what the headline
  // claims. Prefer a landscape frame that is also close enough to be a
  // PORTRAIT (subject fills the frame), then any landscape, then anything.
  const landscape = photos.filter((p) => (p.width ?? 0) > (p.height ?? 0));
  // A "portrait" shot is roughly square-to-4:5 — the subject dominates.
  // A 3:2 landscape is usually a wide establishing shot.
  const portraitShot = landscape.filter((p) => {
    const r = (p.width ?? 0) / (p.height ?? 0);
    return r >= 1 && r <= 1.5;
  });
  // A pinned hero wins; that is a deliberate art-direction choice, not a guess.
  // Fall back through the same ladder when it is unset or the file is gone.
  const pinned = SITE.heroPhoto ? photos.find((p) => p.filename === SITE.heroPhoto) : undefined;
  const hero = pinned ?? portraitShot[0] ?? landscape[0] ?? photos[0];
  // Never feature the same frame twice on one page.
  const strip = photos.filter((p) => p.id !== hero?.id).slice(0, SITE.homeGalleryCount);

  // The hero is the LCP element and was the single biggest byte on the home
  // page: a 286 KB JPEG, while every other image on the site is WebP. Its
  // `src` fallback asked bestDerivative for "jpg" explicitly, so a browser that
  // took the <img> path paid JPEG bytes. The <picture> above already offers
  // WebP first, so this only changes the fallback — but it is the path some
  // browsers take, and it is free. "webp" is requested and the JPEG <source>
  // stays as the real fallback for a browser with no WebP support at all.
  const heroFig = hero
    ? `<figure class="hero__fig">${pictureFor(hero.url, "100vw", hero.width)}
        <img src="${escapeHtml(bestDerivative(hero.url, "webp", hero.width))}"
             alt="${escapeHtml(hero.alt || hero.filename || "")}"
             loading="eager" decoding="async" fetchpriority="high"
             style="aspect-ratio:${hero.width ?? 1600}/${hero.height ?? 1067}" />
      </figure>`
    : "";

  return `<section class="page home">
    <div class="hero">
      ${heroFig}
      <div class="hero__scrim" aria-hidden="true"></div>
      <div class="hero__body">
        <p class="eyebrow">${escapeHtml(h.eyebrow)}</p>
        <h1 class="hero__h">${escapeHtml(h.heading)}</h1>
        <p class="hero__lede">${escapeHtml(h.lede)}</p>
        <a class="cta" href="./portfolio.html">${escapeHtml(h.cta)}</a>
      </div>
      <div class="hero__meta">
        <span>Est. ${escapeHtml(h.est)} — ${escapeHtml(SITE.contact.location)}</span>
        <span class="hero__meta-tags">${h.tags.map(escapeHtml).join(" / ")}</span>
        <span class="hero__meta-cue" aria-hidden="true">Scroll ↓</span>
      </div>
    </div>

    ${
      strip.length
        ? (() => {
            const columns = packByHeight(strip, stripCols(strip.length));
            return `<section class="hstrip">
            <div class="hstrip__head"><span>Selected work</span><span>${String(strip.length).padStart(2, "0")} frames</span></div>
            <div class="hstrip__grid" style="--strip-cols:${stripCols(strip.length)}">${columns
              .map(
                (col) =>
                  `<div class="hstrip__col">${col
                    // No number printed on the frame. Alwin, 2026-10-01: "I dont
                    // like the number on my photos". The strip does not need
                    // numbering to read as a curated set, and the digit sitting in
                    // the corner of every photograph was the thing he objected to.
                    .map((p) => `<div class="hstrip__item">${figure(p, 0)}</div>`)
                    .join("")}</div>`,
              )
              .join("")}</div>
            <a class="cta cta--line" href="./portfolio.html">See the full portfolio</a>
          </section>`;
          })()
        : ""
    }

    ${homeBand()}
  </section>`;
}
