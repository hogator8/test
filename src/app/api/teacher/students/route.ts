import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { noStoreJson } from "@/lib/http";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("students")
    .select("id, student_id, name, class_name, reading, nationality, gender, created_at")
    .order("student_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const studentIds = (data ?? []).map((s) => s.id);
  const sessionCounts: Record<string, number> = {};
  if (studentIds.length > 0) {
    const { data: sessions } = await supabase
      .from("test_sessions")
      .select("student_id")
      .in("student_id", studentIds);
    for (const s of sessions ?? []) {
      sessionCounts[s.student_id] = (sessionCounts[s.student_id] ?? 0) + 1;
    }
  }

  return noStoreJson({
    students: (data ?? []).map((s) => ({ ...s, sessionCount: sessionCounts[s.id] ?? 0 })),
    // Temporary diagnostic: lets us confirm from the browser alone which
    // deployment/commit is actually serving this response, and which
    // Supabase project it's reading from - without needing dashboard
    // access. Safe to expose (commit SHA and a project hostname, not a
    // secret). Remove once the deploy-lag / wrong-project question is
    // settled.
    _debug: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      supabaseHost: (() => {
        try {
          return new URL(process.env.SUPABASE_URL ?? "").host;
        } catch {
          return null;
        }
      })(),
    },
  });
}
