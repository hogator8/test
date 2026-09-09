import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Browser-safe Supabase client using the public anon key. Used only for
 * teacher authentication (sign in/out, password reset, accepting invites) -
 * every other read/write in this app goes through server-side API Routes
 * using the service role key instead, exactly as before. Persists the
 * session in the browser (localStorage) so a page like /teacher/org can
 * later call supabase.auth.updateUser() without a fresh sign-in.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Configure them in your environment."
    );
  }

  cachedClient = createClient(url, key);
  return cachedClient;
}
