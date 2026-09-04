import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { getSupabaseAdmin } from "@/lib/supabase";

interface RowError {
  row: number;
  message: string;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const LEAVE_ACTIONS = new Set(["warning_only", "auto_pause", "auto_submit"]);

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
    const { data: questions } = await supabase.from("questions").select("test_id").in("test_id", testIds);
    for (const q of questions ?? []) {
      counts[q.test_id].questions += 1;
    }
    const { data: sessions } = await supabase.from("test_sessions").select("test_id").in("test_id", testIds);
    for (const s of sessions ?? []) {
      counts[s.test_id].sessions += 1;
    }
  }

  return NextResponse.json({
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
  const file = formData.get("file");

  if (!title) {
    return NextResponse.json({ error: "テスト名を入力してください" }, { status: 400 });
  }
  if (!passcode) {
    return NextResponse.json({ error: "パスコードを入力してください" }, { status: 400 });
  }
  if (!LEAVE_ACTIONS.has(leaveAction)) {
    return NextResponse.json({ error: "離脱時の挙動が不正です" }, { status: 400 });
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

  const rawText = stripBom(await file.text());
  const parsed = Papa.parse<string[]>(rawText, { skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: "問題CSVの解析に失敗しました: " + parsed.errors[0].message },
      { status: 400 }
    );
  }

  const allRows = parsed.data;
  if (allRows.length === 0) {
    return NextResponse.json({ error: "問題CSVにデータがありません" }, { status: 400 });
  }

  // The first row is always a header row (セクション番号,問題番号,...) and is skipped.
  const rows = allRows.slice(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "問題CSVにヘッダー行以外のデータがありません" }, { status: 400 });
  }

  const errors: RowError[] = [];
  const seenPairs = new Map<string, number>();
  type ParsedQuestion = {
    row: number;
    section_number: number;
    question_number: number;
    question_text: string;
    choice_1: string;
    choice_2: string;
    choice_3: string | null;
    choice_4: string | null;
    choice_5: string | null;
    correct_answer: number;
  };
  const parsedQuestions: ParsedQuestion[] = [];

  rows.forEach((cols, idx) => {
    const rowNum = idx + 2; // +1 for 1-indexing, +1 more for the skipped header row
    const sectionRaw = (cols[0] ?? "").trim();
    const questionRaw = (cols[1] ?? "").trim();
    const questionText = (cols[2] ?? "").trim();
    const choice1 = (cols[3] ?? "").trim();
    const choice2 = (cols[4] ?? "").trim();
    const choice3 = (cols[5] ?? "").trim();
    const choice4 = (cols[6] ?? "").trim();
    const choice5 = (cols[7] ?? "").trim();
    const correctRaw = (cols[8] ?? "").trim();

    const sectionNumber = Number(sectionRaw);
    const questionNumber = Number(questionRaw);
    const correctAnswer = Number(correctRaw);

    if (!Number.isInteger(sectionNumber) || sectionNumber <= 0) {
      errors.push({ row: rowNum, message: "セクション番号は正の整数で入力してください" });
      return;
    }
    if (!Number.isInteger(questionNumber) || questionNumber <= 0) {
      errors.push({ row: rowNum, message: "問題番号は正の整数で入力してください" });
      return;
    }
    if (!questionText) {
      errors.push({ row: rowNum, message: "問題文が空です" });
      return;
    }
    if (!choice1 || !choice2) {
      errors.push({ row: rowNum, message: "選択肢1・選択肢2は必須です" });
      return;
    }

    const choiceCount = [choice1, choice2, choice3, choice4, choice5].filter((c) => c !== "").length;

    if (!Number.isInteger(correctAnswer) || correctAnswer < 1 || correctAnswer > choiceCount) {
      errors.push({
        row: rowNum,
        message: `正答は選択肢の範囲内(1〜${choiceCount})で入力してください`,
      });
      return;
    }

    const pairKey = `${sectionNumber}-${questionNumber}`;
    if (seenPairs.has(pairKey)) {
      errors.push({
        row: rowNum,
        message: `セクション${sectionNumber}・問題${questionNumber}はCSV内の${seenPairs.get(
          pairKey
        )}行目と重複しています`,
      });
      return;
    }
    seenPairs.set(pairKey, rowNum);

    parsedQuestions.push({
      row: rowNum,
      section_number: sectionNumber,
      question_number: questionNumber,
      question_text: questionText,
      choice_1: choice1,
      choice_2: choice2,
      choice_3: choice3 || null,
      choice_4: choice4 || null,
      choice_5: choice5 || null,
      correct_answer: correctAnswer,
    });
  });

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
