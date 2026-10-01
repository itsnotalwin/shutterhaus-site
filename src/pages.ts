import { escapeHtml } from "./layout";
import { SITE } from "./config";
import type { Photo } from "./types";
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
  if (cols < 2 || items.length <= cols) return columnise(items, cols);

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
  const buckets: { photo: T; h: number; i: number }[][] = Array.from({ length: cols }, () => []);
  const acc = new Array<number>(cols).fill(0);
  // Tallest first into the shortest column: longest-processing-time first,
  // which is the standard good-enough bin packing and never needs a quota.
  const byHeight = [...sized].sort((a, b) => b.h - a.h);
  for (const s of byHeight) {
    let c = 0;
    for (let k = 1; k < cols; k++) if (acc[k] < acc[c] - 1e-9) c = k;
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

    for (let i = 0; i < cols; i++) {
      for (let j = i + 1; j < cols; j++) {
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
 * The `sizes` attribute. The grid is 1 column below 640px, 2 below 1000px, 3
 * above, with a 14px gutter. Anything that overstates this downloads too large;
 * anything that understates it downloads too small and looks soft.
 */
const SIZES =
  "(max-width: 639px) 100vw, (max-width: 999px) 50vw, (max-width: 1399px) 33vw, 50vw";

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

function figure(p: Photo, index: number): string {
  // The first frame is the LCP element. Marking it lazy forces the browser to
    // discover it, then decide — which is exactly the 6.4s stall we measured.
    // Only the first is eager; the rest stay lazy.
    //
    // `index < 0` means "not the LCP candidate" and keeps a frame lazy. The
    // portfolio wall passes -1 for every cell because it renders in columns, so
    // "the first frame" is not a fixed, knowable frame — see wallCell().
    const loading = index === 0 ? "eager" : "lazy";
    const priority = index === 0 ? ' fetchpriority="high"' : "";
  const sources = pictureFor(p.url, SIZES, p.width);
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
 function wallCell(p: Photo): string {
   // No index argument: `figure()` marks index 0 as the eager/high-priority LCP
   // image, and under column packing that would be whichever frame the packer
   // happened to put first in column one — not the first frame in reading order.
   // Every frame here is below the header, so all of them stay lazy and the
   // browser picks what to fetch when it scrolls. Passing 0 for all of them is
   // what previously marked one arbitrary frame as the page's LCP element.
   return `<span class="pf-cell" role="button" tabindex="0" data-photo-id="${escapeHtml(p.id)}"
                aria-label="Enlarge ${escapeHtml(p.alt || p.filename || "photo")}">
         ${figure(p, -1)}
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
    landscape: "Landscapes",
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

  return `<nav class="pfilter" aria-label="Filter photographs by category">${items}</nav>`;
}

/**
 * The portfolio route: one editorial wall of every frame.
 *
 * Alwin's call: "instead of having too many different things in portfolio just
 * make it portfolio with all images" — the category filter is gone, so every
 * frame in the gallery shows and the lightbox walks the whole set.
 */
export function portfolioPage(photos: Photo[], cols: number): string {
  if (!photos.length) return emptyGallery();

  // Three columns on desktop, two on a phone — Alwin, 2026-10-01: "maybe we
  // should do a 3 column one for desktop and 2 column for mobile only portfolio
  // page, work now it should be as clean and well put together as the home page".
  //
  // The driver was spacing, not geometry: justified rows put FIVE OR SIX frames
  // side by side at 1440, which read as a contact sheet rather than a portfolio.
  //
  // This reuses `packByHeight` — the same packer the home strip uses — rather
  // than a third approach. Keeping each photo's own ratio (no cropping) and
  // packing the columns to an even bottom is exactly what Alwin chose, and it is
  // the arrangement the locked home page already proves at 42px/10px ragged.
  const columns = packByHeight(photos, cols);
  const wall = columns
    .map((col) => `<div class="wall__col">${col.map((p) => wallCell(p)).join("")}</div>`)
    .join("");

  return `<section class="page portfolio">
    <header class="phead">
      <p class="eyebrow">${photos.length} photographs · Gauteng</p>
      <h1 class="phead__h">Portfolio</h1>
      <p class="phead__p">Portraits and places, shot around Gauteng.</p>
    </header>
    ${filterBar(photos)}
    <div class="grid grid--wall" style="--wall-cols:${cols}">${wall}</div>
    ${pfBand()}
  </section>`;
}

/**
 * How many columns the portfolio wall uses.
 *
 * Three on a desktop, two on a phone, and never one: 50 frames stacked in a
 * single column is 50 screens of scroll, and the packer cannot redistribute
 * them afterwards. The phone case is decided by the CONTENT WIDTH rather than
 * the viewport, so it matches what the CSS ends up doing — at 390px three
 * columns would be 118px per frame, too narrow to read a face, while two still
 * gives ~175px.
 *
 * Derived from the same measurement the markup uses, so the emitted column
 * count and the CSS track count cannot drift apart the way a hardcoded pair did.
 */
function wallCols(frameCount: number, rowWidth: number): number {
  const MIN = 175;
  const fit = Math.floor((rowWidth || 1200) / MIN);
  return Math.max(2, Math.min(3, fit, frameCount));
}

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
      `<a class="hcta__btn" href="#/services">${escapeHtml(SITE.services.cta)} →</a>`,
      `<a class="hcta__btn" href="#/contact">Get a quote →</a>`,
    );
}

/** The shared empty state — reachable from home and portfolio alike. */
export function emptyGallery(): string {
  return `<section class="empty">
      <p>No photos published yet.</p>
      <p class="dim">If you're the admin, add some in <a href="#/admin">the gallery manager</a>.</p>
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
          <a class="hcta__btn" href="#/services">${escapeHtml(SITE.services.cta)} →</a>
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
 * Reading-order numbers for the home strip: 1 for the frame nearest the top,
 * counting down, left column first on ties.
 *
 * Frames are packed into columns by height, so the strip's array order is NOT
 * the order the eye reads them in (column one might hold frames 1, 4 and 6).
 * Numbering by array index would print 01, 04, 06 down the left side. Instead
 * work out where each frame's top edge lands from the same aspect ratios the
 * packer used, and number by that.
 */
function readingOrder(columns: Photo[][]): Map<Photo, number> {
  const placed = columns.flatMap((col, ci) => {
    let y = 0;
    return col.map((p) => {
      const at = { p, ci, y };
      y += p.width && p.height ? p.height / p.width : 1;
      return at;
    });
  });
  placed.sort((a, b) => a.y - b.y || a.ci - b.ci);
  return new Map(placed.map((it, i) => [it.p, i + 1]));
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

  const heroFig = hero
    ? `<figure class="hero__fig">${pictureFor(hero.url, "100vw", hero.width)}
        <img src="${escapeHtml(bestDerivative(hero.url, "jpg", hero.width))}"
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
        <a class="cta" href="#/portfolio">${escapeHtml(h.cta)}</a>
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
            const order = readingOrder(columns);
            const num = (p: Photo) => String(order.get(p) ?? 0).padStart(2, "0");
            return `<section class="hstrip">
            <div class="hstrip__head"><span>Selected work</span><span>${String(strip.length).padStart(2, "0")} frames</span></div>
            <div class="hstrip__grid" style="--strip-cols:${stripCols(strip.length)}">${columns
              .map(
                (col) =>
                  `<div class="hstrip__col">${col
                    .map((p) => `<div class="hstrip__item">${figure(p, 0)}<span class="hstrip__n" aria-hidden="true">${num(p)}</span></div>`)
                    .join("")}</div>`,
              )
              .join("")}</div>
            <a class="cta cta--line" href="#/portfolio">See the full portfolio</a>
          </section>`;
          })()
        : ""
    }

    ${homeBand()}
  </section>`;
}
