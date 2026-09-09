import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { noStoreJson } from "@/lib/http";
import { getTeacherContext } from "@/lib/org";

// Never statically cache this route - it must always hit Supabase for
// live data (Next.js Route Handlers can otherwise be cached by default).
export const dynamic = "force-dynamic";

/** Distinct, non-empty class names currently registered on this organization's students, for the test assignment class picker. */
export async function GET(req: NextRequest) {
  const context = await getTeacherContext(req);
  if (!context) return NextResponse.json({ error: "ログインし直してください" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("students")
    .select("class_name")
    .eq("organization_id", context.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const classNames = Array.from(
    new Set((data ?? []).map((s) => s.class_name).filter((c): c is string => !!c && c.trim() !== ""))
  ).sort((a, b) => a.localeCompare(b, "ja"));

  return noStoreJson({ classNames });
}
