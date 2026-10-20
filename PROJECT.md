# Shutterhaus Visuals

Production source: `itsnotalwin/shutterhaus-site`, branch `main`.
Live site: https://shutterhausvisuals.co.za. Vite + TypeScript, generated static
public documents, a separately styled admin, and optional Supabase gallery data.

Read `AGENTS.md` and `README.md` before working. Public styles are in
`src/public.css`, loaded after the shared `src/styles.css`. Keep factual copy,
package configuration, published photo choices, navigation and enquiry behavior
intact during visual maintenance. Generate HTML through `tools/build-pages.py`.

Run `npm ci`, `npm run build`, and `npm test`. `npm run dev` starts development;
`npm run preview` serves the production build. Browser checks are described in
the README. Current work refines the desktop hero, fits the existing artwork on
phones/tablets/desktop, and removes visible alt descriptions from the lightbox.
The approved phone cover and swipe gallery remain the responsive baseline.
The owner explicitly authorized research, implementation and deployment on
2026-10-21. Preserve the sole main branch and gated deployment workflow.

Validation on 2026-10-20: production build and all 22 public/admin DOM regression
tests pass. Original CSS is unchanged and every added rule is scoped above
1000px; the Impeccable mechanical detector reports no findings. Fresh browser
captures are blocked by the preview browser's `ERR_BLOCKED_BY_CLIENT` response.
The folder checker still reports missing screenshots and pre-existing folder
documentation; this pass does not claim repository-wide documentation compliance.
