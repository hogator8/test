import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { noStoreJson } from "@/lib/http";
import { parseQuestionCsv } from "@/lib/questionCsv";
import { validateLeaveSettings } from "@/lib/testValidation";
import type { LeaveStage } from "@/lib/leaveStages";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: tests, error } = await supabase
    .from("tests")
    .select("id, title, passcode, time_limit_minutes, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const testIds = (tests ?? []).map((t) => t.id);
  const counts: Record<string, { questions: number; sessions: number }> = {};
  for (const id of testIds) counts[id] = { questions: 0, sessions: 0 };

  if (testIds.length > 0) {
    const [{ data: questions }, { data: sessions }] = await Promise.all([
      supabase.from("questions").select("test_id").in("test_id", testIds).is("deleted_at", null),
      supabase.from("test_sessions").select("test_id").in("test_id", testIds).is("deleted_at", null),
    ]);
    for (const q of questions ?? []) {
      counts[q.test_id].questions += 1;
    }
    for (const s of sessions ?? []) {
      counts[s.test_id].sessions += 1;
    }
  }

  return noStoreJson({
    tests: (tests ?? []).map((t) => ({ ...t, ...counts[t.id] })),
  });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const title = String(formData.get("title") ?? "").trim();
  const passcode = String(formData.get("passcode") ?? "").trim();
  const timeLimitEnabled = formData.get("timeLimitEnabled") === "true";
  const timeLimitMinutesRaw = String(formData.get("timeLimitMinutes") ?? "").trim();
  const leaveDetectionEnabled = formData.get("leaveDetectionEnabled") === "true";
  const leaveGraceSecondsRaw = String(formData.get("leaveGraceSeconds") ?? "3").trim();
  const leaveCountThresholdRaw = String(formData.get("leaveCountThreshold") ?? "").trim();
  const leaveDurationThresholdRaw = String(formData.get("leaveDurationThresholdSeconds") ?? "").trim();
  const leaveAction = String(formData.get("leaveAction") ?? "warning_only").trim();
  const leaveStagedMode = formData.get("leaveStagedMode") === "true";
  let leaveStagedActions: LeaveStage[] = [];
  try {
    leaveStagedActions = JSON.parse(String(formData.get("leaveStagedActions") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "段階設定の形式が不正です" }, { status: 400 });
  }
  const leaveWarningMessage = String(formData.get("leaveWarningMessage") ?? "").trim();
  const pauseReleasePin = String(formData.get("pauseReleasePin") ?? "").trim();
  const startScreenMessage = String(formData.get("startScreenMessage") ?? "").trim();
  const showScoreToStudent = formData.get("showScoreToStudent") !== "false";
  const file = formData.get("file");

  if (!title) {
    return NextResponse.json({ error: "テスト名を入力してください" }, { status: 400 });
  }
  if (!passcode) {
    return NextResponse.json({ error: "パスコードを入力してください" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "問題CSVファイルを選択してください" }, { status: 400 });
  }

  let timeLimitMinutes: number | null = null;
  if (timeLimitEnabled) {
    const n = Number(timeLimitMinutesRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: "制限時間(分)は正の整数で入力してください" }, { status: 400 });
    }
    timeLimitMinutes = n;
  }

  const leaveGraceSeconds = Number(leaveGraceSecondsRaw);
  if (!Number.isInteger(leaveGraceSeconds) || leaveGraceSeconds < 0) {
    return NextResponse.json({ error: "許容秒数は0以上の整数で入力してください" }, { status: 400 });
  }

  let leaveCountThreshold: number | null = null;
  if (leaveCountThresholdRaw !== "") {
    const n = Number(leaveCountThresholdRaw);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "累計離脱回数のしきい値が不正です" }, { status: 400 });
    }
    leaveCountThreshold = n;
  }

  let leaveDurationThreshold: number | null = null;
  if (leaveDurationThresholdRaw !== "") {
    const n = Number(leaveDurationThresholdRaw);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "累計離脱時間のしきい値が不正です" }, { status: 400 });
    }
    leaveDurationThreshold = n;
  }

  const leaveError = validateLeaveSettings({
    leaveDetectionEnabled,
    leaveAction,
    leaveStagedMode,
    leaveStagedActions,
    pauseReleasePin,
  });
  if (leaveError) {
    return NextResponse.json({ error: leaveError }, { status: 400 });
  }

  const rawText = await file.text();
  const { errors, questions: parsedQuestions, parseError } = parseQuestionCsv(rawText);
  if (parseError) {
    return NextResponse.json({ error: "問題CSVの解析に失敗しました: " + parseError }, { status: 400 });
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: "問題CSVの内容にエラーがあります", errors }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: test, error: insertTestError } = await supabase
    .from("tests")
    .insert({
      title,
      passcode,
      time_limit_minutes: timeLimitMinutes,
      leave_detection_enabled: leaveDetectionEnabled,
      leave_grace_seconds: leaveGraceSeconds,
      leave_count_threshold: leaveCountThreshold,
      leave_duration_threshold_seconds: leaveDurationThreshold,
      leave_action: leaveAction,
      leave_staged_actions: leaveDetectionEnabled && leaveStagedMode ? leaveStagedActions : null,
      leave_warning_message: leaveWarningMessage || null,
      pause_release_pin: pauseReleasePin || null,
      start_screen_message: startScreenMessage || null,
      show_score_to_student: showScoreToStudent,
    })
    .select("id")
    .single();

  if (insertTestError) {
    if (insertTestError.code === "23505") {
      return NextResponse.json({ error: "このパスコードは既に使用されています" }, { status: 400 });
    }
    return NextResponse.json({ error: insertTestError.message }, { status: 500 });
  }

  const questionRows = parsedQuestions.map(({ row: _row, ...q }) => ({ ...q, test_id: test.id }));
  const { error: insertQuestionsError } = await supabase.from("questions").insert(questionRows);

  if (insertQuestionsError) {
    // Roll back the test row so we don't leave an empty test behind.
    await supabase.from("tests").delete().eq("id", test.id);
    return NextResponse.json({ error: insertQuestionsError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, testId: test.id });
}
