import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { loadSessionForStudent, submitIfExpired } from "@/lib/testSession";

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const result = await loadSessionForStudent(supabase, params.sessionId, payload.studentDbId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  let session = result.session;
  session = await submitIfExpired(supabase, session);

  if (session.status === "submitted") {
    return NextResponse.json(
      { error: "制限時間を超えたため自動提出されました", submitted: true, totalScore: session.total_score },
      { status: 409 }
    );
  }
  if (session.status !== "paused") {
    return NextResponse.json({ error: "一時停止中ではありません" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("test_sessions")
    .update({ status: "in_progress" })
    .eq("id", session.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: logError } = await supabase
    .from("session_resume_logs")
    .insert({ session_id: session.id, resumed_at: new Date().toISOString() });
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
