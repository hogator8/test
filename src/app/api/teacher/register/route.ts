import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * First-time teacher registration, gated by the shared passphrase
 * (TEACHER_PASSWORD - the same env var previously used as the single shared
 * teacher password). The very first person to register this way becomes the
 * admin of the "legacy" organization (which owns every student/test that
 * existed before multi-tenant orgs) - everyone after that gets a brand-new,
 * empty organization of their own. Invited teachers never go through this
 * route; see /api/teacher/accept-invite.
 */
export async function POST(req: NextRequest) {
  const passphrase = process.env.TEACHER_PASSWORD;
  if (!passphrase) {
    return NextResponse.json(
      { error: "サーバー設定エラー: TEACHER_PASSWORDが設定されていません" },
      { status: 500 }
    );
  }

  let body: { name?: string; email?: string; password?: string; passphrase?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";

  if (!name) return NextResponse.json({ error: "氏名を入力してください" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "メールアドレスを入力してください" }, { status: 400 });
  if (password.length < 6) {
    return NextResponse.json({ error: "パスワードは6文字以上で入力してください" }, { status: 400 });
  }
  if (body.passphrase !== passphrase) {
    return NextResponse.json({ error: "合言葉が正しくありません" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createError || !created.user) {
    const message = createError?.message.includes("already been registered")
      ? "このメールアドレスは既に登録されています"
      : createError?.message ?? "アカウント作成に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: legacyOrg, error: legacyError } = await supabase
    .from("organizations")
    .select("id")
    .eq("is_legacy", true)
    .maybeSingle();
  if (legacyError) return NextResponse.json({ error: legacyError.message }, { status: 500 });

  let organizationId: string;
  if (legacyOrg) {
    const { count, error: countError } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", legacyOrg.id);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

    if (!count) {
      // First-ever registrant - inherit the legacy organization (and with
      // it, every pre-existing student/test) as its admin.
      organizationId = legacyOrg.id;
    } else {
      const { data: newOrg, error: newOrgError } = await supabase
        .from("organizations")
        .insert({})
        .select("id")
        .single();
      if (newOrgError) return NextResponse.json({ error: newOrgError.message }, { status: 500 });
      organizationId = newOrg.id;
    }
  } else {
    // No legacy organization exists at all (shouldn't happen once migrated,
    // but fall back to creating a fresh one rather than failing outright).
    const { data: newOrg, error: newOrgError } = await supabase
      .from("organizations")
      .insert({})
      .select("id")
      .single();
    if (newOrgError) return NextResponse.json({ error: newOrgError.message }, { status: 500 });
    organizationId = newOrg.id;
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({ organization_id: organizationId, user_id: created.user.id, role: "admin" });
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
