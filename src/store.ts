import { db, isSupabaseConfigured } from "./supabase";
import type { AdminPhoto } from "./types";

const TABLE = "photos";

/**
 * An empty array is NOT the same as "there is nothing to show".
 *
 * `listPublicPhotos` returns [] when Supabase is unconfigured, when the query
 * errors, and when the table is genuinely empty — and main.ts cannot tell them
 * apart, so it replaces the local demo frames with NOTHING. That is how /about
 * ended up rendering a model instead of the pinned metal-detector frame: the
 * lookup by filename found no match in an empty list and fell through to
 * `photos[0]`.
 *
 * Callers that care should use `publicPhotosOrNull`, which returns null for
 * "no live data" and only an array when there really are rows.
 */

export type { AdminPhoto } from "./types";

function guard(): void {
  if (!isSupabaseConfigured) throw new Error("Supabase isn't configured — see .env.example");
}

/** All photos including hidden ones, in manual order — the admin view. */
export async function listAllPhotos(): Promise<AdminPhoto[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await db()
    .from(TABLE)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminPhoto[];
}

/** Only the visible ones, in order — what visitors see. */
export async function listPublicPhotos(): Promise<AdminPhoto[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await db()
    .from(TABLE)
    .select("*")
    .eq("visible", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminPhoto[];
}

/**
 * Live photos, or null when there is no live data to show — unconfigured,
 * unreachable, or genuinely empty. Never returns an empty array.
 */
export async function publicPhotosOrNull(): Promise<AdminPhoto[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const rows = await listPublicPhotos();
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

export interface PhotoPatch {
  alt?: string;
  visible?: boolean;
  sort_order?: number;
}

/**
 * Stores the file, then writes the metadata row. New uploads start hidden.
 *
 * `dims` carries the real pixel size measured in the browser before the bytes
 * were compressed. The public wall lays out from width/height, so a row that
 * arrives without them is a row that lays out wrong.
 */
export async function uploadPhoto(
  file: File,
  dims?: { width: number; height: number },
): Promise<AdminPhoto> {
  guard();

  const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const path = `${Date.now()}-${safe}`;

  const { error: upErr } = await db().storage
    .from("photos")
    .upload(path, file, { cacheControl: "31536000", upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = db().storage.from("photos").getPublicUrl(path);

  // Land at the end of the current order.
  const { data: last } = await db()
    .from(TABLE)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { data, error } = await db()
    .from(TABLE)
    .insert({
      filename: safe,
      storage_path: path,
      url: pub.publicUrl,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
      album: "photo",
      visible: false,
      sort_order: nextOrder,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  return data as AdminPhoto;
}

export async function updatePhoto(id: string, patch: PhotoPatch): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await db().from(TABLE).update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Removes the row and the underlying file. */
export async function deletePhoto(id: string): Promise<void> {
  guard();
  const { data } = await db().from(TABLE).select("storage_path").eq("id", id).single();
  if (data?.storage_path) {
    await db().storage.from("photos").remove([data.storage_path]);
  }
  const { error } = await db().from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
