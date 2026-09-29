# Shutterhaus Visuals

Photography portfolio rebuilt from the Van André Rensburg reference: white chrome,
heavy wordmark, and a gallery of three independently-scrolling monochrome columns.
Static site (Vite + TypeScript, no framework) with a Google-authenticated admin
gallery backed by Supabase.

- **Site** — three columns, each scrolling on its own. Click any image for a
  full-size lightbox (arrow keys to move, Esc to close).
- **Admin** at `/admin.html` — sign in with Google, drop in images, reorder them,
  alt-text them, and choose which are live. Only `itsnotalwin@gmail.com` gets in.

---

## 1. Run it locally

```bash
npm install
cp .env.example .env      # fill in after you create the Supabase project
npm run dev               # http://localhost:5173
```

Works immediately with placeholder images from `src/demo.ts`. Supabase only needs
connecting when you want to upload real work. Without a `.env` the site runs
entirely off demo data — nothing breaks.

```bash
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build locally
```

`npm run build` is `tsc --noEmit && vite build`, so **a type error fails the
build** — including the Cloudflare build (see §6). `npm run verify` runs a
post-build smoke check.

---

## 2. Connect Supabase (one-time, ~10 minutes)

Supabase gives you the database, the image storage and Google sign-in in one place,
free tier is plenty for a portfolio.

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste in `supabase/schema.sql` → **Run**.
   This creates the `photos` table, the public `photos` bucket, and the Row Level
   Security policies that restrict all writes to your email.
3. **Project Settings → API** → copy the Project URL and the `anon` public key.
4. Copy `.env.example` to `.env` and paste both values in.
5. Restart `npm run dev`.

The anon key is safe to commit — it is public by design, and RLS is what actually
protects your data. Never put the `service_role` key in `.env`; it bypasses RLS.

---

## 3. Turn on Google sign-in

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   project (or pick an existing one).
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.**
3. Under *Authorized redirect URIs* add exactly:
   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```
4. Copy the Client ID and Client Secret.
5. Supabase → **Authentication → Providers → Google** → enable, paste both, **Save**.

Your Google account's email must be on the account that owns the OAuth client.
Supabase will not hand you a verified email otherwise.

### Restricting who can get in

Only these addresses can sign in *and* only they pass the database policies:

- `src/config.ts` → `ADMIN_EMAILS` — the client-side gate
- `supabase/schema.sql` → `is_admin()` — the real gate, enforced by Postgres

Add yourself (or a second admin) to **both** — the email list in the SQL is marked
with a comment. Editing only the TypeScript file changes who sees the admin screen
but does not grant database access.

The admin lives at `/#/admin` (and at `admin.html` directly). Sign-in is Google
Identity, then the allowlist is checked before the gallery loads — no allowlisted
email, no access, regardless of Google auth. Until both the allowlist and the
Google provider are set up, the admin loads and then refuses.

---

## 4. Upload your first photos

Go to `/admin.html` → **Continue with Google**. Drop images onto the dashed panel.
New uploads start **hidden** so nothing goes live by accident — review them, then
hit **show** on the ones you want.

Order in the admin is the order visitors see. The **←** **→** buttons move an
image; **hide** keeps it in your library but off the site; **delete** removes both
the row and the file.

---

## 5. Edit the site content

Everything about the branding lives in **`src/config.ts`**:

| What | Where |
| --- | --- |
| Wordmark | `nameTop` / `nameBig1` / `nameBig2` |
| Monochrome look on/off | `blackAndWhite` |
| Nav items | `nav` |
| Instagram / WhatsApp links | `social` |
| Email, phone, location, hours | `contact` |
| Contact form endpoint | `contact.formEndpoint` |
| About paragraph | `blurb` |

