import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";

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
    .select("id")
    .eq("passcode", passcode)
    .maybeSingle();

  if (testError) {
    return NextResponse.json({ error: testError.message }, { status: 500 });
  }
  if (!test) {
    return NextResponse.json({ error: "パスコードが正しくありません" }, { status: 404 });
  }

  const { data: existingSession, error: sessionError } = await supabase
    .from("test_sessions")
    .select("id, status")
    .eq("student_id", payload.studentDbId)
    .eq("test_id", test.id)
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

  const { data: newSession, error: createError } = await supabase
    .from("test_sessions")
    .insert({ student_id: payload.studentDbId, test_id: test.id })
    .select("id")
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessionId: newSession.id });
}
