-- ============================================================
--  Shutterhaus Visuals — Supabase schema
--
--  ALREADY APPLIED to project vthmxvvtbxtqlyqksche ("Shutterhaus Visuals",
--  eu-west-1) and verified: an unauthenticated INSERT into public.photos
--  is rejected with "new row violates row-level security policy".
--
--  Kept here so the setup is reproducible and reviewable. Re-running it is
--  safe — every statement is IF NOT EXISTS / OR REPLACE / DROP-then-CREATE.
--
--  WHERE THE IMAGE FILES LIVE: IN GIT, NOT IN SUPABASE STORAGE
--  -------------------------------------------------------
--  Alwin's call, and the right one. Two reasons, the second is the important
--  one:
--
--  1. Supabase Free pauses a project after ~7 days with no database activity.
--     A paused project returns HTTP 540 for EVERYTHING — database, auth and
--     storage. So a portfolio whose images live on supabase.co/storage goes
--     fully dark on a timer while the static site keeps serving: the page
--     loads, every image is broken, and recovery needs a human to press
--     Resume in the dashboard. GitHub Pages has no such timer.
--  2. Storage and egress are both metered on Free (1 GB / 5 GB). GitHub Pages
--     serves the same bytes from its own CDN for free, uncounted.
--
--  (Storage was never really the binding constraint: the 9 optimised photos
--  total 1.8 MB, so the 1 GB free tier is ~500 shoots of headroom. The pause
--  timer was the real risk, and it is a total outage rather than a slow one.)
--
--  So this table is METADATA ONLY — about 100 bytes a row against a 500 MB
--  database, so it will never be the thing that runs out. The files are
--  committed under public/gallery/ and served by GitHub Pages; `url` points
--  at that origin.
--
--  Consequence: adding a photo is a git commit, not a browser upload. Run
--  tools/add-photos.py <folder>, which optimises, writes the files and seeds
--  the rows. Everything done often — alt text, order, hide/show — stays
--  editable in the admin panel with no deploy.
-- ============================================================

-- 1. Table ---------------------------------------------------------------
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  album       text not null default 'photo',
  filename    text not null,
  url         text not null,
  storage_path text not null,
  width       integer,
  height      integer,
  sort_order  integer not null default 0,
  visible     boolean not null default true,
  alt         text not null default '',
  created_at  timestamptz default now()
);

create index if not exists photos_album_order_idx
  on public.photos (album, sort_order);

-- 2. The admin check — the access control for the whole backend ---------------
-- is_admin() returns true only for the emails in the admin list.
-- >>> EDIT THE EMAIL LIST HERE IF YOU EVER ADD A SECOND ADMIN. <<<
-- NOTE: this function must be defined BEFORE the policies below. Postgres
-- validates the policy expression at CREATE time, so a policy referencing a
-- function that does not exist yet fails immediately.
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array[
      'itsnotalwin@gmail.com'
    ]
  );
$$;

-- 3. Row Level Security ----------------------------------------------------
alter table public.photos enable row level security;

-- Anyone (including signed-out visitors) can read photos, but the public site
-- only ever queries `visible = true` rows. Admins read everything.
drop policy if exists "photos public read" on public.photos;
create policy "photos public read"
  on public.photos for select
  using (visible = true or is_admin());

-- Only admins can insert / update / delete.
drop policy if exists "photos admin insert" on public.photos;
create policy "photos admin insert"
  on public.photos for insert
  with check (public.is_admin());

drop policy if exists "photos admin update" on public.photos;
create policy "photos admin update"
  on public.photos for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "photos admin delete" on public.photos;
create policy "photos admin delete"
  on public.photos for delete
  using (public.is_admin());

-- 4. Storage bucket --------------------------------------------------------
-- public = the images are readable by URL, which is what the gallery needs.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- Public can read images.
drop policy if exists "storage public read" on storage.objects;
create policy "storage public read"
  on storage.objects for select
  using (bucket_id = 'photos');

-- Only admins can upload / overwrite / delete files.
drop policy if exists "storage admin write" on storage.objects;
create policy "storage admin write"
  on storage.objects for insert
  with check (bucket_id = 'photos' and public.is_admin());

drop policy if exists "storage admin update" on storage.objects;
create policy "storage admin update"
  on storage.objects for update
  using (bucket_id = 'photos' and public.is_admin());

drop policy if exists "storage admin delete" on storage.objects;
create policy "storage admin delete"
  on storage.objects for delete
  using (bucket_id = 'photos' and public.is_admin());

-- ============================================================
--  DONE. Now enable Google sign-in:
--  Authentication > Providers > Google > toggle on, paste Client ID + Secret
--  from Google Cloud Console (see README step 3).
-- ============================================================
