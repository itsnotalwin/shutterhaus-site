# Verification and build tools

Owns generated-page metadata, gallery asset checks and public/admin regression
commands. `build-pages.py` emits public HTML; `verify.mjs` checks real rendered
pages across seven widths through the shared CDP client in `lib/browser.mjs`.
`test-public.mjs` and `test-admin.mjs` run mocked DOM interactions without sending
real enquiries or publishing gallery changes.

The public verifier checks the side-by-side desktop hero, mobile headline/photo/controls order, self-hosted fonts, safe header, published wall, full-frame links and package booking. Run `npm run build` and `npm test`. The deployment also runs browser checks.

The desktop Sessions check expects four equally sized 3:2 image frames with
aligned top and bottom edges. Phone/tablet checks preserve the existing varied
frame shapes. `04-services-<width>-packages.png` captures the actual desktop
package section for crop review. Update this contract if the owner changes the
package presentation; do not bypass the photo-frame or booking checks.
