import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("students")
    .select("id, student_id, name, created_at")
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

  return NextResponse.json({
    students: (data ?? []).map((s) => ({ ...s, sessionCount: sessionCounts[s.id] ?? 0 })),
  });
}
