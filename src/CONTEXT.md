# Source context

Owns public rendering, image presentation, navigation, enquiries and the separate
photo manager. `main.ts` loads shared `styles.css` then public-only `public.css`;
admin uses `admin.css`. `pages.ts`, `pages-more.ts` and `layout.ts` render content;
`pricing.json` supplies approved package facts.

Preserve published photo choices, gallery order, focal points, natural ratios,
package terms and enquiry behavior. Desktop rules start at `min-width:1001px`.
Home uses two columns: copy and horizontal brand artwork on the left, complete
photograph on the right. `pages.ts` marks the second heading break for desktop
removal and requests the horizontal `motif` variant from `layout.ts`; inner
pages retain the default responsive artwork. Phones keep the approved cover,
three-line heading, horizontal artwork band and swipe gallery. Desktop package photos share 3:2 frames with per-package `--desktop-focal`
positions from `pricing.json`; the cards share eight comparison rows; Contact uses a compact Name/Email row.

Regenerate static HTML with `npm run pages`; run `npm run build` and `npm test`.
Use the existing gated browser checks and inspect actual rendered captures.
See `DESIGN.md` for current composition, evidence and remaining inherited gaps.
