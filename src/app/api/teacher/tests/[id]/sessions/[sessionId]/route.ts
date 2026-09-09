import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTeacherContext } from "@/lib/org";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

// Soft delete only: answers/proctoring_logs/session_resume_logs are left
// untouched as history, and the row still appears in CSV exports (with a
// 削除フラグ). Marking deleted_at also frees up the partial unique index on
// (student_id, test_id) so the same student can start a fresh session for
// this test the next time they enter the passcode.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();

  const { data: test, error: testError } = await supabase
    .from("tests")
    .select("id")
    .eq("id", params.id)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (testError) return NextResponse.json({ error: testError.message }, { status: 500 });
  if (!test) return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });

  const { data: updated, error } = await supabase
    .from("test_sessions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.sessionId)
    .eq("test_id", params.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "受験記録が見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
