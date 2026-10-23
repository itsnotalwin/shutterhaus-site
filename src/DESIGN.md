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

Capture route `/`, date 2026-10-23, UI commit `3654d2e`: `SCREENSHOT.png` is the
1440×900 desktop viewport; `SCREENSHOT-MOBILE.png` is the full phone page at
viewport 390×844. These are genuine captures from [run 39988308443](https://github.com/itsnotalwin/shutterhaus-site/actions/runs/39988308443).
The mobile PNG is byte-identical to the preceding reviewed capture, and the
393px browser comparison is pixel-identical before and after. Home was also
visually inspected at 1024px, 1920px and in the live desktop browser. The full
photograph, two-line desktop heading, complete artwork and absence of horizontal
overflow were confirmed. Header, gallery and inner-page rules remain intact.

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

Validation: production build and all 22 DOM interaction tests pass. The CSS
mechanical scan reports no findings. Run 39988308443 passed the seven-width
public verifier, public/admin controls, Chromium and WebKit photo-layout jobs,
GitHub Pages deployment with release-SHA confirmation and live Safari scrolling.
Local Chromium is absent and the cloud browser cannot access the local preview;
rendered CI evidence and live public inspection provide visual verification.
The evidence commit changes documentation and captures only. Inherited folder
context gaps outside this visual scope remain separate backfill work.

Hero follow-up, 2026-10-23: the owner identified the Home hero as still needing
work after the broader desktop pass. This composition supersedes that pass's
three-column hero and 112px heading cap; it does not imply owner approval of the
new result. Preserve the current photograph selection and successful phone
cover in later refinements.

Sessions image follow-up, 2026-10-23: the owner flagged mixed package image
heights and crops. Above 1000px, all four images now share a 3:2 landscape frame
with `object-fit:cover`. `pages-more.ts` supplies `--desktop-focal` from the
existing package curation fields: Starter/Signature center, Essential 50% 18%,
Social 50% 0%. This supersedes the earlier desktop rule that kept separate
landscape and portrait frame shapes. The family image retains every face; the
portrait crops are composed around the face and upper body. Shared subgrid rows
keep image edges and package details aligned. Phone/tablet frame rules, photo
choices, pricing, package terms and booking links are unchanged.

The rendered verifier now checks equal 3:2 desktop frame sizes and aligned top
and bottom edges; it retains the existing phone/tablet framing checks. It also
captures the desktop package section at 1024, 1440 and 1920px for review. Updated
Sessions captures will replace the representative evidence after browser QA.
