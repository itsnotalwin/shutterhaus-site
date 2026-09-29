import type { Photo } from "./types";

/**
 * The first real shoot — Chanelle. These files live in `public/gallery/`, so
 * they ship with the site and the gallery looks right before Supabase is even
 * connected. Once you start uploading through /admin, the live database takes
 * over automatically (see main.ts).
 *
 * Add more shoots by dropping web-sized JPGs in public/gallery/ and adding a
 * line here. `sort_order` controls their position; it wraps every 3 items into
 * the 3 columns.
 *
 * NOTE: FINALS-44 was removed — it was a pixel-identical duplicate of
 * FINALS-43 (verified with tools/compare-pair.py, RMS 0.000). Re-run
 * tools/find-duplicates.py before adding a new shoot to avoid shipping the
 * same frame twice.
 */
export const DEMO_PHOTOS: Photo[] = [
  { id: "c34", url: "gallery/finals-34.jpg", alt: "Portrait, natural light", album: "photo", sort_order: 0, visible: true, filename: "finals-34.jpg" },
  { id: "c35", url: "gallery/finals-35.jpg", alt: "On location, wide frame", album: "photo", sort_order: 1, visible: true, filename: "finals-35.jpg" },
  { id: "c36", url: "gallery/finals-36.jpg", alt: "Editorial, soft light", album: "photo", sort_order: 2, visible: true, filename: "finals-36.jpg" },
  { id: "c37", url: "gallery/finals-37.jpg", alt: "Couples session", album: "photo", sort_order: 3, visible: true, filename: "finals-37.jpg" },
  { id: "c38", url: "gallery/finals-38.jpg", alt: "Family, backlit", album: "photo", sort_order: 4, visible: true, filename: "finals-38.jpg" },
  { id: "c39", url: "gallery/finals-39.jpg", alt: "Portrait, low light", album: "photo", sort_order: 5, visible: true, filename: "finals-39.jpg" },
  { id: "c40", url: "gallery/finals-40.jpg", alt: "Monochrome study", album: "photo", sort_order: 6, visible: true, filename: "finals-40.jpg" },
  { id: "c41", url: "gallery/finals-41.jpg", alt: "Golden hour, outdoors", album: "photo", sort_order: 7, visible: true, filename: "finals-41.jpg" },
  { id: "c42", url: "gallery/finals-42.jpg", alt: "Studio portrait", album: "photo", sort_order: 8, visible: true, filename: "finals-42.jpg" },
  { id: "c43", url: "gallery/finals-43.jpg", alt: "Candid moment", album: "photo", sort_order: 9, visible: true, filename: "finals-43.jpg" },
];
