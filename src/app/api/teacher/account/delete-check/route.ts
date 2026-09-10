import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeacherContext, getUserSummary } from "@/lib/org";
import { noStoreJson } from "@/lib/http";

// Never statically cache this route.
export const dynamic = "force-dynamic";

/**
 * Lists every organization the caller administers (there's always at least
 * one - their own page), with what self-deletion would affect there: any
 * other 'teacher' members (who must be promoted to admin before deletion is
 * allowed - see /api/teacher/account/transfer-admin) and, for pages with no
 * other members at all, the student/test counts to show in the warning
 * before deletion is allowed to proceed.
 */
export async function GET(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();

  const { data: adminMemberships, error: adminError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", context.userId)
    .eq("role", "admin");
  if (adminError) return NextResponse.json({ error: adminError.message }, { status: 500 });

  const selfSummary = await getUserSummary(supabase, context.userId);
  const selfLabel = selfSummary?.name ?? selfSummary?.email ?? "あなた";

  const adminOrgs = [];
  for (const m of adminMemberships ?? []) {
    const organizationId = m.organization_id as string;

    const [{ data: members, error: membersError }, { count: studentCount }, { count: testCount }] =
      await Promise.all([
        supabase.from("organization_members").select("user_id, role").eq("organization_id", organizationId),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        supabase.from("tests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      ]);
    if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

    const otherMembers = (members ?? []).filter((mem) => mem.user_id !== context.userId);
    const otherTeachers = [];
    for (const mem of otherMembers) {
      const summary = await getUserSummary(supabase, mem.user_id);
      otherTeachers.push({
        userId: mem.user_id as string,
        name: summary?.name ?? "(不明)",
        email: summary?.email ?? "(不明)",
      });
    }

    adminOrgs.push({
      organizationId,
      orgLabel: `${selfLabel}のページ`,
      otherTeachers,
      studentCount: studentCount ?? 0,
      testCount: testCount ?? 0,
    });
  }

  return noStoreJson({ adminOrgs });
}
