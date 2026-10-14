# SHUTTERHAUS VISUALS — review build

14 October 2026. Branch: `design/editorial-brand-refresh`. Base: `ffd120d0543aa96a3335d18c953bb40bed514849`.

## Result

The five real public pages share a white editorial header, supplied SVG identity, self-hosted EB Garamond/Inter typography, restrained arc artwork, generous spacing, square booking buttons and a cohesive footer. Home uses a split statement/photo/motif composition and all six curated photographs. Portfolio preserves the 30-frame dataset, order, packer and lightbox. About preserves the authentic photographer portrait and biography. Services retains all package benefits, terms and add-ons. Contact pairs the studio invitation with an accessible, working enquiry form.

The explicit owner price change is applied: **Social R3,500**. Starter R800, Essential R2,000 and Signature R2,500 remain unchanged. The package selector and structured-data price range follow the update.

## Main changes

| Files | Purpose |
|---|---|
| `src/public.css`, `src/fonts.css`, `public/fonts/`, `public/brand/` | One coherent public visual layer, licensed local fonts and supplied artwork |
| `src/layout.ts`, `src/pages.ts`, `src/pages-more.ts` | Shared chrome/footer, split Home, editorial gallery, authentic About, package cards and Contact |
| `src/navigation.ts`, `src/contact-form.ts`, `src/lightbox.ts`, `src/main.ts` | Accessible drawer lifecycle, tab-scoped draft recovery, validation/send protection, keyboard lightbox and route integration |
| `src/config.ts`, `tools/build-pages.py`, generated public HTML | Social price, local-font preload, retained SEO/canonicals and corrected price range |
| `src/admin.ts`, `admin.html` | Existing admin fonts served locally; auth/data/upload code remains intact |
| `tests/`, `playwright.config.ts`, `tools/verify.mjs`, `tools/review/` | Meaningful interaction/regression coverage and reproducible screenshot/CDP review |

## Screenshots and visual review

Open [the review gallery](../review/index.html) for before/after views of all five pages at 390 and 1440, and final captures at **320, 390, 430, 768, 1024, 1440 and 1920**. Density is 1; the dedicated capture uses touch/mobile emulation below 760px. Original lossless PNG captures remain in `review/baseline/` and `review/after/`. Portable WebP evidence is versioned in `review/evidence/`.

Comparison boards are in `review/comparisons/`. Source/implementation screenshots were opened and compared, including focused hero, gallery, Services and form details. Corrections included moving desktop hero copy toward the photo's upper edge, scaling the serif headline, lengthening the motif panel, reducing desktop Services photo-stage whitespace, and completing menu/field focus states. The image capture waits for decoding/reveals to avoid false blank frames in full-page evidence.

Intentional differences from the concept are recorded in [the audit](REFRESH_AUDIT.md): real photos, full founder image, six curated Home frames, existing headline/copy, real pricing and full terms, actual category-free portfolio, original colour work, and a functional enquiry form.

## Verification

| Command/check | Result |
|---|---|
| `npm run typecheck` | Passed, exit 0 |
| `npm run build` | Passed, exit 0 |
| `npm run test` | 21 browser tests passed, exit 0 |
| `npm run verify:controls` | 12 interaction tests passed, exit 0 |
| `npm run verify` | 77/77 public/admin-gate assertions passed, exit 0 |
| `node tools/verify-admin-panel.mjs` | 15/15 layout/markup probes passed, exit 0 |
| `node tools/verify-admin-upload.mjs` | 8/8 available image-resize/layout probes passed, exit 0 |
| Final screenshot measurements | 35 route/viewport captures; no overflow, broken media or page exceptions |

Transcripts are saved under `review/after/`. The baseline had a passing build and 80 browser checks, but no `test` or `verify:controls` script; the added suite now verifies the handoff's requirements. The existing visual gate's old Archivo wordmark assertions were replaced with supplied-wordmark checks; gallery/order/pricing/route assertions were retained. The final gate has 77 assertions because four old wordmark checks became one meaningful SVG check.

Enquiry tests intercept Formspree locally and cover required fields, email validation, honeypot, duplicate-send protection, error/retry, success clearing, package preselection and reload/rotation recovery. No test enquiry was sent to the real inbox. Drawer and lightbox tests cover focus trap/return, Escape, outside dismissal and next/previous. Tests include legacy URLs and skip links. Public checks cover a single H1, image alt/media, reduced motion, canonical/OG/JSON-LD and no public telephone links.

## Performance sanity check

Ten unthrottled Chromium observations (five routes × 390/1440) recorded **CLS 0** during the first two seconds and no external resource hosts. Details are in `review/after/performance.json`. This is a local sanity check, not a field benchmark or Lighthouse score. Public images retain WebP/JPEG derivative selection and lazy loading; the hero remains eager/high priority. Fonts are local and preloaded selectively. The only new dependency is development-only browser test tooling.

## Practical limits and owner review

- Live Google authentication, authenticated admin writes and actual Formspree inbox delivery require the owner's configured test session; they were not exercised. The admin panel probe mounts its existing test markup and the upload probe validates the available browser resize pipeline. They do not prove an end-to-end authenticated publish.
- Native iOS Safari/safe-area behaviour needs a physical device check; browser emulation and landscape draft recovery passed.
- The supplied SVG wordmark uses editable text/fallback type. Outlined logo masters and an SH favicon remain future owner/design decisions; the existing favicon is retained.
- The Home headline remains “Timeless Portraiture.” The proposed “Portraits worth keeping.” is available as an explicit later copy change.
- Review the serif, real image crops, colour/monochrome balance, logo and footer. No merge or deployment has been performed.

## Local review

From the repository root:

```bash
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/`, then the Portfolio, About, Services and Contact links. For development use `npm run dev`. To inspect the screenshot gallery in a browser, serve the repository with `python -m http.server 8080` and open `http://127.0.0.1:8080/review/index.html`.

For browser tests, use installed Chromium at `/usr/bin/chromium`, or set `CHROME_BIN` to your local Chrome/Chromium executable. Run `npm test` and `npm run verify:controls`. `node tools/review/verify-legacy.mjs` starts an isolated Vite preview plus Chrome CDP and runs the existing probes. `node tools/review/capture.mjs` regenerates all screenshots; it uses a separate local port. `python tools/review/package.py` regenerates the portable review boards when Pillow and the extracted design reference are available.

The text-code diff is in `review/changes.patch`; licensed font binaries and screenshot evidence are included in the branch alongside it. Work is preserved in the development branch. **Awaiting owner approval before merge or publication.**
