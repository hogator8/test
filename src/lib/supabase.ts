import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service role key.
 * Never import this from a Client Component - it must only run in
 * API Routes / Server Components, since the service role key bypasses RLS.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set. Configure them in your environment."
    );
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // supabase-js issues its requests via plain fetch() under the hood.
      // Inside Next.js (App Router), the global fetch is patched to cache
      // GET requests by default (the "Data Cache") - and that cache
      // persists across deployments. Without this override, every query
      // to the same PostgREST endpoint+params (e.g. the students list)
      // keeps returning whatever it first returned, forever, no matter
      // what `export const dynamic` or response Cache-Control headers say
      // on our own routes - those control different caching layers and
      // don't touch this one.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cachedClient;
}

/**
 * Verifies a teacher's own password (used before letting them self-delete
 * their account - see /api/teacher/account/delete), WITHOUT ever calling
 * auth.signInWithPassword() on the shared getSupabaseAdmin() client.
 *
 * That distinction matters: signInWithPassword() saves the resulting
 * session onto the client instance it was called on, and supabase-js then
 * swaps that same instance's Authorization header - used for every
 * subsequent .from() query, including realtime/storage - from the
 * service_role key to the newly-signed-in user's own (much more limited)
 * access token. Since getSupabaseAdmin() returns a cached singleton reused
 * by every route, doing this on it would silently downgrade ALL later
 * queries on that client from service_role to the authenticated user's own
 * role - which is exactly what caused "permission denied for table
 * organization_members" here. A throwaway client, discarded right after,
 * cannot contaminate anything else.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Configure them in your environment."
    );
  }
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}
