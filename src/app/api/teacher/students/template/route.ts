import { NextResponse } from "next/server";
import { toCsvWithBom } from "@/lib/csv";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/** Column layout matches src/app/api/teacher/students/upload/route.ts exactly. */
export async function GET() {
  const header = ["学生ID", "氏名", "パスワード", "クラス名", "読み方", "国籍", "性別"];
  const sample = ["student01", "山田太郎", "pass1234", "初級A", "やまだたろう", "日本", "男性"];

  const csv = toCsvWithBom([header, sample]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="students_template.csv"',
    },
  });
}
