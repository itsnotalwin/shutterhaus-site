# Shutterhaus Visuals

Photography portfolio for Alwin Newman, based in Kempton Park, Gauteng.
**Production:** <https://shutterhausvisuals.co.za>

Vite and TypeScript generate five static public pages. Supabase supplies the
published photo selections, image storage and Google-authenticated photo manager.
GitHub Actions verifies the build before publishing it to GitHub Pages.

## Source of truth

Use `main`, the project's only active branch. Before a production pass, fetch
`origin/main` and compare it with the commit served by `/release.json` on the
live domain. Review the actual deployed pages before proposing visual changes.
Do not use historical screenshots or an older checkout as the approved design.
Branch recovery tags are recorded in [docs/BRANCH_CONSOLIDATION.md](docs/BRANCH_CONSOLIDATION.md).

The approved public site uses Bodoni Moda headings, Inter body text, a white
editorial layout, geometric artwork and monochrome photography. Home begins
“Portraits worth keeping.” The current About page has one photograph with no
caption. Preserve these choices during maintenance.

## Run locally

Requires Node 22 or newer and Python 3. Pillow is needed only for image tools.

```sh
npm ci
cp .env.example .env   # optional: add the public Supabase connection values
npm run dev
```

Without connection values, public pages use the bundled photographs. The admin
requires a configured connection and an authorised account. Never put a
service-role or secret key in a `VITE_` variable: these values ship to the browser.

```sh
npm run build         # typecheck, generate pages, validate gallery assets, bundle
npm test              # public interactions and admin draft regressions
npm run preview       # production build at http://127.0.0.1:4173
npm run probe:packer  # gallery packing edge cases
```

## Verification

The Playwright suite covers public layouts, keyboard controls and scrolling
photograph frames. Install WebKit once for Safari engine coverage:

```sh
npx playwright install --with-deps webkit
npm run test:browser
```

Chromium defaults to `/usr/bin/chromium`; set `CHROME_BIN` for another installation.
Tests start the preview automatically when needed. Use `CAPTURE_REVIEW=1` to
save public screenshots under `shots/public/`. WebKit is useful engine coverage,
but does not replace testing on the affected physical iPhone.

The CDP checks also exercise the admin with mocked I/O. Start a separate Chrome
instance with debugging enabled and keep the preview server running:

```sh
chromium --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/tmp/shutterhaus-chrome about:blank
```

In another terminal:

```sh
OFFLINE_GALLERY=1 REVIEW_WIDTHS=320,390,430,768,1024,1440,1920 npm run verify
npm run verify:controls
npm run verify:admin
```

The uploaded-gallery admin check needs a configured build so that the public
client makes requests for the test to intercept. For offline local verification:

```sh
VITE_SUPABASE_URL=https://offline-test.supabase.co VITE_SUPABASE_ANON_KEY=offline-test npm run build
```

Never deploy that test build; rebuild normally when finished. Enquiry tests
intercept delivery and do not send messages. Admin tests mock authentication and
database/storage I/O while exercising the real UI and browser image preparation.
They do not establish production account permissions or inbox delivery.

### Check the live site

**Actions → Production visual audit → Run workflow** captures production in
Chromium and WebKit. To run the read-only audit locally:

```sh
CHROME_BIN=/usr/bin/chromium node tools/review/audit-production.mjs
```

