# Editorial refresh audit — 14 October 2026

Initial checkout: clean branch `work`, commit `ffd120d0543aa96a3335d18c953bb40bed514849`.
Implementation branch: `design/editorial-brand-refresh`. Production workflow runs only on main pushes or manual dispatch; neither was used.

## Reference authority

The uploaded package was extracted intact to `/workspace/design-reference/SHUTTERHAUS_Master_Design_Spec_v1/`. The selected `assets/reference/01-primary-reference.png` is the aesthetic benchmark. Master spec, tokens, interactive prototype, route specifications, asset provenance and desktop/mobile screenshots were inspected. Real repository data takes precedence over illustrative text and images.

## Dependency and feature inventory

- `tools/build-pages.py` generates five static public HTML entrypoints with route-specific canonicals, descriptions, OG/Twitter metadata and JSON-LD; Vite bundles TypeScript. `admin.html` is a separate entrypoint. `vite.config.ts` retains multi-page inputs and configurable base path.
- `src/main.ts` routes named documents first, then legacy hashes. It paints bundled content immediately, then validates optional published gallery/composition data before adoption.
- `src/config.ts` owns identity, actual prices, package benefits/terms, contact details, pinned Home/About/service images and navigation. There is no `src/pricing.json` in this checkout.
- `src/pages.ts` selects and packs photos; `src/rows.ts` and `src/shoots.ts` preserve curation and shoot separation. `<picture>`/WebP/JPEG derivative ladders and full-source lightbox data remain intact.
- `src/store.ts`, `src/supabase.ts` and `src/composition.ts` handle data/auth/published image choices. `src/admin.ts` handles the restricted Google login, uploads, visibility, ordering and composition editing. These backend contracts were not redesigned.
- Original public cascade: `styles.css` → `editorial.css` → `makeover.css`. New public cascade: self-hosted `fonts.css` → shared `styles.css` → one `public.css`. Legacy public CSS files remain for history but are no longer imported. Admin keeps the shared stylesheet, now with the same fonts hosted locally.
- Existing form endpoint is Formspree. Package links include `?package=`. The current checkout had validation and a honeypot but lacked the newer handoff's draft/duplicate-send protection; these were implemented in `contact-form.ts`.
- Existing menu had a scrim and Escape handling but lacked the newer handoff's focus/inert safeguards; these were implemented in `navigation.ts`.
- Existing lightbox supports next/previous, swipe and zoom. Added keyboard focus trapping/return, a dialog name and keyboard entry for Home images.
- SEO assets: existing `robots.txt`, `sitemap.xml`, `og-card.jpg`, favicons, `404.html`, CNAME and hosting headers. Paths/canonicals/metadata are retained; Social updates the schema price range. Removed the old telephone schema property to respect the no-public-phone requirement.

## Baseline

- `npm run build`: exit 0.
- `npm run verify`: 80/80 assertions, exit 0 with Chrome CDP and built preview.
- `npm run test`: missing script, exit 1.
- `npm run verify:controls`: missing script, exit 1.
- Screenshots: all five pages at 390 and 1440 CSS px, density 1, in `review/baseline/`.
- Build regenerated sitemap dates; this was generated task output, not pre-existing user work.

## Resolved reference conflicts

- Newer paths (`public.css`, `visual-refresh.css`, `pricing.json`, `navigation.ts`, `contact-form.ts`) described by the handoff did not exist. Implement against actual code rather than assume those files were present.
- Preserve the real Home headline “Timeless Portraiture”; the proposed “Portraits worth keeping.” remains a copy option for owner review. Retain the real About/Services/Contact copy and appointment hours; do not use the prototype's conflicting mornings/location claims.
- User explicitly updated Social to R3,500. All other package values and all benefits/terms remain unchanged; the prototype's 40-photo Social example is not copied.
- Use all six curated Home images, not the prototype's four invented category tiles. Reuse the packer with three desktop columns and two smaller-screen columns; portfolio ordering/packing remains unchanged. This visual refresh supersedes the older locked Home presentation notes.
- User's latest brief explicitly requests a footer and supplied wordmark; implement both despite older notes against a footer/logo replacement. Favicon remains unchanged.
- Keep the real photographer image with its full composition. The mockup's client portrait is not suitable for About.
- Natural colour is retained in the curated portfolio/selected work. Existing monochrome hero and CSS-only monochrome family images establish the restrained page palette. Source image bytes remain unchanged.
- No new categories, Journal route, service promises, testimonials or response-time claims.
