/**
 * Justified rows for the portfolio wall.
 *
 * Alwin, 2026-09-30: "portfolio page layout is concerning tis not clean", then
 * choosing justified rows: "no gaps, no cropping, rows stay aligned".
 *
 * WHY THIS IS COMPUTED IN JS RATHER THAN CSS
 *
 * The obvious CSS approach is `display: contents` on the columns — the bug this
 * replaces. That dissolves the column boxes and the wall silently becomes a
 * row-major grid, so every row is as tall as its tallest photo and short frames
 * leave ragged white notches under them. That is what made the page read as
 * unclean.
 *
 * `object-fit: cover` fixes the notches but crops every frame that does not
 * already match the row's aspect ratio — and with 44 portrait / 6 landscape /
 * 0 square in this set, that would crop or distort most of the work.
 *
 * So: group photos into rows where each row's aspect ratios add up to the
 * viewport width, then set one shared row height. Every frame is shown whole,
 * every row ends flush, nothing is cropped.
 */

import type { Photo } from "./types";

/**
 * Default gap, used only when the caller cannot read one from the stylesheet.
 *
 * The gap is NOT a constant here. Three separate attempts to hardcode it
 * against `--gut` in src/styles.css all produced rows that overran the content
 * edge (by 15px, then by 300-1300px, then by 15-27px) because the JS width
 * maths and the CSS `gap` disagreed by exactly one gutter. The single source of
 * truth is the CSS custom property, and `gutterPx()` below reads it from the
 * document at the same width the layout was computed for.
 */
const FALLBACK_GUTTER = 14;

/** Read `--gut` for the width the rows were computed against. */
export function gutterPx(measured?: number): number {
  if (typeof measured === "number" && measured > 0) return measured;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--gut");
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : FALLBACK_GUTTER;
}

export interface Row {
  photos: Photo[];
  /** Row height in px at the given target width. */
  height: number;
}

const aspectOf = (p: Photo) => (p.width && p.height ? p.width / p.height : 0.667);

/**
 * Best target row height for a viewport width.
 *
 * Around 320px gives 3-4 frames per row on a desktop and 2-3 on a phone, which
 * keeps each photograph big enough to read as a photograph rather than texture.
 */
export function targetHeight(vw: number): number {
  if (vw < 480) return 190;
  if (vw < 768) return 240;
  if (vw < 1100) return 280;
  return 330;
}

/**
 * Greedily fill rows: keep adding frames until one more would move the row's
 * aspect sum further from ideal than stopping here.
 *
 * Without that test a row one frame short of the target width gets an absurd
 * height, which is exactly what makes naive justified layouts look broken.
 */
export function layoutRows(photos: Photo[], vw: number): Row[] {
  const target = targetHeight(vw);
  const ideal = Math.max(1, vw) / target;

  const rows: Photo[][] = [];
  let cur: Photo[] = [];
  let sum = 0;

  for (const p of photos) {
    const ar = aspectOf(p);
    const next = sum + ar;
    if (cur.length && (sum >= ideal || Math.abs(next - ideal) >= Math.abs(sum - ideal))) {
      rows.push(cur);
      cur = [];
      sum = 0;
    }
    cur.push(p);
    sum += ar;
  }
  if (cur.length) rows.push(cur);

  return rows.map((row, idx) => {
    const full = Math.max(1, vw) / row.reduce((a, p) => a + aspectOf(p), 0);
    // The last row rarely fills the width. Match it to the rows above so the
    // wall ends on one line rather than a ragged edge, capped so two or three
    // leftover portraits can't become a giant banner.
    const isLast = idx === rows.length - 1;
    return { photos: row, height: isLast ? Math.min(full, target * 1.35) : full };
  });
}

/**
 * Render one justified row.
 *
 * Each frame's width is its share of the row's total aspect ratio, because all
 * frames in a row share one height. Percentages are of the row's content box,
 * so the row's own gap handles the spacing.
 */
export function renderRow(
  row: Row,
  rowWidth: number,
  cellHtml: (p: Photo, i: number) => string,
  startIndex: number,
  gutter = FALLBACK_GUTTER
): string {
  // The row's frames must add up to exactly the available width.
  //
  // Flex `gap` eats (n-1) gutters out of the row, so the space actually shared
  // between frames is rowWidth minus those gaps. Each frame then takes its
  // aspect-ratio share of that remainder.
  //
  // Two earlier versions got this wrong by one gutter in each direction: one
  // subtracted the gaps here AND let flex add them (rows overshot by 15px), the
  // next subtracted nothing (rows overshot by 300-1300px). The arithmetic has to
  // account for the gaps exactly once, here.
  const gaps = gutter * Math.max(0, row.photos.length - 1);
  const frameSpace = Math.max(1, rowWidth - gaps);
  const totalAr = row.photos.reduce((a, p) => a + aspectOf(p), 0);

  const cells = row.photos
    .map((p, i) => {
      const px = (aspectOf(p) / totalAr) * frameSpace;
      return `<div class="pf-row__cell" style="flex:0 0 ${px.toFixed(2)}px">${cellHtml(p, startIndex + i)}</div>`;
    })
    .join("");

  return `<div class="pf-row" style="height:${Math.round(row.height)}px">${cells}</div>`;
}