import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/states";
import {
  CreateInviteButton,
  FriendRequestForm,
  FriendshipActions,
} from "@/modules/engagement/ui";
import { T } from "@/modules/localization/t";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: flag }, { data: friendships }] = await Promise.all([
    supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("key", "friends_invites")
      .maybeSingle(),
    supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status, updated_at")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order("updated_at", { ascending: false }),
  ]);

  const friendsEnabled = flag?.is_enabled ?? false;
  const profileIds = Array.from(
    new Set(
      (friendships ?? []).flatMap((row) => [
        row.requester_id,
        row.addressee_id,
      ]),
    ),
  );
  const { data: profiles } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, nickname")
        .in("id", profileIds)
    : { data: [] as { id: string; nickname: string }[] };
  const nicknameMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.nickname]),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            <T id="common.backHome" />
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          <T id="friends.title" />
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          <T id="friends.body" />
        </p>
      </div>

      {!friendsEnabled ? (
        <EmptyState
          titleKey="friends.disabledTitle"
          descriptionKey="friends.disabledBody"
        />
      ) : (
        <>
          <section className="border border-[var(--brand-border)] p-4">
            <h2 className="font-medium">
              <T id="friends.addFriend" />
            </h2>
            <div className="mt-3">
              <FriendRequestForm />
            </div>
          </section>

          <section className="border border-[var(--brand-border)] p-4">
            <h2 className="font-medium">
              <T id="friends.inviteCode" />
            </h2>
            <div className="mt-3">
              <CreateInviteButton />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">
              <T id="friends.yourFriendships" />
            </h2>
            {!friendships?.length ? (
              <EmptyState titleKey="friends.empty" />
            ) : (
              <ul className="space-y-3">
                {friendships.map((friendship) => {
                  const isAddressee = friendship.addressee_id === user.id;
                  const otherId = isAddressee
                    ? friendship.requester_id
                    : friendship.addressee_id;

                  return (
                    <li
                      key={friendship.id}
                      className="flex flex-col gap-3 border border-[var(--brand-border)] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">
                          {nicknameMap.get(otherId) ?? (
                            <T id="friends.player" />
                          )}
                        </p>
                        <p className="text-sm capitalize text-[var(--brand-muted)]">
                          {friendship.status}
                        </p>
                      </div>
                      <FriendshipActions
                        friendshipId={friendship.id}
                        canAccept={
                          friendship.status === "pending" && isAddressee
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
