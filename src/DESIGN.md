# Public visual system

White editorial pages, Bodoni Moda headings, Inter body/UI, monochrome portfolio
photography and the existing geometric artwork. Desktop uses a full-width white
shell with fluid 32–56px gutters and content bounded only above 1920px. This
removes the former grey outer bars. A compact 96px header and aligned copy, photo
and artwork columns establish the grid. The hero headline tops out at 120px with gentler tracking;
the photograph uses its intrinsic aspect ratio, contained without a desktop crop,
and stays below 760px tall. Supporting copy stays around 34 characters per
line. Selected work uses portrait frames and 16px gaps. Inner-page introductions
share a 500px photo height. Session cards retain all four packages and facts.

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
2026-10-21, from [rendered CI evidence](https://github.com/itsnotalwin/shutterhaus-site/actions/runs/39505896205).
All five pages were inspected at desktop and phone sizes; Home was also inspected
at 1024, 1920 and tablet widths. No additional UI corrections were needed.
The mechanical detector's one warning is intentional: the hidden photo-viewer
image has no source until a real selected photograph is opened.

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

Current validation: build and 22 DOM interaction tests pass; mechanical CSS scan
has no findings. Local browser tests cannot launch because Chromium is absent,
and the cloud browser cannot reach the local preview. The committed captures
above still show 2026-10-21; refresh them from this release's rendered CI evidence
after the gated browser checks, then inspect the deployed pages.
