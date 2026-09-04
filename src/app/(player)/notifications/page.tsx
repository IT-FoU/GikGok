import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/states";
import {
  MarkAllNotificationsButton,
  NotificationReadButton,
} from "@/modules/engagement/ui";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, kind, title_key, body_key, payload, read_at, created_at")
    .eq("player_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--brand-muted)]">
            <Link href="/home" className="underline-offset-4 hover:underline">
              ← Home
            </Link>
          </p>
          <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
            Notifications
          </h1>
        </div>
        <MarkAllNotificationsButton />
      </div>

      {!notifications?.length ? (
        <EmptyState title="No notifications yet" />
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`border border-[var(--brand-border)] p-4 ${
                notification.read_at ? "opacity-70" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{notification.title_key}</p>
                  {notification.body_key ? (
                    <p className="mt-1 text-sm text-[var(--brand-muted)]">
                      {notification.body_key}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--brand-muted)]">
                    {notification.kind} ·{" "}
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
                {!notification.read_at ? (
                  <NotificationReadButton id={notification.id} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
