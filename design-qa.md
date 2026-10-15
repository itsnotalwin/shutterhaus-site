# Revision 2 — visual comparison status

**Owner visual approval: pending. The first build's acceptance claim is withdrawn.**

The first build passed functional checks but diverged materially from the supplied compositions. It retained old headings, used a softer serif, altered page structures, showed colour-first work tiles, used a heavy black recommendation card and a white dropdown menu. Those were visible differences, not acceptable substitutes for the requested mockups.

## Source and current evidence

- Primary: `/workspace/design-reference/SHUTTERHAUS_Master_Design_Spec_v1/assets/reference/01-primary-reference.png` (1586×992 framed design board).
- Supporting: the supplied desktop/mobile page boards and `assets/screenshots/{route}-{desktop-1440,mobile-390}.png`.
- Current browser captures: `review/after/{route}-{width}.png`, all five pages at 320/390/430/768/1024/1440/1920; density 1; mobile/touch emulation below 760px.
- Combined comparisons: `review/comparisons/{route}-{390,1440}-reference.jpg` and `home-primary-reference.jpg`.
- Viewer: `review/index.html`, defaulting to mockup/revised-build comparison.

Prototype study headers are cropped away. The primary desktop region is 925×886; its comparison is normalized against an equal display measure of the implementation. Primary mobile Home and Portfolio regions are cropped from their phone panels and normalized to 390 CSS pixels. This enables composition comparison; it is not a claim that a raster mockup defines a measured runtime viewport.

Both source and current implementation were opened and examined. Focused checks covered the three-line Home heading, hero/photo/motif tracks, mobile Portfolio title/photo/caption sequence, About story structure, package card photo crops, Contact heading/form and mobile menu.

## Corrections made

| Earlier difference | Revision |
|---|---|
| Old two-line “Timeless Portraiture” | Exact three-line “Portraits / worth / keeping.” |
| Soft EB Garamond shape | Licensed high-contrast Bodoni Moda |
| Different headline/photograph proportions | Taller photo, larger headline, equal statement/photo balance and narrow full-height motif |
| Long three-column colour-first Home gallery | Four-up monochrome tiles; six original curated sources preserved |
| Portfolio title over an undifferentiated wall | Introduction/feature composition; mobile photo and caption follow the heading directly |
| About biography beside one image only | “Behind the lens.” introduction plus separate landscape/biography and value blocks |
| Black recommended package and padded image stages | Light bordered recommendation, compact monochrome photo windows and full real details |
| Old Contact headline and ivory form panel | Mockup invitation and plain white form |
| White dropdown navigation | Dark full-screen serif menu, with existing keyboard/focus protections |

## Fidelity surfaces

**Typography:** revised display face has the stronger stroke contrast and compact editorial rhythm of the primary reference. Mockup wording and explicit line breaks are used. The exact original type file is unavailable, so no exact-font match is claimed.

**Layout/spacing:** Home now follows the primary split scene; Portfolio mobile follows title → large image → caption → supporting images. About and Services use the corresponding reference introductions. Contact is a white split layout with editorial details. All seven widths are rendered and checked.

**Colours/assets:** monochrome photography is a reversible display treatment. Source image bytes are intact; colour remains available in hover/lightbox. Supplied SVG wordmark and arc assets are used. Flat SVG grain does not reproduce every texture detail in the primary raster artwork.

**Images:** real pinned Home and About sources, actual curated work, service photographs and meaningful alt text are preserved. The Contact family image retains its complete framing. No illustrative/generated faces are presented as studio work.

**Content:** reference headlines and section structure are adopted. Current real business details, all six Home images, thirty gallery frames, full package benefits/terms and Social R3,500 remain authoritative.

## Acceptance and limits

Functional verification is recorded in `review/TEST_TRANSCRIPT.txt`; it is separate from aesthetic acceptance. The revised screenshot set is ready for the owner's comparison. Real photo subjects, the authentic environmental photographer portrait, complete package details, unspecified exact font geometry and SVG/raster texture differences remain visible constraints.

The owner rejected the first match. This report does not grant owner approval to the replacement. No deployment or merge has occurred.

final result: blocked

Blocking item: owner visual acceptance of the revised comparison set is pending. Implementation and functional evidence have been prepared for that review.
