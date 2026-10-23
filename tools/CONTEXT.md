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

The desktop Sessions check expects four equally sized 3:2 image frames with
aligned top and bottom edges. Phone/tablet checks preserve the existing varied
frame shapes. `04-services-<width>-packages.png` captures the actual desktop
package section for crop review. Update this contract if the owner changes the
package presentation; do not bypass the photo-frame or booking checks.
