# Editorial refresh — visual QA

**Final result: passed** for the review build. Owner approval and the live-device/integration checks listed below remain separate.

## Visual truth and evidence

Primary aesthetic truth: `/workspace/design-reference/SHUTTERHAUS_Master_Design_Spec_v1/assets/reference/01-primary-reference.png` (1586×992 pixels, a framed desktop/mobile design board, not a browser viewport).

Supporting route references: `assets/screenshots/{home,portfolio,about,services,contact}-{desktop-1440,mobile-390}.png` in that extracted package. Their prototype includes a 64px study header/stage that is removed in comparison boards. They use proposed copy and generated illustrative images; those are intentionally replaced by current repository copy and original work.

Implementation: `review/after/{route}-{width}.png`. CSS viewports 320, 390, 430, 768, 1024, 1440, 1920; deviceScaleFactor 1. Heights 844 mobile, 1000 desktop, with full-page screenshots preserving page length. Touch/mobile emulation is used below 760px. Images/font decoding and reveal completion are awaited; animations are disabled for stable screenshot capture.

Combined full-view evidence: `review/comparisons/home-primary-reference.jpg` and all ten `review/comparisons/{route}-{390,1440}-reference.jpg` boards. Primary desktop content is cropped to its 925×886px site region; the 1440×1379 implementation region is resized to that same comparison measure. This is composition normalization, not a claim of identical source viewport geometry. Route comparisons use matching 390/1440 CSS widths at density 1, then equal display scaling.

Before/after evidence: ten `review/comparisons/{route}-{390,1440}-before-after.jpg` boards. Portable full-page images are in `review/evidence/`, and an interactive image viewer is in `review/index.html`.

Focused evidence: `review/after/home-final-inspection.jpg`, `services-final-inspection.jpg`, `contact-final-inspection.jpg`, and `portfolio-inspection.jpg`. These were inspected for actual header/type, photograph crop, package photo stages, active nav and form geometry. Full-view and focused source/implementation images were viewed together during the comparison pass.

## Comparison history and corrections

1. **P2 — Desktop hero copy started too low.** `review/iteration-1/home-1440.png` placed the eyebrow/heading roughly 146px below the photo top. The primary reference aligns copy much closer to the photo's upper edge. Changed `.hero__body` to top alignment with a 36px inset and enlarged the desktop headline. Final Home capture shows a deliberate shared upper alignment; responsive text checks pass.
2. **P2 — Motif panel was too short.** Initial hero arc art occupied only the upper part of its tall panel. Extended the supplied SVG's display stage to 440px on desktop, preserving a separate metadata panel and small mobile detail. Final Home and Services captures retain the reference's narrow geometric counterweight.
3. **P2 — Desktop selected-work section dominated page length.** Initial two-column desktop strip was too long relative to the reference. Reused the height-aware packer with three desktop columns, two at smaller widths, and all six approved frames. Final Home has a shorter editorial sequence without discarding curated images.
4. **P2 — Services landscape images left excessive unused stage height.** Initial 4:5 card image stage reserved large blank areas beneath landscape sources. Reduced desktop stage to 3:2 and contain-fit actual photographs. Mobile uses natural image proportions. Final Services comparison shows aligned compact image stages while preserving every original frame.
5. **P2 — Menu and field focus states were incomplete.** Fixed immediate drawer visibility before focusing its first link; trapped/returned focus; added form-specific visible focus selectors. Tests cover 320/390/768/1000 menu widths, Escape/scrim dismissal and desktop teardown.
6. **P2 — Skip link and recovered package had route/state regressions.** Skip links now focus the content without modifying legacy hashes. Reload preserves a visitor's changed package selection. Both have browser regression tests.
7. **Capture issue — Blank full-page image evidence.** Normal viewport inspection confirmed loaded images; increased capture settling time and disabled animations before final full-page capture. Final evidence has actual rendered images, and all 35 capture measurements report no broken media.

## Required fidelity surfaces

| Surface | Evaluation |
|---|---|
| Fonts and typography | Licensed self-hosted EB Garamond display and Inter interface match the supplied token candidates. Natural casing, tracked small labels, restrained serif weights and controlled wrapping remain consistent. Existing longer copy requires different line breaks from the illustrative prototype; no clipping at any required width. |
| Spacing and layout rhythm | Three-part desktop Home, split tablet and deliberate stacked mobile; white header, hairlines, square controls and aligned photo/motif regions. Portfolio uses its established real gallery flow. About prioritizes the actual full portrait; Services and Contact accommodate full real details. |
| Colours/tokens | White/ivory/ink/slate system; no added bright accents, gradients, shadows or decorative UI effects. Existing original colour work remains visible in the actual portfolio and strip; hero and selected supporting photos establish monochrome restraint. |
| Image quality/assets | Supplied wordmark and quarter-circle SVGs are used. All studio photos come from the repository's real responsive derivatives, with intact sources and meaningful alt text. Authentic photographer image is retained; card photographs are contain-fitted to protect their complete framing. No generated client work is shipped. |
| Copy/content | Repository identity, biography, location/hours, real package benefits and booking terms are authoritative. Social is R3,500 as explicitly requested. Existing Home headline is retained; no new categories, testimonials, phone link, Journal route or response-time promise. |

## Accepted constraints and owner decisions

- Real photographs and original colour work differ from the concept's illustrative monochrome faces.
- “Timeless Portraiture” is intentionally two lines; proposed concept copy remains for an explicit owner decision.
- Home retains six curated images instead of four illustrative category tiles.
- About shows the authentic full frame, including the photographer's environmental composition; it does not imitate a concept client's close-up.
- Portfolio keeps actual 30-frame curation/order without invented filters or a duplicate feature-photo introduction.
- Full package benefits require more vertical content than the abbreviated prototype. Contain-fitted tall card images intentionally have side breathing space.
- Existing business availability differs from illustrative prototype claims and is retained.
- The supplied logo is editable text with fallback geometry; an outlined master is a later branding deliverable.

## Verification and practical limits

The browser tests cover primary navigation, visible/inert menu states, lightbox opening/stepping/Escape/focus, enquiry package selection, draft reload/rotation, validation/honeypot, mocked send/error/retry/duplicate prevention, correct success clearing, route SEO and media semantics. The existing public CDP gate and available admin probes passed. All final route/viewport captures report no overflow, broken images or page exceptions.

Live Google login, authenticated database writes, real inbox delivery and physical iOS Safari were not exercised. These are integration/device test gaps, not claims of passed live verification. No production deployment occurred.

## Implementation checklist

- [x] Inspect actual source and rendered implementation evidence.
- [x] Normalize source framing/density and compare all five pages at 390/1440.
- [x] Correct actionable visual and interaction findings, recapture and compare.
- [x] Verify all seven viewport widths, keyboard states, media and SEO.
- [x] Preserve real source images, data contracts and package terms.
- [x] Prepare branch, diff, before/after screenshots and local review instructions.
- [ ] Owner design approval, followed by separately authorized rollout and live-device/integration verification.

No unresolved P0/P1/P2 implementation findings remain in the reviewed build. Remaining P3 work: outline approved logo geometry and optionally adopt the concept headline after owner review.

final result: passed
