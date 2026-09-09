import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signTeacherToken, TEACHER_COOKIE } from "@/lib/auth";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/** Finalizes the app session cookie once a teacher with multiple organizations picks which one to open. */
export async function POST(req: NextRequest) {
  let body: { accessToken?: string; organizationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const { accessToken, organizationId } = body;
  if (!accessToken || !organizationId) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ error: "この組織にアクセスする権限がありません" }, { status: 403 });
  }

  const token = await signTeacherToken({
    userId: userData.user.id,
    organizationId,
    orgRole: membership.role as "admin" | "teacher",
  });

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
