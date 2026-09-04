import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";

interface RowError {
  row: number;
  message: string;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSVファイルを選択してください" }, { status: 400 });
  }

  const rawText = stripBom(await file.text());
  const parsed = Papa.parse<string[]>(rawText, {
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: "CSVの解析に失敗しました: " + parsed.errors[0].message },
      { status: 400 }
    );
  }

  const allRows = parsed.data;
  if (allRows.length === 0) {
    return NextResponse.json({ error: "CSVにデータがありません" }, { status: 400 });
  }

  // The first row is always a header row (学生ID,氏名,パスワード) and is skipped.
  const rows = allRows.slice(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSVにヘッダー行以外のデータがありません" }, { status: 400 });
  }

  const errors: RowError[] = [];
  const seenIds = new Map<string, number>();
  type ParsedStudent = {
    studentId: string;
    name: string;
    password: string;
    className: string | null;
    reading: string | null;
    nationality: string | null;
    gender: string | null;
    row: number;
  };
  const parsedStudents: ParsedStudent[] = [];

  rows.forEach((cols, idx) => {
    const rowNum = idx + 2; // +1 for 1-indexing, +1 more for the skipped header row
    const studentId = (cols[0] ?? "").trim();
    const name = (cols[1] ?? "").trim();
    const password = (cols[2] ?? "").trim();
    const className = (cols[3] ?? "").trim();
    const reading = (cols[4] ?? "").trim();
    const nationality = (cols[5] ?? "").trim();
    const gender = (cols[6] ?? "").trim();

    if (!studentId || !name || !password) {
      errors.push({
        row: rowNum,
        message: "学生ID・氏名・パスワードはすべて必須です",
      });
      return;
    }

    if (seenIds.has(studentId)) {
      errors.push({
        row: rowNum,
        message: `学生ID「${studentId}」はCSV内の${seenIds.get(studentId)}行目と重複しています`,
      });
      return;
    }
    seenIds.set(studentId, rowNum);
    parsedStudents.push({
      studentId,
      name,
      password,
      className: className || null,
      reading: reading || null,
      nationality: nationality || null,
      gender: gender || null,
      row: rowNum,
    });
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: "入力内容にエラーがあります", errors }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing, error: fetchError } = await supabase
    .from("students")
    .select("student_id")
    .in(
      "student_id",
      parsedStudents.map((s) => s.studentId)
    );

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const existingIds = new Set((existing ?? []).map((r) => r.student_id as string));
  for (const s of parsedStudents) {
    if (existingIds.has(s.studentId)) {
      errors.push({
        row: s.row,
        message: `学生ID「${s.studentId}」は既に登録されています`,
      });
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "登録済みの学生IDと重複しています", errors }, { status: 400 });
  }

  const insertRows = await Promise.all(
    parsedStudents.map(async (s) => ({
      student_id: s.studentId,
      name: s.name,
      password_hash: await bcrypt.hash(s.password, 10),
      class_name: s.className,
      reading: s.reading,
      nationality: s.nationality,
      gender: s.gender,
    }))
  );

  const { error: insertError } = await supabase.from("students").insert(insertRows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: insertRows.length });
}
