# Verification and build tools

Owns generated-page metadata, gallery asset checks and public/admin regression
commands. `build-pages.py` emits public HTML; `verify.mjs` checks real rendered
pages across seven widths through the shared CDP client in `lib/browser.mjs`.
`test-public.mjs` and `test-admin.mjs` run mocked DOM interactions without sending
real enquiries or publishing gallery changes.

Keep assertions aligned with approved product behavior. Desktop now has a white,
full-width shell; the verifier checks its actual bounds at 1024, 1440 and 1920px.
Phone cover and scrolling-gallery checks remain in place. Run `npm run build`
and `npm test`; the deployment workflow additionally runs browser verification.
