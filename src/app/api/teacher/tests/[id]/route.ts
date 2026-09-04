import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { noStoreJson } from "@/lib/http";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

const LEAVE_ACTIONS = new Set(["warning_only", "auto_pause", "auto_submit"]);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const testId = params.id;

  // The four queries below are all independent of one another - run them
  // concurrently instead of one-by-one to avoid a slow request waterfall.
  // (Sessions exclude soft-deleted rows so a teacher-deleted record drops
  // out of this list - see supabase/migration_v4a.sql.)
  const [testResult, questionCountResult, sessionsResult, totalStudentsResult] = await Promise.all([
    supabase.from("tests").select("*").eq("id", testId).single(),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("test_id", testId),
    supabase
      .from("test_sessions")
      .select("id, student_id, status, started_at, submitted_at, total_score, auto_submitted")
      .eq("test_id", testId)
      .is("deleted_at", null)
      .order("started_at", { ascending: true }),
    supabase.from("students").select("id", { count: "exact", head: true }),
  ]);

  const { data: test, error: testError } = testResult;
  if (testError || !test) {
    return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });
  }

  const { data: sessions, error: sessionsError } = sessionsResult;
  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const questionCount = questionCountResult.count;
  const totalStudents = totalStudentsResult.count;

  // Fetch students and proctoring logs as two separate, unconditional
  // queries (rather than a single embedded/joined select) so that every
  // session for this test is guaranteed to show up here regardless of its
  // status or whether it has any answers - a join-based query previously
  // caused sessions with no answers or with auto_submitted=true to go
  // missing from this list even though they were present in the exported
  // CSV. These two queries are independent of each other, so run them
  // concurrently too.
  const studentIds = Array.from(new Set((sessions ?? []).map((s) => s.student_id)));
  const sessionIds = (sessions ?? []).map((s) => s.id);

  const [studentsResult, logsResult] = await Promise.all([
    studentIds.length > 0
      ? supabase.from("students").select("id, student_id, name").in("id", studentIds)
      : Promise.resolve({ data: [] as { id: string; student_id: string; name: string }[] }),
    sessionIds.length > 0
      ? supabase.from("proctoring_logs").select("session_id, duration_seconds").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as { session_id: string; duration_seconds: number | null }[] }),
  ]);

  const studentsById: Record<string, { student_id: string; name: string }> = {};
  for (const st of studentsResult.data ?? []) {
    studentsById[st.id] = { student_id: st.student_id, name: st.name };
  }

  const leaveStats: Record<string, { count: number; durationSeconds: number }> = {};
  for (const id of sessionIds) leaveStats[id] = { count: 0, durationSeconds: 0 };
  for (const log of logsResult.data ?? []) {
    if (log.duration_seconds !== null && log.duration_seconds >= test.leave_grace_seconds) {
      leaveStats[log.session_id].count += 1;
      leaveStats[log.session_id].durationSeconds += log.duration_seconds;
    }
  }

  return noStoreJson({
    test,
    totalQuestions: questionCount ?? 0,
    totalStudents: totalStudents ?? 0,
    sessions: (sessions ?? []).map((s) => ({
      id: s.id,
      studentId: studentsById[s.student_id]?.student_id ?? "",
      studentName: studentsById[s.student_id]?.name ?? "",
      status: s.status,
      startedAt: s.started_at,
      submittedAt: s.submitted_at,
      totalScore: s.total_score,
      autoSubmitted: s.auto_submitted,
      leaveCount: leaveStats[s.id]?.count ?? 0,
      leaveDurationSeconds: leaveStats[s.id]?.durationSeconds ?? 0,
    })),
  });
}

interface UpdateTestBody {
  title?: string;
  passcode?: string;
  timeLimitEnabled?: boolean;
  timeLimitMinutes?: string | number | null;
  leaveDetectionEnabled?: boolean;
  leaveGraceSeconds?: string | number;
  leaveCountThreshold?: string | number | null;
  leaveDurationThresholdSeconds?: string | number | null;
  leaveAction?: string;
  leaveWarningMessage?: string | null;
  pauseReleasePin?: string | null;
  startScreenMessage?: string | null;
  showScoreToStudent?: boolean;
}

