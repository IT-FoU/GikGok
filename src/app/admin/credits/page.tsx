import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AdminCreditReviewForm,
  SecondApproveButton,
} from "@/modules/ledger/ui";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminCreditsPage() {
  let pending: Array<{
    id: string;
    requested_amount: number;
    player_note: string | null;
    created_at: string;
    player_id: string;
  }> = [];
  let awaitingSecond: Array<{
    id: string;
    credit_request_id: string;
    net_amount: number | null;
    reason: string;
    reviewer_id: string;
  }> = [];
  let errorMessage: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const [{ data: pendingRows }, { data: reviewRows }] = await Promise.all([
      supabase
        .from("credit_requests")
        .select("id, requested_amount, player_note, created_at, player_id, status")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("credit_request_reviews")
        .select(
          "id, credit_request_id, net_amount, reason, reviewer_id, requires_second_approver, second_approver_id, decision",
        )
        .eq("requires_second_approver", true)
        .is("second_approver_id", null)
        .eq("decision", "approved")
        .limit(50),
    ]);

    pending = (pendingRows ?? []).filter((row) => {
      const waiting = (reviewRows ?? []).some(
        (review) => review.credit_request_id === row.id,
      );
      return !waiting;
    });
    awaitingSecond = reviewRows ?? [];
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unable to load credit queue";
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/admin" className="underline-offset-4 hover:underline">
            ← Admin
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          Credit requests
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Approve/reject demo-credit requests with simulated fees. Large nets
          need a second approver.
        </p>
      </div>

      {errorMessage ? (
        <Card>
          <CardDescription>{errorMessage}</CardDescription>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Pending review</h2>
        {pending.length === 0 ? (
          <Card>
            <CardDescription>No pending requests.</CardDescription>
          </Card>
        ) : (
          pending.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <CardTitle>
                  {request.requested_amount.toLocaleString()} GIK
                </CardTitle>
                <CardDescription>
                  Player {request.player_id.slice(0, 8)} ·{" "}
                  {new Date(request.created_at).toLocaleString()}
                  {request.player_note ? ` · ${request.player_note}` : ""}
                </CardDescription>
              </CardHeader>
              <AdminCreditReviewForm
                requestId={request.id}
                requestedAmount={request.requested_amount}
              />
            </Card>
          ))
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">
          Awaiting second approval
        </h2>
        {awaitingSecond.length === 0 ? (
          <Card>
            <CardDescription>No items waiting for second approval.</CardDescription>
          </Card>
        ) : (
          awaitingSecond.map((review) => (
            <Card key={review.id}>
              <CardHeader>
                <CardTitle>
                  Net {(review.net_amount ?? 0).toLocaleString()} GIK
                </CardTitle>
                <CardDescription>
                  Review {review.id.slice(0, 8)} · first reviewer{" "}
                  {review.reviewer_id.slice(0, 8)} · {review.reason}
                </CardDescription>
              </CardHeader>
              <SecondApproveButton reviewId={review.id} />
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
