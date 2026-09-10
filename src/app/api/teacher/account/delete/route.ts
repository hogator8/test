import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, verifyPassword } from "@/lib/supabase";
import { getTeacherContext, getUserSummary } from "@/lib/org";
import { TEACHER_COOKIE } from "@/lib/auth";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * Permanently deletes the caller's own Supabase Auth account, after
 * re-verifying their password and that every organization they administer
 * has no other members left (i.e. any needed admin transfer - see
 * /api/teacher/account/transfer-admin - has already been completed).
 *
 * organization_members.user_id references auth.users(id) on delete cascade,
 * but that cascade fires as Supabase's internal auth service (not our
 * service_role) deletes the auth.users row - and that internal role has no
 * grants on our public.organization_members table, so letting the cascade
 * do the work fails with "permission denied for table organization_members".
 * We therefore delete the caller's own organization_members rows ourselves
 * (as service_role, which does have the grant) first, so there's nothing
 * left for the cascade to touch by the time auth.users is deleted. The
 * organizations/students/tests rows themselves are left in place but become
 * unreachable from any teacher UI, since no membership points at them
 * anymore.
 *
 * Password verification below deliberately goes through verifyPassword()'s
 * own throwaway client rather than calling auth.signInWithPassword() on the
 * shared getSupabaseAdmin() client - doing that would swap this client's
 * own Authorization header from the service_role key to the caller's own
 * access token (see verifyPassword()'s doc comment), which previously
 * caused the very permission error this route is trying to avoid.
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

  const passwordValid = await verifyPassword(summary.email, password);
  if (!passwordValid) {
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

  const { error: membersDeleteError } = await supabase
    .from("organization_members")
    .delete()
    .eq("user_id", context.userId);
  if (membersDeleteError) {
    return NextResponse.json({ error: membersDeleteError.message }, { status: 500 });
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(context.userId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEACHER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
