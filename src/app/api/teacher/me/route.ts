import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeacherContext, getUserSummary, getOrgAdminName } from "@/lib/org";
import { noStoreJson } from "@/lib/http";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/** The logged-in teacher's own info plus their current organization's admin name, for the nav bar / org context display. */
export async function GET(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const [self, orgAdminName] = await Promise.all([
    getUserSummary(supabase, context.userId),
    getOrgAdminName(supabase, context.organizationId),
  ]);

  return noStoreJson({
    name: self?.name ?? null,
    email: self?.email ?? null,
    organizationId: context.organizationId,
    orgRole: context.orgRole,
    orgAdminName: orgAdminName ?? "不明",
  });
}