// Editing a test only changes how future leave-detection / time-limit
// judgements are made; it never rewrites proctoring_logs, session_resume_logs
// or answers that were already recorded under the old settings.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const testId = params.id;

  let body: UpdateTestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const passcode = (body.passcode ?? "").trim();
  const leaveAction = (body.leaveAction ?? "warning_only").trim();
  const leaveDetectionEnabled = Boolean(body.leaveDetectionEnabled);
  const leaveWarningMessage = (body.leaveWarningMessage ?? "").trim();
  const pauseReleasePin = (body.pauseReleasePin ?? "").trim();
  const startScreenMessage = (body.startScreenMessage ?? "").trim();
  const showScoreToStudent = body.showScoreToStudent !== false;

  if (!title) {
    return NextResponse.json({ error: "テスト名を入力してください" }, { status: 400 });
  }
  if (!passcode) {
    return NextResponse.json({ error: "パスコードを入力してください" }, { status: 400 });
  }
  if (!LEAVE_ACTIONS.has(leaveAction)) {
    return NextResponse.json({ error: "離脱時の挙動が不正です" }, { status: 400 });
  }

  let timeLimitMinutes: number | null = null;
  if (body.timeLimitEnabled) {
    const n = Number(body.timeLimitMinutes);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: "制限時間(分)は正の整数で入力してください" }, { status: 400 });
    }
    timeLimitMinutes = n;
  }

  const leaveGraceSeconds = Number(body.leaveGraceSeconds ?? 3);
  if (!Number.isInteger(leaveGraceSeconds) || leaveGraceSeconds < 0) {
    return NextResponse.json({ error: "許容秒数は0以上の整数で入力してください" }, { status: 400 });
  }

  let leaveCountThreshold: number | null = null;
  if (body.leaveCountThreshold !== null && body.leaveCountThreshold !== undefined && body.leaveCountThreshold !== "") {
    const n = Number(body.leaveCountThreshold);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "累計離脱回数のしきい値が不正です" }, { status: 400 });
    }
    leaveCountThreshold = n;
  }

  let leaveDurationThreshold: number | null = null;
  if (
    body.leaveDurationThresholdSeconds !== null &&
    body.leaveDurationThresholdSeconds !== undefined &&
    body.leaveDurationThresholdSeconds !== ""
  ) {
    const n = Number(body.leaveDurationThresholdSeconds);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "累計離脱時間のしきい値が不正です" }, { status: 400 });
    }
    leaveDurationThreshold = n;
  }

  if (leaveDetectionEnabled && leaveAction === "auto_pause" && !/^\d{4}$/.test(pauseReleasePin)) {
    return NextResponse.json(
      { error: "自動一時停止を選択する場合、解除用の4桁PIN(数字)を設定してください" },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("tests")
    .update({
      title,
      passcode,
      time_limit_minutes: timeLimitMinutes,
      leave_detection_enabled: leaveDetectionEnabled,
      leave_grace_seconds: leaveGraceSeconds,
      leave_count_threshold: leaveCountThreshold,
      leave_duration_threshold_seconds: leaveDurationThreshold,
      leave_action: leaveAction,
      leave_warning_message: leaveWarningMessage || null,
      pause_release_pin: pauseReleasePin || null,
      start_screen_message: startScreenMessage || null,
      show_score_to_student: showScoreToStudent,
    })
    .eq("id", testId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json({ error: "このパスコードは既に使用されています" }, { status: 400 });
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const testId = params.id;

  // questions and test_sessions both cascade-delete from tests (and
  // answers/proctoring_logs/session_resume_logs cascade further from
  // test_sessions), so a single delete here removes everything.
  const { error, count } = await supabase
    .from("tests")
    .delete({ count: "exact" })
    .eq("id", testId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
