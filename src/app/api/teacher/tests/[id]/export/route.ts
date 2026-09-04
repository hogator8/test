import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toCsvWithBom } from "@/lib/csv";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const testId = params.id;
  const includeAll = req.nextUrl.searchParams.get("includeAll") === "true";

  // test / questions / sessions are independent of one another - fetch them
  // concurrently instead of as a sequential waterfall.
  const [testResult, questionsResult, sessionsResult] = await Promise.all([
    supabase.from("tests").select("*").eq("id", testId).single(),
    supabase
      .from("questions")
      .select("id, section_number, question_number, choice_1, choice_2, choice_3, choice_4, choice_5")
      .eq("test_id", testId)
      .order("section_number", { ascending: true })
      .order("question_number", { ascending: true }),
    // Deliberately NOT filtered by deleted_at: soft-deleted sessions must
    // still appear in the export, flagged via 削除フラグ.
    supabase
      .from("test_sessions")
      .select("id, student_id, status, started_at, submitted_at, total_score, auto_submitted, deleted_at")
      .eq("test_id", testId),
  ]);

  const { data: test, error: testError } = testResult;
  if (testError || !test) {
    return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });
  }

  const { data: questions, error: questionsError } = questionsResult;
  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  const { data: sessions, error: sessionsError } = sessionsResult;
  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const studentIds = Array.from(new Set((sessions ?? []).map((s) => s.student_id)));
  const sessionIds = (sessions ?? []).map((s) => s.id);

  interface StudentInfo {
    id: string;
    student_id: string;
    name: string;
    class_name: string | null;
    reading: string | null;
    nationality: string | null;
    gender: string | null;
  }

  // Students / answers / proctoring logs are independent of one another too.
  const [studentsResult, answersResult, logsResult] = await Promise.all([
    studentIds.length > 0
      ? supabase
          .from("students")
          .select("id, student_id, name, class_name, reading, nationality, gender")
          .in("id", studentIds)
      : Promise.resolve({ data: [] as StudentInfo[] }),
    sessionIds.length > 0
      ? supabase.from("answers").select("session_id, question_id, selected_choice, is_correct").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as { session_id: string; question_id: string; selected_choice: number | null; is_correct: boolean | null }[] }),
    sessionIds.length > 0
      ? supabase.from("proctoring_logs").select("session_id, duration_seconds").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as { session_id: string; duration_seconds: number | null }[] }),
  ]);

  const studentsById: Record<string, StudentInfo> = {};
  for (const st of studentsResult.data ?? []) {
    studentsById[st.id] = st;
  }

  const answersBySession: Record<string, Record<string, { selected: number | null; correct: boolean | null }>> = {};
  for (const a of answersResult.data ?? []) {
    if (!answersBySession[a.session_id]) answersBySession[a.session_id] = {};
    answersBySession[a.session_id][a.question_id] = {
      selected: a.selected_choice,
      correct: a.is_correct,
    };
  }

  const leaveStats: Record<string, { count: number; durationSeconds: number }> = {};
  for (const id of sessionIds) leaveStats[id] = { count: 0, durationSeconds: 0 };
  for (const log of logsResult.data ?? []) {
    if (log.duration_seconds !== null && log.duration_seconds >= test.leave_grace_seconds) {
      leaveStats[log.session_id].count += 1;
      leaveStats[log.session_id].durationSeconds += log.duration_seconds;
    }
  }

  const statusLabel: Record<string, string> = {
    in_progress: "受験中",
    paused: "一時停止",
    submitted: "提出済み",
  };

  const questionHeaders: string[] = [];
  for (const q of questions ?? []) {
    questionHeaders.push(`セクション${q.section_number}-問${q.question_number}回答`);
    questionHeaders.push(`セクション${q.section_number}-問${q.question_number}正誤`);
  }

  const header = [
    "学生ID",
    "学生氏名",
    "クラス名",
    "読み方",
    "国籍",
    "性別",
    "受験開始時刻",
    "提出時刻",
    "ステータス",
    "離脱回数",
    "離脱合計時間(秒)",
    "自動提出フラグ",
    "合計得点",
    ...questionHeaders,
    "削除フラグ",
  ];

  const rows: (string | number | null)[][] = [header];

  for (const s of sessions ?? []) {
    const student = studentsById[s.student_id];
    const answers = answersBySession[s.id] ?? {};
    const questionCells: (string | number | null)[] = [];
    for (const q of questions ?? []) {
      const a = answers[q.id];
      if (!a || a.selected === null || a.selected === undefined) {
        questionCells.push("未回答", "");
        continue;
      }
      const choiceText = (q as any)[`choice_${a.selected}`] ?? String(a.selected);
      questionCells.push(choiceText, a.correct ? "○" : "×");
    }

    rows.push([
      student?.student_id ?? "",
      student?.name ?? "",
      student?.class_name ?? "",
      student?.reading ?? "",
      student?.nationality ?? "",
      student?.gender ?? "",
      s.started_at,
      s.submitted_at ?? "",
      statusLabel[s.status] ?? s.status,
      leaveStats[s.id]?.count ?? 0,
      leaveStats[s.id]?.durationSeconds ?? 0,
      s.auto_submitted ? "TRUE" : "FALSE",
      s.total_score ?? "",
      ...questionCells,
      s.deleted_at ? "削除済み" : "",
    ]);
  }

  if (includeAll) {
    const { data: allStudents } = await supabase
      .from("students")
      .select("id, student_id, name, class_name, reading, nationality, gender");
    const testedStudentDbIds = new Set((sessions ?? []).map((s) => s.student_id));
    const questionCellsEmpty: (string | number | null)[] = [];
    for (const _q of questions ?? []) questionCellsEmpty.push("", "");

    for (const student of allStudents ?? []) {
      if (testedStudentDbIds.has(student.id)) continue;
      rows.push([
        student.student_id,
        student.name,
        student.class_name ?? "",
        student.reading ?? "",
        student.nationality ?? "",
        student.gender ?? "",
        "",
        "",
        "未受験",
        "",
        "",
        "",
        "",
        ...questionCellsEmpty,
        "",
      ]);
    }
  }

  const csv = toCsvWithBom(rows);
  const filenameSafeTitle = test.title.replace(/[\\/:*?"<>|]/g, "_");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(
        filenameSafeTitle
      )}.csv`,
    },
  });
}
