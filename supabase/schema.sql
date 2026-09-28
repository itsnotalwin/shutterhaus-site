-- ============================================================
--  Shutterhaus Visuals — Supabase setup
--  Run this ONCE in the Supabase SQL Editor (Dashboard > SQL > New query).
--  It creates the photos table, the public bucket, and the RLS policies
--  that lock uploads down to the admin email only.
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

-- 2. Row Level Security ----------------------------------------------------
alter table public.photos enable row level security;

-- Anyone (including signed-out visitors) can read photos, but the public site
-- only ever queries `visible = true` rows. Admins read everything.
drop policy if exists "photos public read" on public.photos;
create policy "photos public read"
  on public.photos for select
  using (visible = true or is_admin());

-- 3. The admin check — this is the access control for the whole backend ----
-- is_admin() returns true only for the emails in the admin list.
-- >>> EDIT THE EMAIL LIST HERE IF YOU EVER ADD A SECOND ADMIN. <<<
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array[
      'itsnotalwin@gmail.com'
    ]
  );
$$;

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
