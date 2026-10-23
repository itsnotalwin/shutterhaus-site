# Public visual system

White editorial pages, Bodoni Moda headings, Inter body/UI, monochrome portfolio
photography and the existing geometric artwork. Desktop uses a full-width white
shell with fluid 32–56px gutters and content bounded only above 1920px. This
removes the former grey outer bars. A compact 96px header and aligned copy, photo
and artwork columns establish the grid. The hero headline tops out at 112px with gentler tracking;
the photograph uses its intrinsic aspect ratio, contained without a desktop crop,
and stays below 760px tall. Supporting copy stays around 34 characters per
line. Selected work uses portrait frames and 16px gaps. Inner-page introductions
share a fluid 440–600px photo height. Session cards retain all four packages and facts.

The desktop hero uses a .95/1.7/.4 grid, giving photography more of the horizontal
space. The complete vertical artwork shares the hero's available height, with
the existing small brand line below it. Phones retain their fullscreen cover,
typography, navigation and touch gallery. The horizontal artwork keeps its native
1010/389 ratio; tablets now show it too. Viewer captions display position counts;
descriptive image alt remains available to assistive technology.

Hero asset `27-img-0297.jpg` was verified against the published composition and
live browser on 2026-10-21; the preview and live selection match. Different crops
made it appear different. Retain live-admin photo selection behavior.

Research: [NN/G homepage principles](https://www.nngroup.com/articles/homepage-design-principles/)
supports an obvious offer and action; [image-focused design](https://www.nngroup.com/articles/image-focused-design/)
supports balancing a strong photograph with navigation and actions. The hero
remains eager and high priority, following [web.dev LCP guidance](https://web.dev/articles/optimize-lcp).

Capture route `/`: `SCREENSHOT.png` is the 1440×900 desktop viewport;
`SCREENSHOT-MOBILE.png` is the full phone page at a 390×844 viewport. Capture date
2026-10-23, from [rendered CI evidence](https://github.com/itsnotalwin/shutterhaus-site/actions/runs/39977888626).
The captured Home and phone presentation is unchanged by the final inner-page
artwork-height and Sessions headline-wrap corrections. Desktop and phone views
of all five public routes were inspected, plus Home at 1920px and About at 1024px.

Desktop refinement, 2026-10-23: the five live public pages were visually reviewed.
Inner-page artwork now occupies a proportionate column and centers alongside
the photograph. About removes the duplicated top inset and sizes its photo
column to the portrait instead of leaving empty space inside a wide frame.
Shared package rows align prices, specifications, descriptions, inclusions and
booking controls while retaining the natural landscape and portrait frames.
Desktop Contact places Name and Email beside each other and uses clearer field
borders; on viewports at least 800px tall its enquiry panel stays in view while
reading the left column. Footer text is slightly larger. All changes are scoped
to widths above 1000px; the approved phone/tablet rules remain intact.

Validation: production build and 22 DOM interaction tests pass; the mechanical
CSS scan has no findings. Release 9dce8cf passed the seven-width public verifier,
public/admin controls and both Chromium and WebKit photo-layout jobs. Current
root/source captures replace the 21 October images. The final inner-page
corrections are checked by the same gated workflow before publication. Local
Chromium is absent and the cloud browser cannot access the local preview;
rendered CI evidence and live public inspection provide visual verification.
Inherited documentation gaps in untouched folders remain separate backfill work.
