import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";
import { noStoreJson } from "@/lib/http";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

interface UpdateStudentBody {
  studentId?: string;
  name?: string;
  password?: string;
  className?: string | null;
  reading?: string | null;
  nationality?: string | null;
  gender?: string | null;
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

  const update: Record<string, string | null> = {
    student_id: studentId,
    name,
    class_name: (body.className ?? "").trim() || null,
    reading: (body.reading ?? "").trim() || null,
    nationality: (body.nationality ?? "").trim() || null,
    gender: (body.gender ?? "").trim() || null,
  };
  if (password) {
    update.password_hash = await bcrypt.hash(password, 10);
  }

  const { data: updated, error } = await supabase
    .from("students")
    .update(update)
    .eq("id", studentDbId)
    .select("id, student_id, name, class_name, reading, nationality, gender, created_at")
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

  // Return the row as Postgres now has it (not just {ok: true}) so the
  // caller can update its local state directly instead of depending on a
  // second GET round-trip to reflect the change.
  return noStoreJson({ ok: true, student: updated });
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
