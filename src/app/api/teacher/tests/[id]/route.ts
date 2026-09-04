import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const testId = params.id;

  const { data: test, error: testError } = await supabase
    .from("tests")
    .select("*")
    .eq("id", testId)
    .single();

  if (testError || !test) {
    return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });
  }

  const { count: questionCount } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("test_id", testId);

  const { data: sessions, error: sessionsError } = await supabase
    .from("test_sessions")
    .select("id, student_id, status, started_at, submitted_at, total_score, auto_submitted, students(student_id, name)")
    .eq("test_id", testId)
    .order("started_at", { ascending: true });

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const leaveStats: Record<string, { count: number; durationSeconds: number }> = {};
  for (const id of sessionIds) leaveStats[id] = { count: 0, durationSeconds: 0 };

  if (sessionIds.length > 0) {
    const { data: logs } = await supabase
      .from("proctoring_logs")
      .select("session_id, duration_seconds")
      .in("session_id", sessionIds);

    for (const log of logs ?? []) {
      if (log.duration_seconds !== null && log.duration_seconds >= test.leave_grace_seconds) {
        leaveStats[log.session_id].count += 1;
        leaveStats[log.session_id].durationSeconds += log.duration_seconds;
      }
    }
  }

  const { count: totalStudents } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    test,
    totalQuestions: questionCount ?? 0,
    totalStudents: totalStudents ?? 0,
    sessions: (sessions ?? []).map((s: any) => ({
      id: s.id,
      studentId: s.students?.student_id ?? "",
      studentName: s.students?.name ?? "",
      status: s.status,
      startedAt: s.started_at,
      submittedAt: s.submitted_at,
      totalScore: s.total_score,
      autoSubmitted: s.auto_submitted,
      leaveCount: leaveStats[s.id]?.count ?? 0,
      leaveDurationSeconds: leaveStats[s.id]?.durationSeconds ?? 0,
    })),
  });
}
