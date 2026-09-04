import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { loadSessionForStudent, submitIfExpired } from "@/lib/testSession";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  let body: { pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }
  const pin = (body.pin ?? "").trim();

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

  // Only a teacher who knows the test's release PIN can unlock a paused
  // session - the student is not shown this PIN, so a self-service "resume"
  // button is intentionally not enough here.
  if (!session.test.pause_release_pin || pin !== session.test.pause_release_pin) {
    return NextResponse.json({ error: "PINが正しくありません" }, { status: 403 });
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
