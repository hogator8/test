import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";

interface UpdateStudentBody {
  studentId?: string;
  name?: string;
  password?: string;
}

// Students are referenced internally by students.id (uuid) everywhere
// (test_sessions.student_id, answers, proctoring_logs, ...), never by the
// human-readable login ID, so renaming studentId here does not affect any
// existing test session.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const studentDbId = params.id;

  let body: UpdateStudentBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const studentId = (body.studentId ?? "").trim();
  const name = (body.name ?? "").trim();
  const password = (body.password ?? "").trim();

  if (!studentId || !name) {
    return NextResponse.json({ error: "学生ID・氏名は必須です" }, { status: 400 });
  }

  const update: Record<string, string> = { student_id: studentId, name };
  if (password) {
    update.password_hash = await bcrypt.hash(password, 10);
  }

  const { data: updated, error } = await supabase
    .from("students")
    .update(update)
    .eq("id", studentDbId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `学生ID「${studentId}」は既に使用されています` }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "学生が見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  const studentDbId = params.id;

  // test_sessions.student_id -> students.id cascades on delete (see
  // supabase/migration_v3.sql), which in turn cascades to answers,
  // proctoring_logs and session_resume_logs via their own FKs.
  const { error, count } = await supabase
    .from("students")
    .delete({ count: "exact" })
    .eq("id", studentDbId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "学生が見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
