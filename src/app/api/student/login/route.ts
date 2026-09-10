import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  signStudentToken,
  signStudentCandidatesToken,
  STUDENT_COOKIE,
  STUDENT_CANDIDATES_COOKIE,
} from "@/lib/auth";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE = 60 * 60 * 12;

// student_id is only unique per-organization (v16), so the same ID/password
// pair can legitimately match rows in more than one organization. Every row
// whose password matches becomes a "login candidate" - which organization's
// student the caller actually is isn't decided here, only at the passcode
// step (see /api/student/passcode), except for the common case of exactly
// one match, where there's nothing to disambiguate and we resolve right away.
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
  const { data: candidates, error } = await supabase
    .from("students")
    .select("id, organization_id, student_id, name, password_hash")
    .eq("student_id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const matches = [];
  for (const c of candidates ?? []) {
    if (await bcrypt.compare(password, c.password_hash)) {
      matches.push(c);
    }
  }

  if (matches.length === 0) {
    return NextResponse.json({ error: "学生IDまたはパスワードが違います" }, { status: 401 });
  }

  const candidatesToken = await signStudentCandidatesToken({
    candidates: matches.map((m) => ({ studentDbId: m.id, organizationId: m.organization_id })),
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STUDENT_CANDIDATES_COOKIE, candidatesToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  if (matches.length === 1) {
    const student = matches[0];
    const token = await signStudentToken({
      studentDbId: student.id,
      studentId: student.student_id,
      name: student.name,
    });
    res.cookies.set(STUDENT_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  } else {
    // Ambiguous - clear any resolved context left over from a previous
    // login so a stale organization can't leak into history/test access
    // before the student disambiguates via passcode entry.
    res.cookies.set(STUDENT_COOKIE, "", { path: "/", maxAge: 0 });
  }

  return res;
}
