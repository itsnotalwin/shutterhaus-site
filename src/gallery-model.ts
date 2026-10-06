import { DEMO_PHOTOS } from './demo';
import { SITE } from './config';
import { COMMITTED_ROWS } from './rows';
import type { AdminPhoto, Photo } from './types';

export function mergePhotos(live: Photo[] | null = null): AdminPhoto[] {
  const shipped = new Map(DEMO_PHOTOS.map(p => [p.filename, p]));
  const merged = new Map(DEMO_PHOTOS.map(p => [p.filename, { ...p } as AdminPhoto]));
  for (const row of live ?? []) {
    if (!row.filename || !row.url) continue;
    const local = shipped.get(row.filename);
    if (!local && !/^https?:\/\//.test(row.url)) continue;
    // Bundled frame identities stay stable; database UUIDs belong to uploads.
    merged.set(row.filename, { ...row, id: local?.id ?? row.id, url: local?.url ?? row.url, width: local?.width ?? row.width, height: local?.height ?? row.height } as AdminPhoto);
  }
  return [...merged.values()].sort((a,b) => a.sort_order - b.sort_order);
}

const committedHome = {strip:[...SITE.homeStrip],hero:SITE.heroPhoto};
export function fallbackComposition() {
  const byId = new Map(DEMO_PHOTOS.map(p => [p.id, p.filename!]));
  return { strip: [...committedHome.strip], hero: committedHome.hero, rows: COMMITTED_ROWS.map(row => row.map(id => byId.get(id)!)) };
}

export interface GalleryDraft {
  hero: string;
  strip: string[];
  wall: string[];
  photos: AdminPhoto[];
  revision: string | null;
}

export function validateDraft(draft: GalleryDraft): void {
  const available = new Set(draft.photos.filter(p => p.visible).map(p => p.filename));
  if (!draft.hero || !available.has(draft.hero)) throw new Error('Choose an available hero photo.');
  if (draft.strip.length < 1 || draft.strip.length > 6) throw new Error('Choose between 1 and 6 home photos.');
  if (draft.wall.length > 120) throw new Error('The portfolio can hold up to 120 photos.');
  for (const group of [draft.strip, draft.wall]) {
    if (new Set(group).size !== group.length) throw new Error('A photo appears twice in the same section.');
    if (group.some(file => !available.has(file))) throw new Error('A selected photo is unavailable. Replace it before publishing.');
  }
}

export function move<T>(values: T[], from: number, to: number): void {
  if (from < 0 || to < 0 || from >= values.length || to >= values.length || from === to) return;
  values.splice(to, 0, values.splice(from, 1)[0]);
}
