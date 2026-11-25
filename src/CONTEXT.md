# Public source

`pages.ts`, `pages-more.ts` and `layout.ts` render the five public pages. `public.css` follows the shared stylesheet and owns the responsive public design. `admin.css` styles the separate photo manager. `work-collections.ts` maps published photographs to collections, and `hero-carousel.ts` binds the featured-photo arrows.

Use the existing prices in `pricing.json` and gallery choices in `config.ts` and the published composition. Keep image descriptions accessible, the gallery wall full-frame and the booking package attached to an enquiry. Regenerate the static pages with `npm run build`. Run `npm test` and the browser checks after changing a renderer. [Current design and evidence](DESIGN.md).
