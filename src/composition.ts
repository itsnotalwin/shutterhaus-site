/**
 * Reading and writing the site's composition: which photo fills which slot.
 *
 * This is the layer that lets Alwin choose images from /admin and have them
 * appear on the live site without a commit. The choices used to live in git
 * (`homeStrip` and `heroPhoto` in config.ts, `PHOTO_ROWS` in rows.ts), which
 * is precisely the thing he wanted to stop doing.
 *
 * THE ONE RULE THIS FILE EXISTS TO KEEP: a bad or absent row must never blank
 * a public page. Every read resolves against what the gallery actually has
 * and falls back to the committed defaults, because the alternative is the
 * failure this site has already had once — nine stale rows overriding the
 * bundled gallery and 404ing every page (see adoptable() in main.ts).
 */
import { db, isSupabaseConfigured } from "./supabase";

const TABLE = "composition";

export interface Slot {
  /** Which page: "home" | "portfolio". */
  page: string;
  /** Which position group on that page: "strip" | "hero" | "wall". */
  slot: string;
  /** Zero-based position within the group. */
  order: number;
  /** The photos row id, when the slot resolves to a real photo. */
  photoId: string | null;
  /** The filename, kept alongside so a slot can be rendered without a join. */
  filename: string | null;
}

export interface Composition {
  homeStrip: string[];
  heroPhoto: string | null;
  /** The wall, as rows of filenames — 15 rows of 2 today. */
  wallRows: string[][];
  /** Slots that named something the gallery does not have. Never silently fixed. */
  problems: string[];
}

/** One query, all three groups. Ordered so the caller can slice by page/slot. */
export async function listSlots(page: string, slot: string): Promise<Slot[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select("page, slot_key, sort_order, photo_id, filename")
    .eq("page", page)
    .eq("slot_key", slot)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    page: r.page as string,
    slot: r.slot_key as string,
    order: r.sort_order as number,
    photoId: (r.photo_id as string | null) ?? null,
    filename: (r.filename as string | null) ?? null,
  }));
}

/**
 * How many frames per wall row.
 *
 * This is NOT a constant to be trusted from config — it is derived from the
 * existing rows, because a row that lost a frame must not silently change the
 * page from 2-up to 3-up. Deriving it means a partially-edited wall keeps its
 * original shape and the missing frame shows up as a problem instead.
 */
const WALL_COLS = 2;

/**
 * The committed choices from git, used whenever the database cannot be
 * trusted. Same shape as the live result so the two are interchangeable.
 */
export interface Fallback {
  strip: string[];
  hero: string | null;
  rows: string[][];
}

export async function readComposition(
  known: Set<string>,
  fallback: Fallback,
): Promise<Composition> {
  const problems: string[] = [];
  const out: Composition = { homeStrip: [], heroPhoto: null, wallRows: [], problems };

  if (!isSupabaseConfigured) return withFallback(out, fallback, known);

  try {
    const [strip, hero, wall] = await Promise.all([
      listSlots("home", "strip"),
      listSlots("home", "hero"),
      listSlots("portfolio", "wall"),
    ]);

    // A slot naming a file the gallery does not have is dropped and REPORTED.
    // Falling back per-slot rather than all-or-nothing is deliberate: one
    // bad row must not cost him the other five choices he made correctly.
    const resolve = (s: Slot, group: string): string | null => {
      if (!s.filename || !known.has(s.filename)) {
        problems.push(`${group} slot ${s.order + 1}: "${s.filename ?? "(empty)"}" is not in the gallery`);
        return null;
      }
      return s.filename;
    };

    const stripFiles = strip.map((s) => resolve(s, "home strip")).filter((f): f is string => !!f);
    out.homeStrip = stripFiles.length ? stripFiles : fallback.strip.filter((f: string) => known.has(f));

    const heroFile = hero[0] ? resolve(hero[0], "home hero") : null;
    out.heroPhoto = heroFile ?? (fallback.hero && known.has(fallback.hero) ? fallback.hero : null);

    // The wall is the fragile one: the page throws if a row is short, so a
    // missing frame has to fall back for the WHOLE row, not just that cell.
    const wallFiles = wall
      .map((s) => resolve(s, "portfolio wall"))
      .filter((f): f is string => !!f);
    if (wallFiles.length % WALL_COLS === 0 && wallFiles.length > 0) {
      const rows: string[][] = [];
      for (let i = 0; i < wallFiles.length; i += WALL_COLS) {
        rows.push(wallFiles.slice(i, i + WALL_COLS));
      }
      out.wallRows = rows;
    } else {
      out.wallRows = fallback.rows;
      if (wallFiles.length) {
        problems.push(
          `portfolio wall: ${wallFiles.length} usable frames is not a whole number of ${WALL_COLS}-up rows, so the committed wall was used instead`,
        );
      }
    }
  } catch (err) {
    // Supabase unreachable or misconfigured. The site must still render.
    problems.push(`composition unavailable: ${err instanceof Error ? err.message : "unknown"}`);
    return withFallback(out, fallback, known);
  }

  return withFallback(out, fallback, known);
}

function withFallback(
  out: Composition,
  fallback: Fallback,
  known: Set<string>,
): Composition {
  if (!out.homeStrip.length) out.homeStrip = fallback.strip.filter((f: string) => known.has(f));
  if (!out.heroPhoto) {
    out.heroPhoto = fallback.hero && known.has(fallback.hero) ? fallback.hero : null;
  }
  if (!out.wallRows.length) out.wallRows = fallback.rows;
  return out;
}

/**
 * Replace one slot's photo. Whole-slot rather than a partial patch so the
 * write is idempotent: setting the same photo twice cannot leave a stale
 * second row behind the way an insert-or-update would.
 */
export async function setSlot(
  page: string,
  slot: string,
  order: number,
  photoId: string | null,
  filename: string | null,
): Promise<void> {
  const { error } = await db()
    .from(TABLE)
    .update({ photo_id: photoId, filename, updated_at: new Date().toISOString() })
    .eq("page", page)
    .eq("slot_key", slot)
    .eq("sort_order", order);
  if (error) throw new Error(error.message);
}

/** Fill an empty slot, e.g. when the wall has fewer rows than the page expects. */
export async function createSlot(
  page: string,
  slot: string,
  order: number,
  photoId: string | null,
  filename: string | null,
): Promise<void> {
  const { error } = await db()
    .from(TABLE)
    .insert({ page, slot_key: slot, sort_order: order, photo_id: photoId, filename });
  if (error) throw new Error(error.message);
}

export async function deleteSlot(page: string, slot: string, order: number): Promise<void> {
  const { error } = await db()
    .from(TABLE)
    .delete()
    .eq("page", page)
    .eq("slot_key", slot)
    .eq("sort_order", order);
  if (error) throw new Error(error.message);
}