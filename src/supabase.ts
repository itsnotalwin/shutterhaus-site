import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_EMAILS } from "./config";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True once both values are real. Use `||` not `??` — CI injects empty
 * strings for unset repo variables, and `??` does not fall back on those.
 */
export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/**
 * Lazily built so an unconfigured build can never throw at import time.
 * Vite inlines import.meta.env at BUILD time, so a CI build with no
 * Supabase variables would otherwise crash before the first render.
 */
export function db(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase isn't configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  client ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/**
 * The canonical admin URL. NOT derived from `location`.
 *
 * `location.pathname` looks correct and is the bug: type the URL as
 * shutterhausvisuals.co.za/admin/ (with the trailing slash a browser or a
 * bookmark tends to add) and the OAuth callback goes to /admin/ — which GitHub
 * Pages answers with 404, because Pages only serves /admin.html and /admin.
 * So Google signs you in successfully and then dumps you on a 404, which reads
 * as "login is broken" when it is only the return path that is.
 *
 * A fixed string also keeps the callback identical on every entry path, which
 * is what the allowlist in Supabase has to match.
 */
const ADMIN_URL = "https://shutterhausvisuals.co.za/admin.html";

/** Google OAuth. Always redirects; the session arrives in the URL hash. */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  const { error } = await db().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: ADMIN_URL },
  });
  return { error: error ?? null };
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await db().auth.signOut();
  localStorage.removeItem("shutterhaus_admin_email");
}

/**
 * Current session as `{ email }`, or **null when signed out**.
 *
 * Returning null matters: the admin gate branches on `if (!session)`, so an
 * object with a null email would fall through to the "not on the allowlist"
 * branch and show a signed-out visitor an allowlist error.
 */
export async function getSession(): Promise<{ email: string } | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await db().auth.getSession();
  const email = data.session?.user?.email ?? null;
  if (!email) return null;
  localStorage.setItem("shutterhaus_admin_email", email);
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
