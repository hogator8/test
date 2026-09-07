import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { loadSessionForStudent, submitIfExpired } from "@/lib/testSession";
import { choiceCount as countChoices } from "@/lib/questions";
import { isFreeTextCorrect } from "@/lib/textCompare";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  let body: { questionId?: string; selectedChoice?: number; freeTextResponse?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const { questionId, selectedChoice, freeTextResponse } = body;
  if (!questionId) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const result = await loadSessionForStudent(supabase, params.sessionId, payload.studentDbId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  let session = result.session;
  session = await submitIfExpired(supabase, session);

  if (session.status === "submitted") {
    return NextResponse.json(
      { error: "制限時間を超えたため自動提出されました", submitted: true },
      { status: 409 }
    );
  }
  if (session.status === "paused") {
    return NextResponse.json({ error: "一時停止中は解答できません。再開してください" }, { status: 409 });
  }

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, test_id, question_type, choice_1, choice_2, choice_3, choice_4, choice_5, choice_6, choice_7, choice_8, choice_9, choice_10, correct_answer, free_text_answer_1, free_text_answer_2, free_text_answer_3, free_text_answer_4, free_text_answer_5"
    )
    .eq("id", questionId)
    .maybeSingle();

  if (questionError) return NextResponse.json({ error: questionError.message }, { status: 500 });
  if (!question || question.test_id !== session.test_id) {
    return NextResponse.json({ error: "この設問はこのテストに属していません" }, { status: 400 });
  }

  let isCorrect: boolean;
  const update: {
    session_id: string;
    question_id: string;
    selected_choice: number | null;
    free_text_response: string | null;
    is_correct: boolean;
    answered_at: string;
  } = {
    session_id: session.id,
    question_id: questionId,
    selected_choice: null,
    free_text_response: null,
    is_correct: false,
    answered_at: new Date().toISOString(),
  };

  if (question.question_type === "free_text") {
    if (typeof freeTextResponse !== "string") {
      return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
    }
    isCorrect = isFreeTextCorrect(freeTextResponse, [
      question.free_text_answer_1,
      question.free_text_answer_2,
      question.free_text_answer_3,
      question.free_text_answer_4,
      question.free_text_answer_5,
    ]);
    update.free_text_response = freeTextResponse;
  } else {
    if (!Number.isInteger(selectedChoice) || (selectedChoice as number) < 1 || (selectedChoice as number) > 10) {
      return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
    }
    if ((selectedChoice as number) > countChoices(question)) {
      return NextResponse.json({ error: "選択肢の範囲外です" }, { status: 400 });
    }
    isCorrect = selectedChoice === question.correct_answer;
    update.selected_choice = selectedChoice as number;
  }

  update.is_correct = isCorrect;

  const { error: upsertError } = await supabase
    .from("answers")
    .upsert(update, { onConflict: "session_id,question_id" });

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
