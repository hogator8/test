import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { generateQuestionOrder, generateChoiceOrders } from "@/lib/randomize";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) {
    return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });
  }

  let body: { passcode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const passcode = (body.passcode ?? "").trim();
  if (!passcode) {
    return NextResponse.json({ error: "パスコードを入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: test, error: testError } = await supabase
    .from("tests")
    .select("id, organization_id, assigned_classes, randomize_questions, randomize_choices")
    .eq("passcode", passcode)
    .maybeSingle();

  if (testError) {
    return NextResponse.json({ error: testError.message }, { status: 500 });
  }
  if (!test) {
    return NextResponse.json({ error: "パスコードが正しくありません" }, { status: 404 });
  }

  // tests.passcode is still globally unique (not per-organization), so a
  // student must also belong to the same organization as the test -
  // otherwise they could take another school's test just by
  // guessing/knowing its passcode.
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("class_name, organization_id")
    .eq("id", payload.studentDbId)
    .maybeSingle();
  if (studentError) {
    return NextResponse.json({ error: studentError.message }, { status: 500 });
  }
  if (!student || student.organization_id !== test.organization_id) {
    return NextResponse.json({ error: "パスコードが正しくありません" }, { status: 404 });
  }

  if (test.assigned_classes && test.assigned_classes.length > 0) {
    if (!student.class_name || !test.assigned_classes.includes(student.class_name)) {
      return NextResponse.json(
        { error: "このテストはあなたのクラスでは受験できません" },
        { status: 403 }
      );
    }
  }

  // Only an active (non-deleted) session counts: if a teacher soft-deleted a
  // previous session for this student/test pair, this lookup finds nothing
  // and a fresh session is created below, allowing a re-take.
  const { data: existingSession, error: sessionError } = await supabase
    .from("test_sessions")
    .select("id, status")
    .eq("student_id", payload.studentDbId)
    .eq("test_id", test.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  if (existingSession) {
    if (existingSession.status === "submitted") {
      return NextResponse.json({ error: "このテストは受験済みです" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, sessionId: existingSession.id });
  }

  // Generated once here and reused for the lifetime of the session (never
  // regenerated on reload/resume) so the student always sees the same
  // order. A later re-take creates a brand-new session row via this same
  // path, so it naturally gets a freshly generated order too.
  let questionOrder: string[] | null = null;
  let choiceOrders: Record<string, number[]> | null = null;
  if (test.randomize_questions || test.randomize_choices) {
    const { data: activeQuestions, error: questionsError } = await supabase
      .from("questions")
      .select("id, section_number, question_number, question_type, choice_1, choice_2, choice_3, choice_4, choice_5, choice_6, choice_7, choice_8, choice_9, choice_10")
      .eq("test_id", test.id)
      .is("deleted_at", null);
    if (questionsError) {
      return NextResponse.json({ error: questionsError.message }, { status: 500 });
    }
    if (test.randomize_questions) {
      questionOrder = generateQuestionOrder(activeQuestions ?? [], true);
    }
    if (test.randomize_choices) {
      choiceOrders = generateChoiceOrders(activeQuestions ?? [], true);
    }
  }

  const { data: newSession, error: createError } = await supabase
    .from("test_sessions")
    .insert({
      student_id: payload.studentDbId,
      test_id: test.id,
      question_order: questionOrder,
      choice_orders: choiceOrders,
    })
    .select("id")
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessionId: newSession.id });
}
