import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signTeacherToken, TEACHER_COOKIE } from "@/lib/auth";
import { acceptPendingInvites } from "@/lib/org";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * Completes account setup for a brand-new teacher who arrived via an
 * invite email (no shared passphrase required - being invited is treated
 * as identity verification). Sets their name/password, gives them their
 * own organization (every teacher, invited or not, gets one to admin), and
 * joins them into every organization that invited them.
 */
export async function POST(req: NextRequest) {
  let body: { accessToken?: string; name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const { accessToken } = body;
  const name = (body.name ?? "").trim();
  const password = body.password ?? "";
  if (!accessToken) return NextResponse.json({ error: "リンクの有効期限が切れています" }, { status: 401 });
  if (!name) return NextResponse.json({ error: "氏名を入力してください" }, { status: 400 });
  if (password.length < 6) {
    return NextResponse.json({ error: "パスワードは6文字以上で入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "リンクの有効期限が切れています。招待メールから再度お試しください" }, { status: 401 });
  }
  const userId = userData.user.id;

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { name },
  });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  const { count: existingMemberships, error: countError } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if (!existingMemberships) {
    const { data: newOrg, error: newOrgError } = await supabase
      .from("organizations")
      .insert({})
      .select("id")
      .single();
    if (newOrgError) return NextResponse.json({ error: newOrgError.message }, { status: 500 });

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({ organization_id: newOrg.id, user_id: userId, role: "admin" });
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (userData.user.email) {
    await acceptPendingInvites(supabase, userId, userData.user.email);
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (membershipsError) return NextResponse.json({ error: membershipsError.message }, { status: 500 });
  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: "組織の作成に失敗しました" }, { status: 500 });
  }

  // Land them on their own new page by default (the first membership
  // created above) rather than the org that invited them - they can log
  // out/in and pick the other one via the org-selection screen any time.
  const membership = memberships[0];
  const token = await signTeacherToken({
    userId,
    organizationId: membership.organization_id,
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
