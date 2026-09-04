import { NextResponse } from "next/server";
import { TEACHER_COOKIE } from "@/lib/auth";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEACHER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
