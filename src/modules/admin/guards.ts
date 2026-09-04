import "server-only";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  hasPermission,
  type AdminSessionState,
} from "@/modules/admin";

export async function loadAdminSession(): Promise<{
  userId: string | null;
  session: AdminSessionState | null;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { userId: null, session: null };
  }

  const { data, error } = await supabase.rpc("get_admin_session_state");
  if (error || !data) {
    return { userId: user.id, session: { is_admin: false } };
  }

  const session = data as AdminSessionState;
  if (session.is_admin) {
    try {
      await supabase.rpc("touch_admin_login");
    } catch {
      // Best-effort presence stamp.
    }
  }

  return { userId: user.id, session };
}

export async function requireAdminSession(
  permission?: string | null,
): Promise<{ userId: string; session: AdminSessionState }> {
  const { userId, session } = await loadAdminSession();

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent("/admin")}`);
  }
  if (!session?.is_admin) {
    redirect("/admin/access-denied");
  }
  if (permission && !hasPermission(session, permission)) {
    redirect("/admin/access-denied");
  }

  return { userId, session };
}
