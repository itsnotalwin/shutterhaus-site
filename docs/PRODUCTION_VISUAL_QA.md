# Production visual QA — 16 October 2026

Later follow-up: the owner reported an image-rendering defect on physical iPhone
Safari after this review. See [the Safari correction and regression coverage](SAFARI_IMAGE_LAYOUT.md), including the limits of desktop-hosted WebKit reproduction.

**Result: production pass complete; corrections are live.** The final live release is `50ebcb41ecb3578993e3ee721fd62326d8322e84`. All five public pages were rendered and checked in Chromium and WebKit after deployment. No outstanding visual or functional regression was found within the tested coverage.

Fresh evidence was captured from the actual live domain, release e582fb994fbb27ed112ca751f0b06ca7b0aaac14, in GitHub Actions run 38763572850. Forty page states cover all five pages at 320, 390, 430, 768, 1024, 1440, 1920 and 844×390. This is separate from local preview verification.

## Confirmed issues and corrections

1. Mobile Services: Signature cropped people from the edges of the family photograph; Essential/Social crops removed the top of the subject's head. Package windows now scale consistently at 5:4, portrait subjects keep their head within the frame, and landscape/group photographs use contain so all people remain visible. Original photographs and package facts are unchanged.
2. Services hero: at 430px and 1920px the cover window trimmed the top of the subject's hair. Both responsive focal-position rules now align to the source top, preserving the head while keeping the composition.
3. Landscape navigation at 844×390: artwork overlaid the Sessions and Contact links, blocking actual clicks. Run 38764093122 captured the failure and hit-test evidence. Compact menu spacing and 44px targets now fit short screens; the decorative panel is removed at short heights and never intercepts pointer events. Very short screens use two columns.
4. A cut Social booking button in an element-only screenshot was investigated. The actual button is a complete 48px control inside its card with no clipping ancestor; Playwright's element capture extended below the viewport. The audit now records CTA bounds and saves full-page and scrolled-CTA views, so that capture artifact is not reported as a site defect.

## Baseline checks

All 40 page states loaded without horizontal overflow, missing images, uncaught JavaScript errors or detected heading clipping. Every Portfolio gallery photograph retained its full source frame and ratio. Mobile disclosure, keyboard lightbox, focus return, portrait navigation and Social package preselection worked. Landscape navigation had the confirmed failure described above. No enquiries were submitted and no gallery/auth/database data was written.

## Final live verification

The [post-deployment browser audit](https://github.com/itsnotalwin/shutterhaus-site/actions/runs/38868662800) confirms the live release above in both engines:

| Engine | Viewports, all five pages | Page states | Overflow / missing images / exceptions / heading clips / interaction errors |
| --- | --- | --- | --- |
| Chromium | 320, 390, 430, 768, 1024, 1440, 1920 wide; 844×390 landscape | 40 | 0 / 0 / 0 / 0 / 0 |
| WebKit | 390, 768, 1440 wide; 844×390 landscape | 20 | 0 / 0 / 0 / 0 / 0 |

The portrait/tablet audit viewports are 844px high and desktop viewports are 1000px high; screenshots include the full document. Full-page screenshot and image/heading measurements are retained for each state. Expanded gallery, lightbox, package selections and open navigation have additional captures.

Manual screenshot review confirmed the following:

- Signature preserves all six people, including on 320px screens. Essential and Social preserve the top of the subject's head. Desktop package image windows remain aligned. The Sessions hero now preserves the full head at 430px and 1920px.
- All five landscape menu links are visible and receive pointer hits. Menu keyboard handling and focus restoration work.
- Home artwork and editorial image composition remain intact. About uses the authentic photographer image. Contact preserves all six faces in its family photograph.
- Portfolio photographs preserve their complete source aspect ratio. Disclosure expands from 10 to 30 photographs and collapses correctly. Keyboard lightbox navigation, focus trapping, Escape and focus return work.
- All four package selections display the correct card; booking links preserve preselection. Social remains **R3,500**. Contact controls, labels and footer remain usable on small screens.
- Social's booking button is a complete 48px control. Full-document and scrolled-viewport evidence distinguish it from the element-screenshot artifact described above.

## Regression tests

The [production deployment](https://github.com/itsnotalwin/shutterhaus-site/actions/runs/38805619094) completed successfully, including the live-domain release and asset checks.

| Check | Result |
| --- | --- |
| `npm run typecheck` and `npm run build` | Passed |
| `npm test` | 18 public DOM tests and 4 admin DOM tests passed |
| `npm run verify` | 487/487 rendered checks passed |
| `npm run verify:controls` | 9/9 native control checks passed |
| `npm run verify:admin` | 85 admin and no-JavaScript fallback checks passed |
| Playwright public and controls suite against corrected local build | 21/21 tests passed |

The local browser suite covers SEO/canonical metadata, structured data, responsive layouts, source/gallery order, reduced motion, navigation, keyboard controls, draft recovery, validation, honeypot handling and mocked submission failure/retry. Actual live enquiries were **not** submitted. Admin verification used fixtures/fallback checks; the production database, authentication and gallery were not changed.

## Changed files and branches

- `src/pages-more.ts`: marks landscape package photographs for full-frame presentation.
- `src/public.css`: responsive 5:4 package windows, portrait focal position, contained group photographs, compact landscape navigation and non-intercepting artwork.
- `services.html`: regenerated public Services document.
- `tools/verify.mjs`: asserts the updated image treatment and consistent package-window proportions.

The production corrections span these four files; the final follow-up changes only the Services hero focal position in `src/public.css`. No hosting, database, credentials, pricing configuration or source photographs changed in this pass. The work originally used `design/editorial-brand-refresh` and `qa/production-visual-pass`. Following the owner’s branch cleanup request, implementation, audit tools, evidence preparation and this report are now consolidated on `main`; the historical branch tips are preserved as archive tags.

## Evidence and review

“Before” in this production-pass package means the previous live redesign release `e582fb9`, before the crop/menu corrections; it does not mean the original pre-redesign website.

- Before: `review/production-before/` and `review/production-menu-before/`.
- After: `review/production-after-chromium/` and `review/production-after-webkit/`.
- Each engine folder includes raw screenshots and `measurements.json`; the release identifier is recorded in that JSON.
- The portable review ZIP includes `index.html`, this report, before/after comparisons, all original production screenshots and the browser measurements. Extract it and open `index.html` locally.
- Live review: [SHUTTERHAUS VISUALS](https://shutterhausvisuals.co.za/?v=50ebcb4). For local source review, use Node 22+, run `npm ci`, `npm run build`, then `npm run preview` and open `http://127.0.0.1:4173`.

The browser runners accessed the actual public domain. Direct access from the workspace was restricted, so locally rendered screenshots were not substituted for the final production evidence. Browser emulation and WebKit engine coverage do not establish testing on physical iOS/Android devices or full WCAG certification. No live form delivery or authenticated production-admin mutation was exercised.
