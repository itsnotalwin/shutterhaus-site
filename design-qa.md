# Approved visual refresh — 8 October 2026

final result: passed

The implementation follows the selected centered Hero 3 and the subsequent packages/contact concepts. Compared the original generated mockups with screenshots of the production build at 390px, alongside desktop review at 1440px.

## Visual evidence

Reference images are in the task's `/workspace/shutterhaus-visual-review/` directory:
- `mobile-hero-3-centered.png`
- `mobile-packages-hero-aligned.png`
- `mobile-contact-hero-aligned.png`

Actual screenshots and side-by-side comparisons are in `shots/approved/`: `home-390.png`, `services-390.png`, `contact-390.png`, their 1440px equivalents, and `comparison-{home,services,contact}.png`. CI also retains screenshots from all seven review widths as a workflow artifact.

Matched: centered heavy uppercase mobile hero, white portfolio button and quiet packages link, text menu, photographic packages introduction, Essential selected by default, uncluttered package details, dark contact introduction, pale form fields and full-width submit button. Desktop retains comparison columns and uses a split contact layout.

Intentional adaptations: use the actual photographs, whose crop and subject framing differ from generated mockups; no generated people are published. Only the packages cover gets the approved monochrome treatment. Keep existing package facts, full booking terms, and gallery/admin selections. Real form controls have 16px text and at least 44px height, so the functional form is taller than the static mockup.

## Fix and verification history

1. First browser comparison found an undersized responsive hero source and a contact button that did not stretch. Corrected the picture markup/sizes and button width; recaptured and compared.
2. Removed decorative rules from the refreshed surfaces; retained visible keyboard focus. Updated checks for the approved recommendation wording and native package selector in place of the former stacked mobile cards.
3. Production build, TypeScript, source image candidates, pricing metadata, and 490/490 public browser assertions passed across 320, 390, 430, 768, 1024, 1440 and 1920px. No heading or page overflow, broken visible images, or browser exceptions.
4. Enquiry validation, draft restoration, failure recovery and duplicate-submit protection passed with mocked requests; no real enquiry was sent. Native keyboard package selection navigates to a correctly preselected enquiry. Late gallery updates preserve the chosen package, focus and scroll.
5. Admin upload/edit/publishing-retry and no-JavaScript verification passed. The mobile package selector remains operable without JavaScript. Existing admin/database code and production connection settings are preserved.

No unresolved P0/P1/P2 visual findings in the reviewed Chromium viewports. Safari and physical devices were not available. Direct live-domain access from this workspace is restricted; the deployment workflow performs a read-only release-SHA, page, and asset check on the actual domain after publishing.
