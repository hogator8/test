import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeacherContext } from "@/lib/org";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * Admin-only: invites another teacher into the currently-viewed
 * organization by email. If that email doesn't have a Supabase Auth
 * account yet, inviteUserByEmail sends them a sign-up link (redirecting to
 * /teacher/accept-invite) and they finish account creation there without
 * needing the shared passphrase - being invited is treated as identity
 * verification enough. If the email already belongs to an existing
 * account, no email is needed at all: the organization_invites row created
 * below is picked up automatically the next time they log in (see
 * acceptPendingInvites in /api/teacher/login).
 */
export async function POST(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });
  if (context.orgRole !== "admin") {
    return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  if (!email) return NextResponse.json({ error: "メールアドレスを入力してください" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: existingInvite } = await supabase
    .from("organization_invites")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();
  if (existingInvite) {
    return NextResponse.json({ error: "このメールアドレスは既に招待中です" }, { status: 400 });
  }

  const redirectTo = `${req.nextUrl.origin}/teacher/accept-invite`;
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
  // An "already registered" error just means this person already has an
  // account - that's fine here, since existing accounts accept invites by
  // logging in rather than via the emailed link. Any other error is real.
  if (inviteError && !inviteError.message.toLowerCase().includes("already")) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  const { error: insertError } = await supabase.from("organization_invites").insert({
    organization_id: context.organizationId,
    email,
    invited_by: context.userId,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
