import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";
import { noStoreJson } from "@/lib/http";
import { getTeacherContext } from "@/lib/org";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("students")
    .select("id, student_id, name, class_name, reading, nationality, gender, created_at")
    .eq("organization_id", context.organizationId)
    .order("student_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const studentIds = (data ?? []).map((s) => s.id);
  const sessionCounts: Record<string, number> = {};
  if (studentIds.length > 0) {
    const { data: sessions } = await supabase
      .from("test_sessions")
      .select("student_id")
      .in("student_id", studentIds);
    for (const s of sessions ?? []) {
      sessionCounts[s.student_id] = (sessionCounts[s.student_id] ?? 0) + 1;
    }
  }

  return noStoreJson({
    students: (data ?? []).map((s) => ({ ...s, sessionCount: sessionCounts[s.id] ?? 0 })),
  });
}

interface CreateStudentBody {
  studentId?: string;
  name?: string;
  password?: string;
  className?: string | null;
  reading?: string | null;
  nationality?: string | null;
  gender?: string | null;
}

/** Manual single-student registration - the same fields/validation as the CSV upload, for adding just 1-2 students. */
export async function POST(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  let body: CreateStudentBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const studentId = (body.studentId ?? "").trim();
  const name = (body.name ?? "").trim();
  const password = (body.password ?? "").trim();

  if (!studentId || !name || !password) {
    return NextResponse.json({ error: "学生ID・氏名・パスワードはすべて必須です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // student_id is only unique per-organization (v16) - scope this pre-check
  // the same way, so the DB's own composite unique constraint is the only
  // thing actually enforcing it, but the error message stays friendly.
  const { data: existing, error: existingError } = await supabase
    .from("students")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) {
    return NextResponse.json({ error: `学生ID「${studentId}」は既に登録されています` }, { status: 400 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("students")
    .insert({
      organization_id: context.organizationId,
      student_id: studentId,
      name,
      password_hash: await bcrypt.hash(password, 10),
      class_name: (body.className ?? "").trim() || null,
      reading: (body.reading ?? "").trim() || null,
      nationality: (body.nationality ?? "").trim() || null,
      gender: (body.gender ?? "").trim() || null,
    })
    .select("id, student_id, name, class_name, reading, nationality, gender, created_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: `学生ID「${studentId}」は既に登録されています` }, { status: 400 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, student: inserted });
}

/** Bulk delete - body: {ids: string[]}. Same cascade behavior as the single-student DELETE route. */
export async function DELETE(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "削除する学生を選択してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error, count } = await supabase
    .from("students")
    .delete({ count: "exact" })
    .in("id", ids)
    .eq("organization_id", context.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: count ?? 0 });
}
