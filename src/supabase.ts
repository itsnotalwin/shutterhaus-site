import { createClient } from "@supabase/supabase-js";
import { ADMIN_EMAILS } from "./config";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True once .env has been filled in — the app degrades gracefully without it. */
export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "public-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Google OAuth. Always redirects; the session arrives in the URL hash. */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${location.origin}${location.pathname}` },
  });
  return { error: error ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  localStorage.removeItem("shutterhaus_admin_email");
}

/** Current session, or null. Also re-syncs the cached email the admin UI shows. */
export async function getSession(): Promise<{ email: string | null } | null> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user?.email ?? null;
  if (email) localStorage.setItem("shutterhaus_admin_email", email);
  return { email };
}

/**
 * Client-side allowlist. This is UX only — the Supabase RLS policies in
 * supabase/schema.sql are the real gate, so editing ADMIN_EMAILS alone can
 * never grant access to someone who shouldn't have it.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((a) => a.toLowerCase() === e);
}
