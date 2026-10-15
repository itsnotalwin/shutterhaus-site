# SHUTTERHAUS VISUALS — revised mockup review

Branch: `design/editorial-brand-refresh`. Original repository base: `ffd120d0543aa96a3335d18c953bb40bed514849`. Rejected first attempt: `343997b`.

The owner rejected the first build's visual match. **This revised package supersedes the first screenshots and withdraws the earlier visual acceptance claim.** Automated tests demonstrate functionality; the owner decides whether the visual result meets the mockups.

## Revision 2

- Home now uses **“Portraits / worth / keeping.”**, a sharper self-hosted Bodoni Moda display face, the reference's tall split photograph/motif composition, four-up monochrome work tiles on desktop and the mobile image → copy → booking → motif sequence.
- Portfolio now has the reference introduction and featured photo. On mobile, the title leads directly to the large photograph, caption and image grid. The original 30-frame gallery data, packing/order and lightbox are retained.
- About now has **“Behind the lens.”**, the pinned real photographer photograph, a separate landscape/biography composition and three value blocks.
- Services now has **“Sessions, with intention.”**, a curated real portrait, light bordered cards, monochrome image crops and restrained recommendation styling.
- Contact now has **“Let's make / something / worth keeping.”**, a plain white form, supporting photography and the reference's editorial contact details.
- The header uses **Work / About / Sessions / Contact**. Mobile navigation is a dark full-screen panel with large serif links and the supplied motif.
- The closing elements use a compact booking band and **“People. Places. Stories.”** footer.

Social remains **R3,500**. Starter R800, Essential R2,000 and Signature R2,500 are unchanged. All benefits, add-ons, deposits, terms, appointment hours and contact details remain data-driven. Real photography and original source bytes are preserved.

## Review evidence

Open [review/index.html](../review/index.html). It defaults to **Mockup vs revised build**, with page and viewport selectors; switch to **Original website vs revised build** for before/after views.

- `review/evidence/`: all five final pages at 320/390/430/768/1024/1440/1920, plus original-site before images at 390/1440.
- `review/reference-crops/`: normalized supplied mockup regions used by the viewer.
- `review/comparisons/`: combined reference/revision and before/after boards.
- `review/after/`: full-resolution lossless PNG captures, measurements, and command logs.
- `review/changes.patch`: text-code diff; font binaries and screenshot evidence are included separately in the branch.
- [REFRESH_REVISION_2.md](REFRESH_REVISION_2.md): concrete corrections after owner feedback.
- [design-qa.md](../design-qa.md): comparison and review status.

## Main code files

`src/public.css` owns the visual system. `src/layout.ts`, `src/pages.ts` and `src/pages-more.ts` implement the five page compositions. `src/fonts.css` and `public/fonts/` provide licensed self-hosted type. `src/config.ts` owns identity and pricing. `src/navigation.ts`, `src/contact-form.ts` and `src/lightbox.ts` retain accessible interactions, recovery and submission handling. The Vite/TypeScript/static-document architecture, Supabase store/auth/composition contracts, page paths, canonicals and SEO remain intact.

## Functional verification

The final command transcript is `review/TEST_TRANSCRIPT.txt`.

- Typecheck and production build passed.
- `npm test`: 21 browser tests passed, covering all five routes across seven widths, media/heading/SEO integrity, real pinned sources, exact gallery order, pricing, reduced motion, signed-out admin gate and primary interactions.
- `npm run verify:controls`: 12 interaction tests passed, including full-screen menu focus trap/return and dismissal, lightbox keys/focus, package preselection, draft reload/rotation, mocked success/error/retry, honeypot and duplicate-send protection, skip links and legacy routes.
- `npm run verify`: 77/77 existing public/admin-gate checks passed with visual assertions updated for the approved reference treatment.
- Admin panel probe: 15/15 available markup/layout checks; admin upload probe: 8/8 available resize/layout checks.
- Final screenshot set: 35 route/viewport captures, no horizontal overflow, broken media or page exceptions.

## Remaining review limits

The new renders are presented for owner visual review; they are not described as approved or pixel-identical. The exact original concept font file was not supplied; Bodoni Moda is the revised match. Supplied SVG arc artwork differs in texture from the raster mockup. Real pinned photographs, the authentic photographer's full environmental portrait, six curated Home images and full package details intentionally differ from illustrative concept content.

Live Google authentication, authenticated database writes, physical iOS Safari and real inbox delivery were not exercised. Form tests intercept Formspree locally and do not send test enquiries to the live inbox. Admin probes do not prove authenticated publishing. Local performance measurements are recorded in `review/after/performance.json`; they are not field benchmarks.

## Run locally

```bash
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/`. For the screenshot viewer, serve the repository using `python -m http.server 8080` and open `http://127.0.0.1:8080/review/index.html`. Browser tests use `/usr/bin/chromium`; set `CHROME_BIN` for another Chrome/Chromium installation.

No merge, production push, hosting change or deployment has occurred. **Awaiting owner review of this revision.**
