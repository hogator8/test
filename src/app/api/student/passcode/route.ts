import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signStudentToken, verifyStudentCandidatesToken, STUDENT_COOKIE, STUDENT_CANDIDATES_COOKIE } from "@/lib/auth";
import { generateQuestionOrder, generateChoiceOrders } from "@/lib/randomize";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const candidatesPayload = await verifyStudentCandidatesToken(
    req.cookies.get(STUDENT_CANDIDATES_COOKIE)?.value
  );
  if (!candidatesPayload) {
    return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });
  }

  let body: { passcode?: string; organizationId?: string };
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
  const orgIds = candidatesPayload.candidates.map((c) => c.organizationId);

  // Since v16, tests.passcode is only unique per-organization, so the same
  // passcode can legitimately match tests in more than one of the student's
  // candidate organizations - narrow to those the student actually logged
  // into, then let them pick if more than one still matches.
  const { data: matchingTests, error: testError } = await supabase
    .from("tests")
    .select("id, organization_id, title, assigned_classes, randomize_questions, randomize_choices")
    .eq("passcode", passcode)
    .in("organization_id", orgIds);

  if (testError) {
    return NextResponse.json({ error: testError.message }, { status: 500 });
  }
  if (!matchingTests || matchingTests.length === 0) {
    return NextResponse.json({ error: "パスコードが正しくありません" }, { status: 404 });
  }

  let test = matchingTests[0];
  if (matchingTests.length > 1) {
    if (!body.organizationId) {
      return NextResponse.json({
        ok: true,
        needsSelection: true,
        options: matchingTests.map((t) => ({ organizationId: t.organization_id, title: t.title })),
      });
    }
    const chosen = matchingTests.find((t) => t.organization_id === body.organizationId);
    if (!chosen) {
      return NextResponse.json({ error: "パスコードが正しくありません" }, { status: 404 });
    }
    test = chosen;
  }

  const candidate = candidatesPayload.candidates.find((c) => c.organizationId === test.organization_id);
  if (!candidate) {
    return NextResponse.json({ error: "パスコードが正しくありません" }, { status: 404 });
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, student_id, name, class_name")
    .eq("id", candidate.studentDbId)
    .maybeSingle();
  if (studentError) {
    return NextResponse.json({ error: studentError.message }, { status: 500 });
  }
  if (!student) {
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

  // Now that the organization/student pair is confirmed, resolve the
  // session context - this overwrites any previously-resolved cookie (e.g.
  // from a prior test taken via the HOME flow, possibly in a different
  // organization), while the candidates cookie itself is left untouched so
  // HOME can re-enter this same disambiguation step again later.
  const token = await signStudentToken({
    studentDbId: student.id,
    studentId: student.student_id,
    name: student.name,
  });

  // Only an active (non-deleted) session counts: if a teacher soft-deleted a
  // previous session for this student/test pair, this lookup finds nothing
  // and a fresh session is created below, allowing a re-take.
  const { data: existingSession, error: sessionError } = await supabase
    .from("test_sessions")
    .select("id, status")
    .eq("student_id", student.id)
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
    const res = NextResponse.json({ ok: true, sessionId: existingSession.id });
    setResolvedCookie(res, token);
    return res;
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
      student_id: student.id,
      test_id: test.id,
      question_order: questionOrder,
      choice_orders: choiceOrders,
    })
    .select("id")
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, sessionId: newSession.id });
  setResolvedCookie(res, token);
  return res;
}

function setResolvedCookie(res: NextResponse, token: string) {
  res.cookies.set(STUDENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}
