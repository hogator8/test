import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { loadSessionForStudent, submitIfExpired, submitSession } from "@/lib/testSession";

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const result = await loadSessionForStudent(supabase, params.sessionId, payload.studentDbId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  let session = result.session;
  session = await submitIfExpired(supabase, session);

  if (session.status === "submitted") {
    return NextResponse.json({
      ok: true,
      totalScore: session.total_score,
      submittedAt: session.submitted_at,
      autoSubmitted: session.auto_submitted,
    });
  }

  const { totalScore, submittedAt } = await submitSession(supabase, session.id, false);

  return NextResponse.json({ ok: true, totalScore, submittedAt, autoSubmitted: false });
}
