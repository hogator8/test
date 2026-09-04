import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signStudentToken, STUDENT_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { studentId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const studentId = (body.studentId ?? "").trim();
  const password = body.password ?? "";

  if (!studentId || !password) {
    return NextResponse.json({ error: "学生ID・パスワードを入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: student, error } = await supabase
    .from("students")
    .select("id, student_id, name, password_hash")
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!student) {
    return NextResponse.json({ error: "学生IDまたはパスワードが違います" }, { status: 401 });
  }

  const matches = await bcrypt.compare(password, student.password_hash);
  if (!matches) {
    return NextResponse.json({ error: "学生IDまたはパスワードが違います" }, { status: 401 });
  }

  const token = await signStudentToken({
    studentDbId: student.id,
    studentId: student.student_id,
    name: student.name,
  });

  const res = NextResponse.json({ ok: true, name: student.name });
  res.cookies.set(STUDENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
