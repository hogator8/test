import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { loadSessionForStudent, submitIfExpired, submitSession } from "@/lib/testSession";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set(["background", "fullscreen_exit"]);

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const payload = await verifyStudentToken(req.cookies.get(STUDENT_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  let body: { eventType?: string; leftAt?: string; returnedAt?: string; durationSeconds?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const { eventType, leftAt, returnedAt, durationSeconds } = body;
  if (
    !eventType ||
    !EVENT_TYPES.has(eventType) ||
    !leftAt ||
    !returnedAt ||
    typeof durationSeconds !== "number" ||
    durationSeconds < 0
  ) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const result = await loadSessionForStudent(supabase, params.sessionId, payload.studentDbId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  let session = result.session;
  session = await submitIfExpired(supabase, session);

  if (session.status === "submitted") {
    return NextResponse.json({ action: "already_submitted" });
  }
  if (!session.test.leave_detection_enabled) {
    return NextResponse.json({ action: "none" });
  }

  const { error: insertError } = await supabase.from("proctoring_logs").insert({
    session_id: session.id,
    event_type: eventType,
    left_at: leftAt,
    returned_at: returnedAt,
    duration_seconds: Math.round(durationSeconds),
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  if (durationSeconds < session.test.leave_grace_seconds) {
    return NextResponse.json({ action: "none" });
  }

  const { data: logs, error: logsError } = await supabase
    .from("proctoring_logs")
    .select("duration_seconds")
    .eq("session_id", session.id);
  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 });

  const effectiveLogs = (logs ?? []).filter(
    (l) => l.duration_seconds !== null && l.duration_seconds >= session.test.leave_grace_seconds
  );
  const cumulativeCount = effectiveLogs.length;
  const cumulativeDuration = effectiveLogs.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0);

  const countExceeded =
    session.test.leave_count_threshold !== null && cumulativeCount >= session.test.leave_count_threshold;
  const durationExceeded =
    session.test.leave_duration_threshold_seconds !== null &&
    cumulativeDuration >= session.test.leave_duration_threshold_seconds;

  if (!countExceeded && !durationExceeded) {
    return NextResponse.json({ action: "none", cumulativeCount, cumulativeDuration });
  }

  switch (session.test.leave_action) {
    case "auto_pause": {
      const { error } = await supabase
        .from("test_sessions")
        .update({ status: "paused" })
        .eq("id", session.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ action: "paused", cumulativeCount, cumulativeDuration });
    }
    case "auto_submit": {
      const { totalScore, submittedAt } = await submitSession(supabase, session.id, true);
      return NextResponse.json({
        action: "auto_submit",
        totalScore: session.test.show_score_to_student ? totalScore : null,
        submittedAt,
        cumulativeCount,
        cumulativeDuration,
      });
    }
    case "warning_only":
    default:
      return NextResponse.json({ action: "warning", cumulativeCount, cumulativeDuration });
  }
}
