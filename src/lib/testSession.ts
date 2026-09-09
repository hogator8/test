import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionWithTest {
  id: string;
  student_id: string;
  test_id: string;
  status: "in_progress" | "paused" | "submitted";
  started_at: string;
  submitted_at: string | null;
  total_score: number | null;
  auto_submitted: boolean;
  leave_violation_count: number;
  leave_stage_reached: number;
  current_stage_started_at: string;
  // Generated once at session creation and reused for the session's whole
  // lifetime - null when the test doesn't randomize that aspect.
  question_order: string[] | null;
  choice_orders: Record<string, number[]> | null;
  test: {
    id: string;
    title: string;
    time_limit_minutes: number | null;
    leave_detection_enabled: boolean;
    leave_grace_seconds: number;
    leave_count_threshold: number | null;
    leave_duration_threshold_seconds: number | null;
    leave_action: "warning_only" | "auto_pause" | "auto_submit";
    // Raw jsonb column - may still be the legacy string-array format for
    // rows that predate v7. Always pass this through normalizeStagedActions()
    // before use; never assume the shape here.
    leave_staged_actions: unknown;
    leave_warning_message: string | null;
    pause_release_pin: string | null;
    start_screen_message: string | null;
    show_score_to_student: boolean;
  };
}

type LoadResult =
  | { ok: true; session: SessionWithTest }
  | { ok: false; error: string; status: number };

export async function loadSessionForStudent(
  supabase: SupabaseClient,
  sessionId: string,
  studentDbId: string
): Promise<LoadResult> {
  const { data, error } = await supabase
    .from("test_sessions")
    .select(
      "id, student_id, test_id, status, started_at, submitted_at, total_score, auto_submitted, leave_violation_count, leave_stage_reached, current_stage_started_at, question_order, choice_orders, tests(id, title, time_limit_minutes, leave_detection_enabled, leave_grace_seconds, leave_count_threshold, leave_duration_threshold_seconds, leave_action, leave_staged_actions, leave_warning_message, pause_release_pin, start_screen_message, show_score_to_student)"
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: false, error: "セッションが見つかりません", status: 404 };
  if (data.student_id !== studentDbId) {
    return { ok: false, error: "このセッションにアクセスする権限がありません", status: 403 };
  }

  const testRaw = (data as unknown as { tests: unknown }).tests;
  const test = Array.isArray(testRaw) ? testRaw[0] : testRaw;

  return {
    ok: true,
    session: {
      id: data.id,
      student_id: data.student_id,
      test_id: data.test_id,
      status: data.status,
      started_at: data.started_at,
      submitted_at: data.submitted_at,
      total_score: data.total_score,
      auto_submitted: data.auto_submitted,
      leave_violation_count: data.leave_violation_count,
      leave_stage_reached: data.leave_stage_reached,
      current_stage_started_at: data.current_stage_started_at,
      question_order: data.question_order,
      choice_orders: data.choice_orders,
      test: test as SessionWithTest["test"],
    },
  };
}

export function isTimeExpired(session: SessionWithTest, now: Date): boolean {
  if (!session.test.time_limit_minutes) return false;
  const deadline =
    new Date(session.started_at).getTime() + session.test.time_limit_minutes * 60_000;
  return now.getTime() >= deadline;
}

/**
 * Score = sum of points() for every correctly-answered question, not a raw
 * correct-answer count. Computed once at submit time and stored on the
 * session (see submitSession below); editing a question's points later
 * never retroactively changes an already-submitted session's total_score.
 */
export async function computeScore(supabase: SupabaseClient, sessionId: string): Promise<number> {
  const { data, error } = await supabase
    .from("answers")
    .select("is_correct, questions(points)")
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, a) => {
    if (a.is_correct !== true) return sum;
    const q = a.questions as unknown as { points: number } | { points: number }[] | null;
    const points = Array.isArray(q) ? q[0]?.points : q?.points;
    return sum + (points ?? 1);
  }, 0);
}

/** Perfect-score total for a test: the sum of points() across its currently active (non-deleted) questions. */
export async function computeMaxScore(supabase: SupabaseClient, testId: string): Promise<number> {
  const { data, error } = await supabase
    .from("questions")
    .select("points")
    .eq("test_id", testId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, q) => sum + (q.points ?? 1), 0);
}

export async function submitSession(
  supabase: SupabaseClient,
  sessionId: string,
  autoSubmitted: boolean
): Promise<{ totalScore: number; submittedAt: string }> {
  const totalScore = await computeScore(supabase, sessionId);
  const submittedAt = new Date().toISOString();
  const { error } = await supabase
    .from("test_sessions")
    .update({
      status: "submitted",
      submitted_at: submittedAt,
      total_score: totalScore,
      auto_submitted: autoSubmitted,
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
  return { totalScore, submittedAt };
}

/**
 * If the test's time limit has passed and the session isn't submitted yet,
 * force-submit it (auto_submitted = true). Server-authoritative so a
 * manipulated client clock can't extend the exam. Returns the up-to-date
 * session state either way.
 */
export async function submitIfExpired(
  supabase: SupabaseClient,
  session: SessionWithTest
): Promise<SessionWithTest> {
  if (session.status === "submitted") return session;
  if (!isTimeExpired(session, new Date())) return session;

  const { totalScore, submittedAt } = await submitSession(supabase, session.id, true);
  return {
    ...session,
    status: "submitted",
    submitted_at: submittedAt,
    total_score: totalScore,
    auto_submitted: true,
  };
}
