import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeacherContext } from "@/lib/org";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * Admin-only: removes a teacher from the currently-viewed organization.
 * This only deletes the organization_members row - the person's Supabase
 * Auth account (and any other organization they belong to, including their
 * own page) is untouched. Removing the admin themselves is out of scope.
 */
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });
  if (context.orgRole !== "admin") {
    return NextResponse.json({ error: "管理者のみ操作できます" }, { status: 403 });
  }
  if (params.userId === context.userId) {
    return NextResponse.json({ error: "管理者自身を削除することはできません" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: target, error: targetError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", context.organizationId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "このメンバーは見つかりません" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "管理者を削除することはできません" }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("user_id", params.userId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
