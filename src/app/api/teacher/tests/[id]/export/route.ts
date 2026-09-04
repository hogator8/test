import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toCsvWithBom } from "@/lib/csv";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const testId = params.id;
  const includeAll = req.nextUrl.searchParams.get("includeAll") === "true";

  const { data: test, error: testError } = await supabase
    .from("tests")
    .select("*")
    .eq("id", testId)
    .single();

  if (testError || !test) {
    return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("*")
    .eq("test_id", testId)
    .order("section_number", { ascending: true })
    .order("question_number", { ascending: true });

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  // Two separate queries (not an embedded join) so every session for this
  // test is included regardless of status or answer count - see the same
  // fix in the sibling list route for why.
  const { data: sessions, error: sessionsError } = await supabase
    .from("test_sessions")
    .select("id, student_id, status, started_at, submitted_at, total_score, auto_submitted")
    .eq("test_id", testId);

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const studentIds = Array.from(new Set((sessions ?? []).map((s) => s.student_id)));
  const studentsById: Record<string, { id: string; student_id: string; name: string }> = {};
  if (studentIds.length > 0) {
    const { data: students } = await supabase
      .from("students")
      .select("id, student_id, name")
      .in("id", studentIds);
    for (const st of students ?? []) {
      studentsById[st.id] = st;
    }
  }

  const sessionIds = (sessions ?? []).map((s) => s.id);

  const answersBySession: Record<string, Record<string, { selected: number | null; correct: boolean | null }>> = {};
  if (sessionIds.length > 0) {
    const { data: answers } = await supabase
      .from("answers")
      .select("session_id, question_id, selected_choice, is_correct")
      .in("session_id", sessionIds);
    for (const a of answers ?? []) {
      if (!answersBySession[a.session_id]) answersBySession[a.session_id] = {};
      answersBySession[a.session_id][a.question_id] = {
        selected: a.selected_choice,
        correct: a.is_correct,
      };
    }
  }

  const leaveStats: Record<string, { count: number; durationSeconds: number }> = {};
  for (const id of sessionIds) leaveStats[id] = { count: 0, durationSeconds: 0 };
  if (sessionIds.length > 0) {
    const { data: logs } = await supabase
      .from("proctoring_logs")
      .select("session_id, duration_seconds")
      .in("session_id", sessionIds);
    for (const log of logs ?? []) {
      if (log.duration_seconds !== null && log.duration_seconds >= test.leave_grace_seconds) {
        leaveStats[log.session_id].count += 1;
        leaveStats[log.session_id].durationSeconds += log.duration_seconds;
      }
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
    "受験開始時刻",
    "提出時刻",
    "ステータス",
    "合計得点",
    ...questionHeaders,
    "離脱回数",
    "離脱合計時間(秒)",
    "自動提出フラグ",
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
      questionCells.push(choiceText, a.correct ? "正解" : "不正解");
    }

    rows.push([
      student?.student_id ?? "",
      student?.name ?? "",
      s.started_at,
      s.submitted_at ?? "",
      statusLabel[s.status] ?? s.status,
      s.total_score ?? "",
      ...questionCells,
      leaveStats[s.id]?.count ?? 0,
      leaveStats[s.id]?.durationSeconds ?? 0,
      s.auto_submitted ? "TRUE" : "FALSE",
    ]);
  }

  if (includeAll) {
    const { data: allStudents } = await supabase.from("students").select("id, student_id, name");
    const testedStudentDbIds = new Set((sessions ?? []).map((s) => s.student_id));
    const questionCellsEmpty: (string | number | null)[] = [];
    for (const _q of questions ?? []) questionCellsEmpty.push("", "");

    for (const student of allStudents ?? []) {
      if (testedStudentDbIds.has(student.id)) continue;
      rows.push([
        student.student_id,
        student.name,
        "",
        "",
        "未受験",
        "",
        ...questionCellsEmpty,
        "",
        "",
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
