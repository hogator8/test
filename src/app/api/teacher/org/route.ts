import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeacherContext, getUserSummary } from "@/lib/org";
import { noStoreJson } from "@/lib/http";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/** Admin-only: the currently-viewed organization's admin name (for the page heading) plus its full member list. */
export async function GET(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });
  if (context.orgRole !== "admin") {
    return NextResponse.json({ error: "管理者のみ閲覧できます" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: memberRows, error } = await supabase
    .from("organization_members")
    .select("user_id, role, created_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const members = await Promise.all(
    (memberRows ?? []).map(async (m) => {
      const summary = await getUserSummary(supabase, m.user_id);
      return {
        userId: m.user_id,
        role: m.role as "admin" | "teacher",
        name: summary?.name ?? "(不明)",
        email: summary?.email ?? "(不明)",
      };
    })
  );

  const admin = members.find((m) => m.role === "admin");

  return noStoreJson({
    organizationId: context.organizationId,
    adminName: admin?.name ?? "不明",
    members,
  });
}
