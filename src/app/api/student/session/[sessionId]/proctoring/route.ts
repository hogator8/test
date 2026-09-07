import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyStudentToken, STUDENT_COOKIE } from "@/lib/auth";
import { loadSessionForStudent, submitIfExpired, submitSession } from "@/lib/testSession";
import { normalizeStagedActions, isStageThresholdMet } from "@/lib/leaveStages";

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

  // This event counts as a "violation" (>= grace seconds). Bump the
  // server-side counter - it never resets, including across auto_pause/PIN
  // resume cycles, per spec. The client is responsible for coalescing
  // visibilitychange + fullscreenchange into a single call per physical
  // leave action, so this increment should correspond to exactly one
  // real-world leave.
  const newViolationCount = session.leave_violation_count + 1;
  const { error: countError } = await supabase
    .from("test_sessions")
    .update({ leave_violation_count: newViolationCount })
    .eq("id", session.id);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  // Cumulative violation *duration* (sum of every grace-exceeding log so
  // far), needed by both staged duration thresholds and legacy single-
  // threshold mode.
  const { data: logs, error: logsError } = await supabase
    .from("proctoring_logs")
    .select("duration_seconds")
    .eq("session_id", session.id);
  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 });

  const cumulativeDuration = (logs ?? [])
    .filter((l) => l.duration_seconds !== null && l.duration_seconds >= session.test.leave_grace_seconds)
    .reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0);

  async function execute(
    action: "warning_only" | "auto_pause" | "auto_submit",
    extra: Record<string, unknown>
  ) {
    switch (action) {
      case "auto_pause": {
        const { error } = await supabase.from("test_sessions").update({ status: "paused" }).eq("id", session.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ action: "paused", ...extra });
      }
      case "auto_submit": {
        const { totalScore, submittedAt } = await submitSession(supabase, session.id, true);
        return NextResponse.json({
          action: "auto_submit",
          totalScore: session.test.show_score_to_student ? totalScore : null,
          submittedAt,
          ...extra,
        });
      }
      case "warning_only":
      default:
        return NextResponse.json({ action: "warning", ...extra });
    }
  }

  const stagedActions = normalizeStagedActions(session.test.leave_staged_actions);
  if (stagedActions) {
    // Only the single next un-fired stage (leave_stage_reached) is ever
    // evaluated per call - even if this event's cumulative count/duration
    // already satisfies a later stage's thresholds too, that later stage is
    // left for a subsequent event. This is what guarantees one leave action
    // can never advance more than one stage at a time.
    const nextStageIndex = session.leave_stage_reached;
    if (nextStageIndex >= stagedActions.length) {
      // Every configured stage has already fired - do nothing further.
      return NextResponse.json({ action: "none", cumulativeCount: newViolationCount, cumulativeDuration });
    }

    const stage = stagedActions[nextStageIndex];
    if (!isStageThresholdMet(stage, newViolationCount, cumulativeDuration)) {
      return NextResponse.json({ action: "none", cumulativeCount: newViolationCount, cumulativeDuration });
    }

    // Compare-and-swap on leave_stage_reached: only proceed if no concurrent
    // request for this session already advanced past this stage. This is
    // the safety net behind the client-side event coalescing - even if two
    // requests somehow raced, only one of them will win this update and
    // actually execute the stage's action.
    const { data: advanced, error: advanceError } = await supabase
      .from("test_sessions")
      .update({ leave_stage_reached: nextStageIndex + 1 })
      .eq("id", session.id)
      .eq("leave_stage_reached", nextStageIndex)
      .select("id");
    if (advanceError) return NextResponse.json({ error: advanceError.message }, { status: 500 });
    if (!advanced || advanced.length === 0) {
      return NextResponse.json({ action: "none", cumulativeCount: newViolationCount, cumulativeDuration });
    }

    return execute(stage.action, {
      cumulativeCount: newViolationCount,
      cumulativeDuration,
      stage: nextStageIndex + 1,
    });
  }

  // Legacy single-threshold mode (unchanged): the configured action re-fires
  // on every violation once the threshold is exceeded, not just the first.
  const countExceeded =
    session.test.leave_count_threshold !== null && newViolationCount >= session.test.leave_count_threshold;
  const durationExceeded =
    session.test.leave_duration_threshold_seconds !== null &&
    cumulativeDuration >= session.test.leave_duration_threshold_seconds;

  if (!countExceeded && !durationExceeded) {
    return NextResponse.json({ action: "none", cumulativeCount: newViolationCount, cumulativeDuration });
  }

  return execute(session.test.leave_action, { cumulativeCount: newViolationCount, cumulativeDuration });
}
