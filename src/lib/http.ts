import { NextResponse } from "next/server";

/**
 * JSON response explicitly marked as never cacheable, at every layer
 * (browser HTTP cache, Vercel's edge network, any intermediary proxy) - not
 * just relying on Next.js's own dynamic-rendering behavior. Use for any GET
 * route returning live DB state.
 */
export function noStoreJson<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, {
    status: init?.status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
