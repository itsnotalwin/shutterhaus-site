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

Capture route `/`, viewport targets 1440×900, 1920×1080 and 390×844; capture date
2026-10-21. Updated `SCREENSHOT.png` and `SCREENSHOT-MOBILE.png` are pending the CI
capture pass. The local preview browser remains blocked, so CI and the live
browser provide actual render evidence. Do not claim visual verification until
those captures have been inspected.
