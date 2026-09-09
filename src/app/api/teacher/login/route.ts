import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signTeacherToken, TEACHER_COOKIE } from "@/lib/auth";
import { getOrgAdminName, acceptPendingInvites } from "@/lib/org";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * The browser signs in directly against Supabase Auth (supabase.auth.
 * signInWithPassword) and hands us the resulting access token here. We
 * verify it server-side, then look up which organization(s) this teacher
 * belongs to: with exactly one, we mint our own app-level session cookie
 * (the same httpOnly JWT pattern used everywhere else in this app, so
 * middleware/route protection doesn't need to change); with more than one,
 * we return the list so the client can show a "which page?" picker and
 * finish via /api/teacher/select-org.
 */
export async function POST(req: NextRequest) {
  let body: { accessToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const accessToken = body.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "ログインに失敗しました" }, { status: 401 });
  }
  const userId = userData.user.id;

  // Existing accounts skip the invite email's account-creation flow entirely
  // - a pending invite for their address is simply picked up here, on their
  // next login, rather than requiring them to click the invite link.
  if (userData.user.email) {
    await acceptPendingInvites(supabase, userId, userData.user.email);
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId);
  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 500 });
  }
  if (!memberships || memberships.length === 0) {
    return NextResponse.json(
      { error: "所属する組織が見つかりません。管理者にお問い合わせください" },
      { status: 403 }
    );
  }

  if (memberships.length > 1) {
    const organizations = await Promise.all(
      memberships.map(async (m) => ({
        organizationId: m.organization_id,
        orgRole: m.role as "admin" | "teacher",
        adminName: (await getOrgAdminName(supabase, m.organization_id)) ?? "不明",
      }))
    );
    return NextResponse.json({ ok: true, needsOrgSelection: true, organizations });
  }

  const membership = memberships[0];
  const token = await signTeacherToken({
    userId,
    organizationId: membership.organization_id,
    orgRole: membership.role as "admin" | "teacher",
  });

  const res = NextResponse.json({ ok: true, needsOrgSelection: false });
  res.cookies.set(TEACHER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