Leave `contact.formEndpoint` empty and the form opens the visitor's email app. Paste
in a [Formspree](https://formspree.io) or [Basin](https://usebasin.com) endpoint and
it posts to that instead.

Videos are edited in `src/demo.ts` (`DEMO_VIDEOS`) — host the files on Supabase
Storage or Cloudinary and paste the URL. Keeping them in the repo means no extra
hosting bill.

---

## 6. Deploy — GitHub Pages (current) / Cloudflare Pages (alternative)

**Current: GitHub Pages.** `.github/workflows/deploy.yml` builds on every push to
`main` and publishes through `actions/deploy-pages`. The site is live at
`https://shutterhausvisuals.co.za`. See "Custom domain: GitHub Pages + HostAfrica"
below for the DNS and cert setup — that is the path you are on.

> **Private repo.** GitHub Pages does not host private repositories on a free
> plan, which is why the Cloudflare path existed first. This repo now deploys via
> GitHub Pages, so either it is public, or the account has a paid plan. Check
> before assuming the private repo is the blocker again.

### Cloudflare Pages (alternative, not in use)

The remaining subsections describe a Cloudflare Pages deploy, which is **not the
current setup**. Keep them only if you deliberately migrate.

Cloudflare Pages builds from the same private GitHub repo, so keep the repo
private; do not make it public just to host it.

> **Note on UI labels.** Cloudflare's dashboard moves things around. The flow below
> is described plainly, but exact button wording ("Connect to Git", "Set up a custom
> domain") can drift between dashboard versions. If a label is not there, it is
> almost certainly one nesting level off — follow the flow, not the string.

### Project settings

On the Pages project, the build configuration is:

| Setting | Value |
| --- | --- |
| Framework preset | None (Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(blank — the repo root)* |

Leave **root directory blank** because `package.json`, `index.html` and
`admin.html` all sit at the repo root. Setting it to a subfolder would break the
build.

**Node version.** Cloudflare's build image ships its own default Node version, and
that default changes over time. Pin it rather than inheriting it: set an
environment variable `NODE_VERSION` to `22` (matching local Node v22 and the Vite 7
requirement) in the project's environment variables.

### Environment variables

Set these in the Pages project (Settings → Environment variables, or equivalent):

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your Supabase `anon` public key |

These are **build-time** values, baked into the bundle — that is why the anon key
is safe to put here. RLS is the actual gate. Never set the `service_role` key.
Apply them to both **Production** and **Preview**.

Without the two `VITE_SUPABASE_*` values the site still builds and still runs, it
just falls back to the demo grid.

### Connecting the private GitHub repo

1. In the Cloudflare dashboard, go to **Workers & Pages** in the sidebar.
2. Create a new Pages project. The create screen offers **Pages** alongside
   Workers — pick the **Pages** one and choose the option to connect a Git
   repository (**"Connect to Git"**).
3. You will be sent to GitHub to authorise the Cloudflare app. **This is the step
   that makes private repos possible** — grant access either to all repositories or
   to selected repositories, and make sure `itsnotalwin/shutterhaus-site` is among
   them. If you chose "selected" and later cannot find the repo, the authorisation
   simply did not include it; re-authorise with the repo ticked.
4. Back in Cloudflare, pick the repo, then set the build settings from the table
   above. The first deploy runs as soon as the project is created.

Subsequent deploys are automatic: every push to `main` triggers a build.

### Attaching the custom domain

1. In the Pages project, open the **Custom domains** tab and use the option to add
   a custom domain (**"Set up a custom domain"**), then enter the apex domain, e.g.
   `example.co.za`.
2. Cloudflare then tells you what DNS records it needs:
   - **If the domain's nameservers already point at Cloudflare**, nothing manual is
     required — Cloudflare creates the `CNAME` to `<project>.pages.dev` itself.
     Just wait for it to verify.
   - **If the domain is hosted elsewhere**, add the `CNAME` record Cloudflare gives
     you at that DNS provider, pointing at `<project>.pages.dev`. Verification can
     take a while after a nameserver change.
3. Certificate: Cloudflare provisions and renews the TLS certificate for a Pages
   custom domain automatically. **You do not need to change the zone-wide
   SSL/TLS encryption mode for Pages to serve HTTPS** — if the same zone serves
   other proxied traffic, `Full (strict)` is the sensible zone-wide setting, but
   the Pages certificate itself is managed for you.

The `*.pages.dev` subdomain keeps working alongside the custom domain.

**One thing to do in Supabase as well.** The site's origin changes when you attach
the custom domain. In **Supabase → Authentication → URL Configuration → Redirect
URLs**, add the new origin alongside any existing entry, e.g.
`https://example.co.za/`. Otherwise auth redirects can bounce visitors back to the
`pages.dev` host or be rejected outright.

### Why there is no SPA rewrite

No `_redirects` file or `404.html` fallback is needed, and you should not add a
catch-all rewrite — it will only mask real 404s.

Routing is **hash-based**: `src/main.ts` reads `location.hash`
(`/#/photo`, `/#/video`, `/#/contact`, `/#/admin`), so every route is a single
request to `/` and the fragment never reaches the server. The one exception is the
admin, which is a real file — `#/admin` does `location.replace("./admin.html")`,
resolving to the actual `admin.html` in `dist/`.

### About `base`

`vite.config.ts` sets `const base = process.env.BASE_PATH ?? "/"`.

- **Current build (GitHub Pages, relative base): `BASE_PATH: ./`.** The workflow
  sets it, so leave it alone. One build then serves both the domain root and the
  `github.io` subpath.
- **Cloudflare Pages (custom domain or `*.pages.dev`): leave `BASE_PATH` unset.**
  The default `"/"` is correct, because the site is served from the domain root.
- **A `github.io` subpath deploy** would need `/shutterhaus-site/` — not the
  current setup, where the relative base covers both cases.
- The router is hash-based either way, so a wrong `base` only ever breaks asset
  URLs, never deep links.

### Custom domain: GitHub Pages + HostAfrica (the current setup)

> **This is the live deployment.** The site is served from
> `https://shutterhausvisuals.co.za` by **GitHub Pages**, with DNS at HostAfrica.
> Cloudflare Pages is not in use — the sections above describe it as the original
> plan, kept for reference only.

#### How it actually deploys

`.github/workflows/deploy.yml` builds with `BASE_PATH: ./` (a **relative** base, not
`/` and not `/shutterhaus-site/`) and publishes `dist/` to GitHub Pages. The
relative base is deliberate: assets resolve against the document, so one build
serves correctly at **both** the domain root and the `github.io` project subpath.
An absolute base can only be right for one of them.

The repo is private and GitHub Pages deploys it fine, because the deploy goes
through the **Actions** path (`build_type: workflow`) rather than the legacy
Pages-for-private-repos path that needs a paid plan. The old note claiming
private repos cannot use GitHub Pages does not apply to this route.

#### DNS records — all four A records are required

At HostAfrica, for `shutterhausvisuals.co.za`:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `shutterhausvisuals.co.za` |

**All four A records, not one.** GitHub Pages checks DNS and cert validation
behaves differently:

- The Pages **DNS check passes on a single A record** — it only needs to resolve.
- **ACME/TLS validation round-robins across all four IPs.** Three that do not
  answer for your domain, and the cert request fails with
  `bad_authz` ("The ACME authorization is in a bad state") while the DNS check
  still shows green.

That mismatch is the whole reason a site can look correctly configured and still
never get a certificate. If the cert is failing, count the A records first.

#### About the CNAME file

`public/CNAME` exists so the **published artifact** declares the domain
(Vite copies `public/` into `dist/`). With `build_type: workflow` the authoritative
copy of the domain is the repo's **Settings → Pages** field, so the two must agree
— they are not alternatives, and editing one does not configure the other.

#### If the certificate gets stuck in `bad_authz`

`bad_authz` does **not** self-heal, and re-saving the domain in Settings does not
clear it — GitHub keeps returning the same state. What does work:

1. Confirm all four A records are present (above).
2. In **Settings → Pages**, **remove** the custom domain (save with it blank).
   That drops the Pages config back to the `github.io` subpath and clears the
   ACME authorization state. `Enforce HTTPS` resets to on at this point.
3. **Re-add** the domain and save.

GitHub then reports **"Certificate Requested"** and retries on its own backoff.
The retry cannot be rushed — polling or re-saving does not accelerate it. Expect
several minutes to an hour, and treat a still-`bad_authz` state straight after the
re-add as normal rather than as failure.

While the certificate is pending, `Enforce HTTPS` is unavailable (GitHub blocks
the toggle) and `http://` stops redirecting to `https://`. **An existing valid
certificate keeps serving normally throughout** — the site stays up on `https://`
and only the redirect waits for the new cert. Check with:

```bash
curl -s -o /dev/null -w "code=%{http_code} ssl=%{ssl_verify_result}\n" \
  --resolve shutterhausvisuals.co.za:443:185.199.108.153 \
  https://shutterhausvisuals.co.za/
```

`ssl_verify_result=0` means the chain validates. Inspect the current state with
`gh api repos/itsnotalwin/shutterhaus-site/pages` — `https_certificate.state` and
`https_enforced` are the two fields that matter.

#### Cloudflare Pages (original plan, not in use)

Retained above for reference: GitHub Pages cannot serve a **private** repo on the
free plan via the legacy path, which is why Cloudflare Pages was chosen first. The
Actions-based deploy in `deploy.yml` sidesteps that constraint, which is how this
repo now runs on GitHub Pages while staying private.

On the Cloudflare Pages path the site would be served from the domain root, so
`BASE_PATH` would be left unset (`"/"`). The `github.io` subpath path would need
`/shutterhaus-site/` — neither applies to the current relative-base build.

---

## Image preparation

`tools/prepare-images.py` turns a raw shoot folder into web-sized JPEGs for
`public/gallery/`: longest edge → 1800px, quality 82, progressive, EXIF
rotation applied, filename lowercased and space-hyphenated. A 31MB DSLR file
drops to roughly 300KB, which is what a portfolio grid actually needs.

```bash
pip install pillow
python tools/prepare-images.py ~/shoots/2026-03-client ~/…/public/gallery
python tools/prepare-images.py <src> <out> 2400     # optional max edge
```

It accepts `.jpg .jpeg .png .webp .tif .tiff .heic`, prints a per-file size
table, and refuses to run on an empty or non-existent folder. It overwrites
same-named outputs, so keep originals somewhere else. `shots/` is gitignored.

---

## Layout

```
index.html          public site shell
admin.html          admin shell
public/CNAME        custom domain, copied into dist/ by the build
src/
  main.ts           router, wiring
  admin.ts          admin panel UI
  config.ts         ← your edits live here
  layout.ts         header, footer chrome, icons
  pages.ts          the column gallery
  pages-more.ts     video + contact routes
  supabase.ts       client, Google sign-in, allowlist
  store.ts          photo queries, upload, delete
  lightbox.ts       full-size viewer
  demo.ts           placeholder content
  styles.css        the whole design
supabase/schema.sql run once in the SQL editor
```

---

## Notes

- **Demo vs live photos.** `src/demo.ts` is the fallback; `listPublicPhotos()`
  from Supabase replaces it only when a live query returns rows. An empty
  table therefore shows the demo grid rather than an empty page.
- **Video is demo-only.** `/#/video` renders `DEMO_VIDEOS` and does not read
  from Supabase yet.
- **Contact form.** Posts to Formspree when `SITE.contact.formEndpoint` is
  set, otherwise falls back to a `mailto:` with the message pre-filled.
- **Two entry points.** `index.html` and `admin.html` are both Vite inputs
  (see `rollupOptions.input`), producing separate bundles.
- **Deployment.** `.github/workflows/deploy.yml` deploys to **GitHub Pages** on
  every push to `main` (see §6). The site is live at
  `https://shutterhausvisuals.co.za`; the `github.io` subpath serves the same
  build. **Share the bare domain, never `www.`** — the `www` hostname has no
  certificate of its own and will throw a security warning.
- **TLS.** If the padlock ever disappears or cert issuance fails, work through §6
  "If the certificate gets stuck in `bad_authz`" before touching anything else.
  Count the A records first — that mismatch is the usual cause.
