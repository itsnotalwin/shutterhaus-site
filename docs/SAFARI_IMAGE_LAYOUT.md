# Mobile Safari photograph frames

The owner supplied a physical iPhone Safari screenshot showing Home's selected
photographs displaced within grey slots and crossing the gaps between rows.

## Correction

The Home grid used a percentage-height chain inside native aspect-ratio buttons.
Its cell, picture and image also each had a grayscale filter, creating nested
compositing layers. The shared Portfolio cells had the same three filter layers.

- Photograph buttons now explicitly suppress native control appearance.
- Home's cell, picture and image are anchored to the actual grid frame instead
  of contributing to native button intrinsic sizing.
- Grayscale is applied once, to the image, across both galleries. Wrappers do
  not create extra filtered surfaces.

The real photographs, their order, the intended crops and monochrome treatment
remain unchanged. The fix does not alter booking, pricing or backend behavior.

## Regression coverage

`tests/safari-layout.spec.ts` exercises all five public pages in Chromium and
WebKit at 320×740, 375×812, 393×852, 430×932, 768×1024, 1024×768,
1440×1000 and 844×390. It retains native lazy loading and checks each photograph
against its frame while scrolling, resizing the viewport height, rotating to
another breakpoint and rotating back. It also checks package selections,
compact-menu hit targets, lightbox opening/closing, focus return, form controls,
horizontal overflow and browser exceptions. No live enquiry is submitted.

The normal deployment now requires both engine jobs to pass, alongside the
existing rendered-page, native-control and admin regression gates. After release,
the same scrolling test runs against the actual live domain in WebKit at iPhone
and landscape sizes. Before/after CSS captures and JSON frame measurements are
saved as workflow artifacts. See the latest **Verify and deploy** workflow run.

## Evidence limits

The current desktop-hosted WebKit baseline rendered the original CSS correctly;
it did not reproduce the owner's exact physical-iPhone slicing artifact. The
supplied screenshot establishes the defect, while the code correction removes
the fragile sizing and redundant compositing paths. Engine checks and screenshots
verify the corrected structure but do not certify every iPhone or historical iOS
version. A reload on the affected phone is needed to confirm its artifact is gone.
