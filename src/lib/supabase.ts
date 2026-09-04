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
