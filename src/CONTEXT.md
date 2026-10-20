# Source context

Owns public rendering, image presentation, navigation, enquiry interactions and
the separate photo manager. `main.ts` loads shared `styles.css` then public-only
`public.css`; admin uses `admin.css`. `pages.ts`, `pages-more.ts` and `layout.ts`
generate page content; `pricing.json` supplies approved package facts.

Preserve actual portfolio assets, gallery ordering, focal points, image ratios,
package terms and form behavior. Desktop hero composition lives in `public.css`
under `min-width:1001px`, with its photo ratio supplied by `pages.ts`. Phone cover
styles stay intact; the artwork band preserves its intrinsic ratio and tablets
also show the horizontal artwork. `lightbox.ts` keeps descriptions in image alt
attributes and shows position counters instead of visible description captions.
Regenerate static HTML with `npm run pages`, then run `npm run build` and
`npm test`. Visually inspect all five public routes and the mobile cover before
publishing. See `DESIGN.md` for composition and current capture evidence.
