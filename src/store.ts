import { db, isSupabaseConfigured } from "./supabase";
import type { AdminPhoto } from "./types";

const TABLE = "photos";

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

export interface PhotoPatch {
  alt?: string;
  visible?: boolean;
  sort_order?: number;
}

/** Stores the file, then writes the metadata row. New uploads start hidden. */
export async function uploadPhoto(file: File): Promise<AdminPhoto> {
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
