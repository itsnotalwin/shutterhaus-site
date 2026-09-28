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

export interface VideoItem {
  id: string;
  /** where the hosted file lives */
  src: string;
  poster?: string;
  title: string;
}
