# Public visual system

White editorial pages, Bodoni Moda headings, Inter body/UI, monochrome portfolio
photography and the existing geometric artwork. Desktop uses a full-width white
shell with fluid 32–56px gutters and content bounded only above 1920px. The
compact 96px header remains the navigation baseline.

The Home desktop hero has two columns, split .43/.57 with 48px between them
(32px at compact desktop widths). The complete photograph leads the right
column, uses its intrinsic aspect ratio and stays below 760px tall. The left
column groups a two-line “Portraits / worth keeping.” heading, supporting copy
and booking controls. The display scale runs from 56px to 96px. The actual
horizontal artwork sits below that group with the small People / Places /
Stories line beside it; it no longer competes with the photograph as a tall
third column. Artwork remains complete at its native 1010/389 ratio. The
`motif` renderer accepts a horizontal variant for Home only; inner pages retain
their responsive artwork selection. The existing heading break returns below
1001px, retaining the approved three-line phone cover and tablet heading.

Phones retain their fullscreen cover, typography, navigation and touch gallery.
The phone/tablet CSS preceding the desktop block is unchanged. Selected work
uses four portrait frames with 16px desktop gaps. Inner-page introductions share
a fluid 440–600px photo height. Session cards retain all four packages and facts.
Viewer captions display position counts; descriptive image alt remains
available to assistive technology.

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

Hero follow-up, 2026-10-23: the owner identified the Home hero as still needing
work after the broader desktop pass. The current implementation replaces the
crowded three-column hero with the composition described above. The earlier
Home captures listed above document the preceding release; new captures and
rendered breakpoint verification will be recorded after the gated build.
