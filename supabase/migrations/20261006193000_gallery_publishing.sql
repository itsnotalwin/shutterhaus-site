-- Additive migration. Existing photographs and layout stay unchanged.
-- This JWT-only predicate does not need owner privileges.
alter function public.is_admin() security invoker;
alter function public.is_admin() set search_path = '';
create unique index if not exists photos_filename_unique on public.photos(filename);

create or replace function public.publish_gallery(layout jsonb, library jsonb, expected_revision timestamptz default null)
returns timestamptz
language plpgsql security invoker set search_path = ''
as $$
declare
  current_revision timestamptz;
  next_revision timestamptz;
  entry jsonb;
  group_name text;
  page_name text;
  file_name text;
  position integer;
  selected text[];
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(193874261);
  select updated_at into current_revision from public.composition where page='site' and slot_key='published' and sort_order=0;
  if current_revision is distinct from expected_revision then
    raise exception 'The site changed in another session. Your draft is still here. Reload the published layout before trying again.';
  end if;
  if coalesce(jsonb_typeof(library),'') <> 'array' or jsonb_array_length(library) > 1000 then raise exception 'Invalid photo library'; end if;
  if coalesce(jsonb_typeof(layout->'strip'),'') <> 'array' or coalesce(jsonb_typeof(layout->'wall'),'') <> 'array' then raise exception 'Invalid page layout'; end if;
  if jsonb_array_length(layout->'strip') not between 1 and 6 or jsonb_array_length(layout->'wall') > 120 then raise exception 'Invalid photo count'; end if;
  if (select count(*) from jsonb_array_elements(library)) <> (select count(distinct value->>'filename') from jsonb_array_elements(library)) then raise exception 'Duplicate library filenames'; end if;

  for entry in select value from jsonb_array_elements(library) loop
    if coalesce(entry->>'filename','')='' or coalesce(entry->>'url','')='' or coalesce((entry->>'width')::int,0)<1 or coalesce((entry->>'height')::int,0)<1 then raise exception 'Incomplete photo metadata'; end if;
    -- Existing uploads keep their storage path. New uploads are registered by
    -- the Storage upload flow; this function only inserts bundled photographs.
    if not exists(select 1 from public.photos where filename=entry->>'filename') and (entry->>'url') !~ '^gallery/[^/]+$' then raise exception 'Upload the file before publishing it'; end if;
    insert into public.photos(filename,storage_path,url,width,height,sort_order,visible,alt,album)
    values(entry->>'filename','',entry->>'url',(entry->>'width')::int,(entry->>'height')::int,(entry->>'sort_order')::int,(entry->>'visible')::boolean,coalesce(entry->>'alt',''),'photo')
    on conflict(filename) do update set width=excluded.width,height=excluded.height,sort_order=excluded.sort_order,visible=excluded.visible,alt=excluded.alt;
  end loop;
  selected := array[layout->>'hero'] || array(select jsonb_array_elements_text(layout->'strip')) || array(select jsonb_array_elements_text(layout->'wall'));
  if exists(select 1 from unnest(selected) file where file is null or not exists(select 1 from public.photos p where p.filename=file and p.visible)) then raise exception 'A selected photo is unavailable'; end if;
  if (select count(*) from jsonb_array_elements_text(layout->'strip')) <> (select count(distinct value) from jsonb_array_elements_text(layout->'strip')) or
     (select count(*) from jsonb_array_elements_text(layout->'wall')) <> (select count(distinct value) from jsonb_array_elements_text(layout->'wall')) then raise exception 'Duplicate photos in a page section'; end if;

  next_revision := clock_timestamp();
  delete from public.composition where (page='home' and slot_key in ('hero','strip')) or (page='portfolio' and slot_key='wall');
  insert into public.composition(page,slot_key,sort_order,photo_id,filename,updated_at)
  select 'home','hero',0,id,filename,next_revision from public.photos where filename=layout->>'hero';
  foreach group_name in array array['strip','wall'] loop
    page_name := case when group_name='strip' then 'home' else 'portfolio' end;
    position := 0;
    for file_name in select jsonb_array_elements_text(layout->group_name) loop
      insert into public.composition(page,slot_key,sort_order,photo_id,filename,updated_at)
      select page_name,group_name,position,id,filename,next_revision from public.photos where filename=file_name;
      position := position+1;
    end loop;
  end loop;
  insert into public.composition(page,slot_key,sort_order,filename,updated_at)
  values('site','published',0,'published',next_revision)
  on conflict(page,slot_key,sort_order) do update set updated_at=excluded.updated_at;
  return next_revision;
end;
$$;
revoke all on function public.publish_gallery(jsonb,jsonb,timestamptz) from public, anon;
grant execute on function public.publish_gallery(jsonb,jsonb,timestamptz) to authenticated;
