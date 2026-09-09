import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyTeacherToken, TeacherTokenPayload, TEACHER_COOKIE } from "@/lib/auth";

/** Reads and verifies the teacher session cookie, returning the payload (userId/organizationId/orgRole) or null. */
export async function getTeacherContext(req: NextRequest): Promise<TeacherTokenPayload | null> {
  return verifyTeacherToken(req.cookies.get(TEACHER_COOKIE)?.value);
}

export interface UserSummary {
  id: string;
  email: string | null;
  name: string | null;
}

/** Looks up a Supabase Auth user's email + display name (from user_metadata.name) via the Admin API. */
export async function getUserSummary(supabase: SupabaseClient, userId: string): Promise<UserSummary | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name: (data.user.user_metadata as { name?: string } | null)?.name ?? null,
  };
}

/** The display name of an organization's admin member, used for "(admin name)のページ" labels. Falls back to the admin's email, or null if the org has no admin yet. */
export async function getOrgAdminName(supabase: SupabaseClient, organizationId: string): Promise<string | null> {
  const { data: adminMember, error } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !adminMember) return null;

  const summary = await getUserSummary(supabase, adminMember.user_id);
  return summary?.name ?? summary?.email ?? null;
}

/**
 * Joins a user to every organization that has an outstanding (accepted_at
 * is null) invite for their email, as a 'teacher', then marks each invite
 * accepted. Used both right after an invited user finishes creating their
 * account (accept-invite) and passively on every login for an
 * already-registered teacher who was invited to a further organization
 * (see v15 spec: existing accounts skip the email-link flow entirely and
 * just pick the invite up at their next sign-in).
 */
export async function acceptPendingInvites(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<void> {
  const { data: invites, error } = await supabase
    .from("organization_invites")
    .select("id, organization_id")
    .eq("email", email)
    .is("accepted_at", null);
  if (error || !invites || invites.length === 0) return;

  for (const invite of invites) {
    const { error: memberError } = await supabase
      .from("organization_members")
      .upsert(
        { organization_id: invite.organization_id, user_id: userId, role: "teacher" },
        { onConflict: "organization_id,user_id", ignoreDuplicates: true }
      );
    if (memberError) continue;

    await supabase
      .from("organization_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
  }
}
