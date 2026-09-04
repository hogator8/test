import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { loadSessionForStudent, submitIfExpired } from "@/lib/testSession";
import { noStoreJson } from "@/lib/http";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const result = await loadSessionForStudent(supabase, params.sessionId, payload.studentDbId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const session = await submitIfExpired(supabase, result.session);

  const [questionsResult, answersResult] = await Promise.all([
    supabase
      .from("questions")
      .select("id, section_number, question_number, question_text, choice_1, choice_2, choice_3, choice_4, choice_5")
      .eq("test_id", session.test_id)
      .order("section_number", { ascending: true })
      .order("question_number", { ascending: true }),
    supabase.from("answers").select("question_id, selected_choice").eq("session_id", session.id),
  ]);

  const { data: questions, error: questionsError } = questionsResult;
  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  const { data: answers, error: answersError } = answersResult;
  if (answersError) {
    return NextResponse.json({ error: answersError.message }, { status: 500 });
  }

  const answerMap: Record<string, number> = {};
  for (const a of answers ?? []) {
    if (a.selected_choice !== null) answerMap[a.question_id] = a.selected_choice;
  }

  const sectionsMap = new Map<number, typeof questions>();
  for (const q of questions ?? []) {
    if (!sectionsMap.has(q.section_number)) sectionsMap.set(q.section_number, []);
    sectionsMap.get(q.section_number)!.push(q);
  }

  const sections = Array.from(sectionsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([sectionNumber, qs]) => ({
      sectionNumber,
      questions: qs.map((q) => ({
        id: q.id,
        questionNumber: q.question_number,
        questionText: q.question_text,
        choices: [q.choice_1, q.choice_2, q.choice_3, q.choice_4, q.choice_5]
          .map((text, i) => ({ index: i + 1, text }))
          .filter((c) => c.text !== null && c.text !== ""),
      })),
    }));

  return noStoreJson({
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.started_at,
      submittedAt: session.submitted_at,
      totalScore: session.test.show_score_to_student ? session.total_score : null,
      autoSubmitted: session.auto_submitted,
    },
    test: {
      id: session.test.id,
      title: session.test.title,
      timeLimitMinutes: session.test.time_limit_minutes,
      leaveDetectionEnabled: session.test.leave_detection_enabled,
      leaveGraceSeconds: session.test.leave_grace_seconds,
      leaveCountThreshold: session.test.leave_count_threshold,
      leaveDurationThresholdSeconds: session.test.leave_duration_threshold_seconds,
      leaveAction: session.test.leave_action,
      leaveWarningMessage: session.test.leave_warning_message,
      startScreenMessage: session.test.start_screen_message,
      showScoreToStudent: session.test.show_score_to_student,
      // pause_release_pin is intentionally never sent to the client - only
      // the resume API verifies it server-side.
    },
    sections,
    answers: answerMap,
    totalQuestions: (questions ?? []).length,
    serverNow: new Date().toISOString(),
  });
}
