import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeacherContext, getUserSummary } from "@/lib/org";
import { TEACHER_COOKIE } from "@/lib/auth";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * Permanently deletes the caller's own Supabase Auth account, after
 * re-verifying their password and that every organization they administer
 * has no other members left (i.e. any needed admin transfer - see
 * /api/teacher/account/transfer-admin - has already been completed).
 * organization_members rows cascade-delete automatically via their FK to
 * auth.users; the organizations/students/tests rows themselves are left in
 * place but become unreachable from any teacher UI, since no membership
 * points at them anymore.
 */
export async function POST(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const password = body.password ?? "";
  if (!password) {
    return NextResponse.json({ error: "パスワードを入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const summary = await getUserSummary(supabase, context.userId);
  if (!summary?.email) {
    return NextResponse.json({ error: "アカウント情報の取得に失敗しました" }, { status: 500 });
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: summary.email,
    password,
  });
  if (signInError) {
    return NextResponse.json({ error: "パスワードが正しくありません" }, { status: 401 });
  }

  const { data: adminMemberships, error: adminError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", context.userId)
    .eq("role", "admin");
  if (adminError) return NextResponse.json({ error: adminError.message }, { status: 500 });

  for (const m of adminMemberships ?? []) {
    const { count, error: countError } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", m.organization_id);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    if ((count ?? 0) > 1) {
      return NextResponse.json(
        { error: "管理者権限の移譲が完了していないページがあります" },
        { status: 400 }
      );
    }
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(context.userId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEACHER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
