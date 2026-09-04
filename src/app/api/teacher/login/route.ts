import { NextRequest, NextResponse } from "next/server";
import { signTeacherToken, TEACHER_COOKIE } from "@/lib/auth";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const teacherPassword = process.env.TEACHER_PASSWORD;
  if (!teacherPassword) {
    return NextResponse.json(
      { error: "サーバー設定エラー: TEACHER_PASSWORDが設定されていません" },
      { status: 500 }
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  if (!body.password || body.password !== teacherPassword) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  const token = await signTeacherToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEACHER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
