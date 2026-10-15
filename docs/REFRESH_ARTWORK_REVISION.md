# Revision 3 — reference artwork

The owner rejected revision 2 because the artwork did not match the approved mockup. This revision changes the decorative artwork and its layout only.

## Source and implementation

Primary source: `assets/reference/01-primary-reference.png` in the supplied design package. Its narrow desktop panel uses a split circular head, interlocking asymmetric arcs, black and ash ink, ivory negative space and pronounced irregular grain. The previous `arc-grid.svg` was a flat, differently arranged approximation.

Two assets were generated with the primary reference attached: `public/brand/editorial-arcs-vertical.webp` and `editorial-arcs-horizontal.webp`. The originals remain in `/workspace/generated_images/`. WebP derivatives are about 253 KB combined. They are decorative brand artwork, never substituted for photographs. The original supplied SVGs remain preserved, but are no longer displayed in the public artwork placements.

`src/layout.ts` selects the separate horizontal asset on mobile through a picture source. `src/public.css` preserves the tall silhouette and positions the People / Places / Stories metadata in its lower negative space. Inner-page panels use contain instead of cutting through the artwork. Menu and footer share the horizontal composition.

## Review

See `review/comparisons/artwork-reference-revision.jpg` for source and rendered desktop/mobile details, and `review/index.html` for all five pages. These are reconstructions, not pixel-identical extractions: individual grain marks and minor curve proportions differ. Owner visual acceptance remains pending. Nothing has been pushed, merged or deployed. Social stays R3,500.
