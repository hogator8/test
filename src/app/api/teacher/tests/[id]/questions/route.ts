import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { noStoreJson } from "@/lib/http";
import { parseQuestionCsv } from "@/lib/questionCsv";
import { SELECT_QUESTION_COLUMNS, buildChoices, QuestionRow } from "@/lib/questions";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();

  const { data: questions, error } = await supabase
    .from("questions")
    .select(SELECT_QUESTION_COLUMNS)
    .eq("test_id", params.id)
    .is("deleted_at", null)
    .order("section_number", { ascending: true })
    .order("question_number", { ascending: true })
    .returns<QuestionRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return noStoreJson({
    questions: (questions ?? []).map((q) => ({
      id: q.id,
      sectionNumber: q.section_number,
      questionNumber: q.question_number,
      questionText: q.question_text,
      questionType: q.question_type,
      choices: buildChoices(q),
      correctAnswer: q.correct_answer,
      freeTextAnswers: [
        q.free_text_answer_1,
        q.free_text_answer_2,
        q.free_text_answer_3,
        q.free_text_answer_4,
        q.free_text_answer_5,
      ].filter((a): a is string => a !== null && a !== ""),
    })),
  });
}

/**
 * Replaces the test's question set from a re-uploaded CSV, without
 * disturbing existing answers:
 *  - a CSV row matching an existing (test_id, section, question) pair
 *    updates that row in place (same id) via upsert on the unique
 *    constraint, and clears deleted_at in case it had been removed before
 *  - a CSV row with no match is inserted as new
 *  - an existing active question whose pair is no longer in the CSV is
 *    soft-deleted (never physically removed), so answers.question_id stays
 *    valid and past results keep showing what the student actually answered
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const testId = params.id;
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "問題CSVファイルを選択してください" }, { status: 400 });
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

  const { data: existing, error: existingError } = await supabase
    .from("questions")
    .select("id, section_number, question_number")
    .eq("test_id", testId)
    .is("deleted_at", null);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const newPairs = new Set(parsedQuestions.map((q) => `${q.section_number}-${q.question_number}`));
  const idsToSoftDelete = (existing ?? [])
    .filter((q) => !newPairs.has(`${q.section_number}-${q.question_number}`))
    .map((q) => q.id);

  const upsertRows = parsedQuestions.map(({ row: _row, ...q }) => ({
    ...q,
    test_id: testId,
    deleted_at: null,
  }));

  const { error: upsertError } = await supabase
    .from("questions")
    .upsert(upsertRows, { onConflict: "test_id,section_number,question_number" });
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  if (idsToSoftDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("questions")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", idsToSoftDelete);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: upsertRows.length, removed: idsToSoftDelete.length });
}
