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
npm run dev
```

Works immediately with placeholder images from `src/demo.ts`. Supabase only needs
connecting when you want to upload real work.

```bash
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build locally
```

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

## 6. Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes on every push to
`main`.

1. Push this repo to GitHub as `shutterhaus-site`.
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. Repo → **Settings → Secrets and variables → Actions → Variables** → add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. In **Supabase → Authentication → URL Configuration → Redirect URLs**, add:
   ```
   https://itsnotalwin.github.io/shutterhaus-site/
   ```
5. Push. The site goes live at `https://itsnotalwin.github.io/shutterhaus-site/`.

If you later use a custom domain, add it to that same redirect URL list.

### Deploying somewhere else

The build output is a plain static `dist/` folder — Netlify, Cloudflare Pages,
Vercel or any static host will serve it as-is. For a user site at
`itsnotalwin.github.io` (rather than a project subpath), change `base` in
`vite.config.ts` to `"/"`.

---

## Layout

```
index.html          public site shell
admin.html          admin shell
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
