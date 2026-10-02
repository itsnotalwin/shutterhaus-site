export type IconId = "instagram" | "facebook" | "whatsapp" | "mail" | "google";

/** A single gallery image, as stored in the `photos` table. */
export interface Photo {
  id: string;
  /** public URL of the image */
  url: string;
  /** original filename, used as the fallback alt text */
  filename?: string;
  /** lower sorts first */
  sort_order: number;
  /** whether it appears on the public site */
  visible: boolean;
  /** which page it belongs to */
  album: string;
  /** alt text / caption — also the SEO description */
  alt?: string;
  width?: number | null;
  height?: number | null;
  created_at?: string;
}

/** Admin view of a photo — same row, filename guaranteed by the query. */
export type AdminPhoto = Photo & { filename: string };

/**
 * One row of the portfolio wall: the photo ids sharing an exact aspect ratio.
 *
 * The ratio guarantee is what keeps the rows gap-free. See tools/rows.py.
 *
 * Was a fixed 3-tuple. Rows are TWO frames since 2026-10-02 (2-column wall), so
 * the arity is expressed as a plain array — a fixed tuple would have rejected
 * every generated row at compile time. The per-row count is asserted in
 * tools/check-rows.py, which is the right place for it: that is where a
 * mismatched row is a spacing defect, not a type error.
 */
export type PhotoRow = string[];
