import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeacherContext } from "@/lib/org";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * Hands admin of one of the caller's organizations to another existing
 * ('teacher'-role) member, demoting the caller to 'teacher' there in the
 * same step - always leaving exactly one admin per organization. This is a
 * prerequisite step for self-deleting an account that administers a page
 * with other members (see /api/teacher/account/delete-check and /delete).
 */
export async function POST(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  let body: { organizationId?: string; newAdminUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const { organizationId, newAdminUserId } = body;
  if (!organizationId || !newAdminUserId) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: selfMembership, error: selfError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (selfError) return NextResponse.json({ error: selfError.message }, { status: 500 });
  if (!selfMembership || selfMembership.role !== "admin") {
    return NextResponse.json({ error: "このページの管理者ではありません" }, { status: 403 });
  }

  const { data: targetMembership, error: targetError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", newAdminUserId)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!targetMembership) {
    return NextResponse.json({ error: "指定された教員が見つかりません" }, { status: 400 });
  }

  const { error: promoteError } = await supabase
    .from("organization_members")
    .update({ role: "admin" })
    .eq("organization_id", organizationId)
    .eq("user_id", newAdminUserId);
  if (promoteError) return NextResponse.json({ error: promoteError.message }, { status: 500 });

  const { error: demoteError } = await supabase
    .from("organization_members")
    .update({ role: "teacher" })
    .eq("organization_id", organizationId)
    .eq("user_id", context.userId);
  if (demoteError) return NextResponse.json({ error: demoteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
