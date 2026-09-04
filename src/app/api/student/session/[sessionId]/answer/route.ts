import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { loadSessionForStudent, submitIfExpired } from "@/lib/testSession";

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  let body: { questionId?: string; selectedChoice?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const { questionId, selectedChoice } = body;
  if (!questionId || !Number.isInteger(selectedChoice) || (selectedChoice as number) < 1 || (selectedChoice as number) > 5) {
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
    .select("id, test_id, choice_1, choice_2, choice_3, choice_4, choice_5, correct_answer")
    .eq("id", questionId)
    .maybeSingle();

  if (questionError) return NextResponse.json({ error: questionError.message }, { status: 500 });
  if (!question || question.test_id !== session.test_id) {
    return NextResponse.json({ error: "この設問はこのテストに属していません" }, { status: 400 });
  }

  const choiceCount = [
    question.choice_1,
    question.choice_2,
    question.choice_3,
    question.choice_4,
    question.choice_5,
  ].filter((c) => c !== null && c !== "").length;

  if ((selectedChoice as number) > choiceCount) {
    return NextResponse.json({ error: "選択肢の範囲外です" }, { status: 400 });
  }

  const isCorrect = selectedChoice === question.correct_answer;

  const { error: upsertError } = await supabase.from("answers").upsert(
    {
      session_id: session.id,
      question_id: questionId,
      selected_choice: selectedChoice,
      is_correct: isCorrect,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "session_id,question_id" }
  );

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