It records the deployed release, screenshots, image/frame measurements and
navigation checks in `shots/production-audit/`. Set `AUDIT_WIDTHS`,
`AUDIT_OUT`, `LIVE_URL` or `BROWSER_ENGINE=webkit` as needed. Environments requiring
an outbound proxy can set `AUDIT_PROXY` to their configured proxy address.
The audit never signs in, publishes gallery changes or submits an enquiry.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/main.ts` | Public route rendering and live gallery updates |
| `src/layout.ts`, `src/pages.ts`, `src/pages-more.ts` | Header, footer and page renderers |
| `src/navigation.ts`, `src/contact-form.ts`, `src/lightbox.ts` | Menu, enquiry and photo-viewer behavior |
| `src/booking-band.ts` | Shared booking section |
| `src/config.ts`, `src/pricing.json` | Brand/contact defaults and numeric ZAR package facts |
| `src/seo.json`, `src/seo.ts` | Metadata and client updates |
| `src/public.css`, `src/styles.css`, `src/fonts.css` | Approved public presentation, base rules and self-hosted fonts |
| `src/admin.ts`, `src/admin.css` | Photo manager |
| `src/gallery-model.ts`, `src/rows.ts`, `src/composition.ts` | Drafts, bundled order and published selections |
| `src/store.ts`, `src/supabase.ts` | Database, storage and authentication access |
| `public/` | Shipped photographs, brand artwork, fonts, icons and hosting files |
| `tools/` | Repeatable generation and verification tools |
| `tests/` | Browser regressions and explicit fixtures |
| `supabase/` | Schema, composition setup and migrations |
| `docs/` | Operational guidance and branch recovery records |
| `.github/workflows/` | Build, deployment and live visual audit |

Root public HTML files are generated build inputs. Edit the renderers or metadata
and run `npm run pages`; do not edit generated markup. `interleave-order.json`
supplies the bundled gallery curation. Preserve photo originals, responsive
derivatives and font licences.

Keep captures, measurement dumps, temporary review notes and mockups in ignored
`shots/` or outside the repository. CI retains evidence as workflow artifacts.
Historical release notes and screenshots remain recoverable in Git history.

## Editing content and photographs

Use `src/config.ts` for contact information, availability, social links, biography
and bundled photo defaults. `src/pricing.json` supplies Services, Contact, Home and
search metadata. The current packages are Starter R800, Essential R2,000,
Signature R2,500 and Social R3,500; edit the JSON rather than duplicating prices.

`src/public.css` owns the current editorial design. Preserve the deliberate
monochrome treatment, crop positions, photograph order and geometric artwork.
Apply grayscale once per gallery image; avoid adding filters to its wrappers.
See [Safari photograph guidance](docs/SAFARI_IMAGE_LAYOUT.md) before changing
photo positioning or compositing.

For bundled photographs (requires Pillow):

```sh
python tools/add-photos.py /path/to/shoot --dry-run
python tools/add-photos.py /path/to/shoot
python tools/make-derivatives.py
python tools/rows.py
npm run build
```

The importer refuses existing files. Derivatives supply responsive image sizes;
originals remain available to the viewer. Missing advertised candidates fail
the build. Prefer the admin for normal publication changes.

## Photo manager

Open `/admin.html` and sign in with an authorised Google account. Upload through
**Photo library**, choose a destination, and add photographs to the page. In
**Page editor**, drag to reorder or use the arrow buttons. Replace and Remove
change the page selection while retaining the original in the library.

Drafts stay in the current browser tab. Preview, then **Publish changes** to save
library metadata and page positions in one transaction. Failed publication keeps
the draft for retry. Concurrent publication raises a revision conflict instead
of overwriting another session. **Discard draft** reloads published data.

Uploads are resized to a maximum edge of 1800px and encoded as JPEG. Add accurate
image descriptions. To delete an uploaded file permanently, hide it and publish
first. Bundled originals remain in the library.

## Supabase setup

For a new project:

1. Run `supabase/schema.sql`, then `supabase/composition.sql` for the composition
   table, policies and bundled selections.
2. Apply `supabase/migrations/20261006193000_gallery_publishing.sql` for
   transactional publishing and revision checks.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` locally.
4. Create a Google OAuth web client with callback
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` and enable Google in
   Supabase Authentication with its client ID and secret.
5. Keep admin emails aligned in `src/config.ts` and the database `is_admin()`
   function. The client list controls the UI; database policies enforce access.

Do not reapply initial photo seeds over an existing project's published choices.
Apply the publishing migration before deploying the photo manager.

## Behavior constraints

- Keep the four-photo Home showcase and bundled hero unless deliberately changing
  the Home route. Published admin selections can override the bundled photos.
- Portfolio has 30 bundled frames in three packed desktop columns and two phone
  columns. Phones initially show ten with an accessible disclosure for the rest.
- Retain the current crops on editorial images and package portraits. Portfolio
  frames keep their natural ratios; package landscapes are shown in full.
- The compact menu is used through 1000px. Height-only viewport changes must not
  rebuild pages. Rotation must retain enquiry drafts and package choice.
- Contact drafts last up to 24 hours in tab session storage and clear after a
  successful send. `contact.formEndpoint` controls delivery; an empty value uses
  the email-app fallback.
- Public content and navigation remain usable without JavaScript. Keep admin
  `noindex`, omit it from the sitemap, and let crawlers read that directive.

## Deployment and operations

Pushes to `main` and manual runs verify and deploy; pull requests only verify.
Set repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the
public production connection values. Production builds fail if either is absent. Pull-request verification can use
non-production placeholders because gallery I/O is intercepted by the tests.

The exact verified `dist/` artifact is deployed. Chromium and WebKit scrolling
checks gate publication, and the live WebKit job checks the deployed site afterward.
`tools/verify-live.mjs` verifies the live release commit, pages and assets.
`BASE_PATH=./` supports both the custom-domain root and a Pages project subpath.

Set the Pages custom domain to `shutterhausvisuals.co.za`, matching `public/CNAME`.
DNS uses all four GitHub Pages A records for `@`:
`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
Point `www` to the apex with a CNAME and verify HTTPS for each shared hostname.
`public/_headers` is not honoured by GitHub Pages.

Search setup is documented in [docs/google-search.md](docs/google-search.md).
