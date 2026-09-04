import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { noStoreJson } from "@/lib/http";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();

  const { data: sessions, error: sessionsError } = await supabase
    .from("test_sessions")
    .select("id, test_id, submitted_at, total_score")
    .eq("student_id", payload.studentDbId)
    .eq("status", "submitted")
    .is("deleted_at", null)
    .order("submitted_at", { ascending: false });

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const testIds = Array.from(new Set((sessions ?? []).map((s) => s.test_id)));
  if (testIds.length === 0) {
    return noStoreJson({ history: [] });
  }

  const [{ data: tests }, { data: questions }] = await Promise.all([
    supabase.from("tests").select("id, title, show_score_to_student").in("id", testIds),
    supabase.from("questions").select("test_id").in("test_id", testIds),
  ]);

  const testsById: Record<string, { title: string; show_score_to_student: boolean }> = {};
  for (const t of tests ?? []) {
    testsById[t.id] = { title: t.title, show_score_to_student: t.show_score_to_student };
  }

  const questionCountByTest: Record<string, number> = {};
  for (const q of questions ?? []) {
    questionCountByTest[q.test_id] = (questionCountByTest[q.test_id] ?? 0) + 1;
  }

  const history = (sessions ?? []).map((s) => {
    const test = testsById[s.test_id];
    const showScore = test?.show_score_to_student ?? true;
    return {
      sessionId: s.id,
      testTitle: test?.title ?? "",
      submittedAt: s.submitted_at,
      totalScore: showScore ? s.total_score : null,
      totalQuestions: questionCountByTest[s.test_id] ?? 0,
      showScore,
    };
  });

  return noStoreJson({ history });
}
