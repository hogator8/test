import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { noStoreJson } from "@/lib/http";
import { buildChoices } from "@/lib/questions";
import { computeMaxScore } from "@/lib/testSession";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();

  const { data: session, error: sessionError } = await supabase
    .from("test_sessions")
    .select("id, student_id, test_id, status, submitted_at, total_score, deleted_at")
    .eq("id", params.sessionId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!session || session.student_id !== payload.studentDbId || session.deleted_at) {
    return NextResponse.json({ error: "受験結果が見つかりません" }, { status: 404 });
  }
  if (session.status !== "submitted") {
    return NextResponse.json({ error: "まだ提出されていません" }, { status: 400 });
  }

  const { data: test, error: testError } = await supabase
    .from("tests")
    .select("title, show_score_to_student")
    .eq("id", session.test_id)
    .single();

  if (testError || !test) {
    return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });
  }

  // Scores are intentionally hidden for this test - blocking the whole
  // feedback screen (rather than just hiding the score) avoids the
  // correct/incorrect color-coding itself leaking the score back.
  if (!test.show_score_to_student) {
    return NextResponse.json({ error: "このテストの結果は閲覧できません" }, { status: 403 });
  }

  const [
    { data: questions, error: questionsError },
    { data: answers, error: answersError },
    maxScore,
  ] = await Promise.all([
    supabase
      .from("questions")
      .select(
        "id, section_number, question_number, points, question_text, question_type, choice_1, choice_2, choice_3, choice_4, choice_5, choice_6, choice_7, choice_8, choice_9, choice_10, correct_answer, free_text_answer_1, free_text_answer_2, free_text_answer_3, free_text_answer_4, free_text_answer_5"
      )
      .eq("test_id", session.test_id)
      .order("section_number", { ascending: true })
      .order("question_number", { ascending: true }),
    supabase
      .from("answers")
      .select("question_id, selected_choice, free_text_response, is_correct")
      .eq("session_id", session.id),
    computeMaxScore(supabase, session.test_id),
  ]);

  if (questionsError) return NextResponse.json({ error: questionsError.message }, { status: 500 });
  if (answersError) return NextResponse.json({ error: answersError.message }, { status: 500 });

  const answersByQuestion: Record<
    string,
    { selected: number | null; freeText: string | null; correct: boolean | null }
  > = {};
  for (const a of answers ?? []) {
    answersByQuestion[a.question_id] = {
      selected: a.selected_choice,
      freeText: a.free_text_response,
      correct: a.is_correct,
    };
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
      questions: qs.map((q) => {
        const a = answersByQuestion[q.id];
        return {
          id: q.id,
          questionNumber: q.question_number,
          questionText: q.question_text,
          questionType: q.question_type,
          choices: buildChoices(q),
          selectedChoice: a?.selected ?? null,
          correctChoice: q.correct_answer,
          freeTextResponse: a?.freeText ?? null,
          freeTextCorrectAnswer: q.free_text_answer_1,
          isCorrect: a?.correct ?? false,
        };
      }),
    }));

  return noStoreJson({
    testTitle: test.title,
    submittedAt: session.submitted_at,
    totalScore: session.total_score,
    totalQuestions: (questions ?? []).length,
    maxScore,
    sections,
  });
}
