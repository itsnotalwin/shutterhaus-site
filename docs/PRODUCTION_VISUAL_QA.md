# Production visual QA — 15 October 2026

Fresh evidence was captured from the actual live domain, release e582fb994fbb27ed112ca751f0b06ca7b0aaac14, in GitHub Actions run 38763572850. Forty page states cover all five pages at 320, 390, 430, 768, 1024, 1440, 1920 and 844×390. This is separate from local preview verification.

## Confirmed issues and corrections

1. Mobile Services: Signature cropped people from the edges of the family photograph; Essential/Social crops removed the top of the subject's head. Package windows now scale consistently at 5:4, portrait subjects keep their head within the frame, and landscape/group photographs use contain so all people remain visible. Original photographs and package facts are unchanged.
2. Landscape navigation at 844×390: artwork overlaid the Sessions and Contact links, blocking actual clicks. Run 38764093122 captured the failure and hit-test evidence. Compact menu spacing and 44px targets now fit short screens; the decorative panel is removed at short heights and never intercepts pointer events. Very short screens use two columns.
3. A cut Social booking button in an element-only screenshot was investigated. The actual button is a complete 48px control inside its card with no clipping ancestor; Playwright's element capture extended below the viewport. The audit now records CTA bounds and saves full-page and scrolled-CTA views, so that capture artifact is not reported as a site defect.

## Baseline checks

All 40 page states loaded without horizontal overflow, missing images, uncaught JavaScript errors or detected heading clipping. Every gallery photograph retained its full source frame and ratio. Mobile disclosure, keyboard lightbox, focus return, navigation and Social package preselection worked. No enquiries were submitted and no gallery/auth/database data was written.

## Evidence

Before: review/production-before and review/production-menu-before. Current capture tools and read-only audit workflow are retained on the QA branch. Post-fix production captures and engine checks are required before final acceptance. Browser emulation does not establish physical-device or full WCAG certification.
