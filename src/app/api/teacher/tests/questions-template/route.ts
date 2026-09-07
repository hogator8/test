import { NextResponse } from "next/server";
import { toCsvWithBom } from "@/lib/csv";
import { MAX_CHOICES } from "@/lib/questions";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * Column layout matches src/lib/questionCsv.ts exactly:
 * セクション番号,問題番号,問題文,選択肢1..10,正答,記述正答1..5
 */
export async function GET() {
  const choiceHeaders = Array.from({ length: MAX_CHOICES }, (_, i) => `選択肢${i + 1}`);
  const freeTextHeaders = Array.from({ length: 5 }, (_, i) => `記述正答${i + 1}`);
  const header = ["セクション番号", "問題番号", "問題文", ...choiceHeaders, "正答", ...freeTextHeaders];

  const sampleMultipleChoice = [
    "1",
    "1",
    "日本(にほん)の首都はどこですか。",
    "東京",
    "大阪",
    "京都",
    "名古屋",
    ...Array(MAX_CHOICES - 4).fill(""),
    "1",
    ...Array(5).fill(""),
  ];
  const sampleFreeText = [
    "1",
    "2",
    "____に入る言葉を書いてください。「おはよう___」",
    ...Array(MAX_CHOICES).fill(""),
    "",
    "ございます",
    "ございます。",
    "",
    "",
    "",
  ];

  const csv = toCsvWithBom([header, sampleMultipleChoice, sampleFreeText]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="questions_template.csv"',
    },
  });
}
