import { db, isSupabaseConfigured } from './supabase';
import { validateDraft, type GalleryDraft } from './gallery-model';

export interface Slot { page: string; slot: string; order: number; photoId: string | null; filename: string | null }
export interface Composition { homeStrip: string[]; heroPhoto: string | null; wallRows: string[][]; problems: string[]; revision?: string | null }
export interface Fallback { strip: string[]; hero: string | null; rows: string[][] }

export async function listSlots(page: string, slot: string): Promise<Slot[]> {
  const { data, error } = await db().from('composition').select('*').eq('page', page).eq('slot_key', slot).order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({page:r.page, slot:r.slot_key, order:r.sort_order, photoId:r.photo_id, filename:r.filename}));
}

export async function readComposition(known: Set<string>, fallback: Fallback): Promise<Composition> {
  const defaults = (): Composition => ({homeStrip:[...fallback.strip], heroPhoto:fallback.hero, wallRows:fallback.rows.map(r=>[...r]), problems:[], revision:null});
  if (!isSupabaseConfigured) return defaults();
  try {
    // One snapshot avoids combining three different publication revisions.
    const { data, error } = await db().from('composition').select('page,slot_key,sort_order,filename,updated_at').order('sort_order');
    if (error) throw new Error(error.message);
    if (!data?.length) return defaults();
    const out = defaults();
    const group = (page: string, slot: string) => data.filter(r=>r.page===page && r.slot_key===slot);
    const resolve = (file: string | null, replacement?: string): string | null => {
      if (file && known.has(file)) return file;
      out.problems.push(`Unavailable photo: ${file ?? '(empty)'}`);
      return replacement && known.has(replacement) ? replacement : null;
    };
    const strip = group('home','strip');
    if (strip.length) out.homeStrip = strip.map((r,i)=>resolve(r.filename, fallback.strip[i])).filter((f): f is string => !!f);
    const hero = group('home','hero')[0];
    if (hero) out.heroPhoto = resolve(hero.filename, fallback.hero ?? undefined);
    const wall = group('portfolio','wall');
    const marker = group('site','published')[0];
    out.revision = marker?.updated_at ?? null;
    if (wall.length || marker) {
      const files = wall.map((r,i)=>resolve(r.filename, fallback.rows.flat()[i])).filter((f): f is string=>!!f);
      // Columns are packed responsively by the renderer; odd frame counts are valid.
      out.wallRows = files.length ? [files] : [];
    }
    return out;
  } catch (error) {
    const out = defaults();
    out.problems.push(`Could not read the published layout: ${error instanceof Error ? error.message : 'unknown error'}`);
    return out;
  }
}

export async function setSlot(page: string, slot: string, order: number, photoId: string | null, filename: string | null): Promise<void> {
  const {data,error} = await db().from('composition').upsert({page,slot_key:slot,sort_order:order,photo_id:photoId,filename,updated_at:new Date().toISOString()}, {onConflict:'page,slot_key,sort_order'}).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'The slot was not saved.');
}
export const createSlot = setSlot;
export async function deleteSlot(page: string, slot: string, order: number): Promise<void> {
  const {error} = await db().from('composition').delete().eq('page',page).eq('slot_key',slot).eq('sort_order',order);
  if (error) throw new Error(error.message);
}

/** Library edits and every page position commit together or roll back together. */
export async function publishGallery(draft: GalleryDraft): Promise<string> {
  validateDraft(draft);
  const {data,error} = await db().rpc('publish_gallery', {
    expected_revision:draft.revision,
    layout:{hero:draft.hero,strip:draft.strip,wall:draft.wall},
    library:draft.photos.map((p,i)=>({filename:p.filename,url:p.url,alt:p.alt ?? '',visible:p.visible,width:p.width,height:p.height,sort_order:i})),
  });
  if (error || !data) throw new Error(error?.message ?? 'Publication could not be confirmed.');
  return data as string;
}
