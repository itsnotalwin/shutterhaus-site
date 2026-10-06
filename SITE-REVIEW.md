# Shutterhaus Visuals review — 6 October 2026

The production build passes. Code and simulated-DOM checks cover the public
pages, package selection, enquiry submission and photo-viewer keyboard behavior.
The browser tool was unavailable, so no current screenshots were captured and
responsive layout, image crops and live-site behavior remain visually unverified.
These are code findings, not a completed visual audit.

## Pricing confirmed by Alwin

| Package | Price | Edited photos | Session |
| --- | --- | --- | --- |
| Starter | R800 | 15 | 30 minutes |
| Essential | R2,000 | 20 | 60 minutes |
| Signature | R2,500 | 40 | 90 minutes |
| Social | R2,500 | **40** | 45 minutes |

Social includes a commercial licence and a 10-image sneak peek within 48 hours.
The full gallery delivery window remains 7–14 days for every package. The 50%
deposit and existing add-on prices remain in place.

## Verified issues fixed

1. **Pricing maintenance:** `src/pricing.json` now supplies numeric package
   amounts to Services, Home, Contact and the generated JSON-LD price range.
   Metadata previously duplicated the range and even carried a stale comment
   listing different package prices. Build validation rejects invalid amounts
   and duplicate package names.
2. **Social deliverables:** changed 20 edited images to 40 as requested; removed
   the contradictory promise of same-day previews and clarified the distinction
   between the 10-image preview and full gallery delivery.
3. **Contact draft loss:** removed the unnecessary gallery query and redraw from
   Contact. Rotation also no longer rebuilds the form or Services page.
4. **Submission reliability:** a pending request disables submission and ignores
   repeated submits. Failed requests retain the message and allow retry; a
   15-second timeout prevents indefinite waiting. These checks mock the endpoint
   and do not send email.
5. **Accessibility:** form feedback is a live status region, invalid inputs
   receive focus, and inputs have an explicit focus outline. Package headings
   now follow the page's H1 with H2s, while retaining package-specific styles.
   Photo viewers receive a name, move focus inside, keep Tab inside the dialog,
   make the background inert and return focus on close. Home photographs now
   support Enter and Space activation.
6. **Services clarity and image sizing:** added an explicit ZAR/add-on note and
   package-specific enquiry labels. Image `sizes` now matches the one-, two-
   and four-column package grid rather than advertising one-third screen width
   on both tablets and desktops.
7. **Contact preference:** removed the public telephone property from generated
   search metadata to match the existing instruction to remove calling. The
   requested WhatsApp channel remains available.

## Public flow status

1. **Home → selected photographs:** keyboard access repaired; cheapest package
   remains R800 and reads shared pricing. Hero composition and crops need a
   current browser screenshot check.
2. **Portfolio → photo viewer:** focus handling repaired. Gallery build checks
   confirm 15 rows, 30 unique frames and existing files; real-browser scrolling,
   swipe gestures and image crops still need review.
3. **About:** build and metadata checks pass; its responsive portrait and copy
   layout need visual confirmation.
4. **Services → choose a package:** approved amounts and Social's 40 images are
   checked in rendered DOM markup. Price/CTA alignment, dark-card readability
   and photographs need desktop and phone screenshots.
5. **Contact → enquiry:** package preselection, validation, rotation, duplicate
   submission protection, failure recovery and successful reset pass simulated
   DOM tests. Actual endpoint delivery and iPhone Safari remain unchecked.

## Recommended next upgrades

- Complete a browser review at phone, tablet and desktop widths, including
  keyboard focus, 200% zoom, mobile navigation and photo-viewer gestures. Give
  Services priority because equal desktop slots crop portrait photographs.
- Specify where the 25 km travel allowance starts and whether extra mileage is
  charged one way or for a return trip. The current wording leaves the final
  travel bill open to interpretation; a business decision is needed.
- If there is no booking data supporting “Most popular,” use “Recommended” for
  Essential instead. Confirm this before changing the site's claim.
- Consider rendering public page content at build time. Currently the document
  has metadata but the page body depends on JavaScript; this limits visitors
  without JS and some crawlers.

## Validation

- `npm run build`: TypeScript, route documents, metadata, gallery row validation,
  255 advertised image candidates and production bundling.
- `npm run test`: six regression tests using jsdom and mocked network requests.
- `git diff --check`: no whitespace errors.
- CI now runs the regression tests after its production build and before the
  existing Chrome layout gate. The Chrome gate was not run in this chat because
  the required browser tool was unavailable.

This report was written before publication. GitHub Actions and this chat record
the subsequent deployment status.
