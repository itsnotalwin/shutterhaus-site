# Public-site cleanup release — 13 October 2026

The release was reconciled with production commit `4cf4af8`, preserving the approved photographic design, mobile package chooser, disclosure galleries, pricing, draft restoration, transactional photo publishing and mornings/weekends availability.

## Changes

- Consolidate the editorial and makeover styles into `src/public.css`, removing 97 superseded declarations. Keep the approved visual direction in `src/visual-refresh.css`.
- Extract the current booking band, contact behavior and navigation into dedicated modules. Preserve saved enquiry drafts, validation feedback and package selection.
- Clean up menu listeners, scrims and background isolation on navigation and resize. Closed compact navigation is inert; desktop links remain interactive.
- Cancel pending enquiry delivery when leaving Contact and retain the saved draft. Keep duplicate-request protection and failure recovery.
- Use native photo buttons on Home and Portfolio, and a native modal photo viewer. Preserve mobile disclosure counts and restore focus to the same photograph after repacking.
- Make zoom a keyboard-accessible button, reset it between photographs, and keep swipe movement separate from the stage's zoom transform.
- Repair repeated-shoot neighbours within a packed column without changing its height or selected photos. Published manual sequences retain their chosen order.
- Remove unused rendering helpers and enable TypeScript checks for unused locals and parameters.
- Give the browser verifier bounded CDP calls and explicit protocol errors. Correct its gallery-order assertion so it checks the actual 30 rendered photos. Add native-control checks to the deployment workflow.

## Validation before push

- Production build, strict TypeScript, page metadata, row manifest and all 255 advertised image candidates: passed.
- Public Chromium layout/navigation suite at seven widths: **490/490 passed**.
- Native photo controls and responsive drawer cleanup: **9/9 passed**.
- Public DOM regressions: **18/18 passed**.
- Admin draft/publishing DOM regressions: **4/4 passed**.
- Configured admin browser tests, mocked uploads/publication, uploaded public photos and no-JavaScript fallback pages: **85 checks passed**.
- Packer edge cases and `git diff --check`: passed.

Local configured-build tests used a placeholder public Supabase configuration and mocked I/O. They did not submit real enquiries or modify production photographs. The production workflow uses the existing repository variables and verifies its release SHA and page assets on the live domain after deployment.

The local environment still blocks direct connections to the custom domain. Deployment status and the workflow's live-domain verification can be read through the connected GitHub tools.
