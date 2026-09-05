import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AdminReviewForm,
  SecondApproveForm,
} from "@/modules/ledger/ui";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminCreditsPage() {
  let pending: Array<{
    id: string;
    requested_amount: number;
    note: string | null;
    created_at: string;
    player_id: string;
  }> = [];
  let awaitingSecond: Array<{
    request_id: string;
    gross_amount: number | null;
    fee_percent: number | null;
    bonus_amount: number;
    net_amount: number | null;
    reason: string;
    reviewer_id: string;
    requested_amount: number;
  }> = [];
  let errorMessage: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const [{ data: pendingRows }, { data: reviewRows }] = await Promise.all([
      supabase
        .from("credit_requests")
        .select("id, requested_amount, note, created_at, player_id, status")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("credit_request_reviews")
        .select(
          "id, request_id, gross_amount, fee_percent, bonus_amount, net_amount, reason, reviewer_id, is_second_approval, decision",
        )
        .eq("decision", "approved")
        .eq("is_second_approval", false)
        .limit(100),
    ]);

    const firstApprovals = reviewRows ?? [];
    const awaitingIds = new Set(firstApprovals.map((r) => r.request_id));

    // Still pending with a prior first approval → needs second reviewer.
    const pendingStillOpen = (pendingRows ?? []).filter(
      (row) => row.status === "pending",
    );

    pending = pendingStillOpen.filter((row) => !awaitingIds.has(row.id));

    const amountById = new Map(
      pendingStillOpen.map((row) => [row.id, row.requested_amount]),
    );

    awaitingSecond = firstApprovals
      .filter((review) => amountById.has(review.request_id))
      .map((review) => ({
        request_id: review.request_id,
        gross_amount: review.gross_amount,
        fee_percent: review.fee_percent,
        bonus_amount: review.bonus_amount,
        net_amount: review.net_amount,
        reason: review.reason,
        reviewer_id: review.reviewer_id,
        requested_amount:
          amountById.get(review.request_id) ?? review.gross_amount ?? 0,
      }));
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
          Approve/reject demo-credit requests with simulated fee percent. Large
          nets need a second admin calling the same review RPC.
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
                  {request.note ? ` · ${request.note}` : ""}
                </CardDescription>
              </CardHeader>
              <AdminReviewForm
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
            <Card key={review.request_id}>
              <CardHeader>
                <CardTitle>
                  Net {(review.net_amount ?? 0).toLocaleString()} GIK
                </CardTitle>
                <CardDescription>
                  Request {review.request_id.slice(0, 8)} · first reviewer{" "}
                  {review.reviewer_id.slice(0, 8)} · {review.reason}
                </CardDescription>
              </CardHeader>
              <SecondApproveForm
                requestId={review.request_id}
                gross={review.gross_amount ?? review.requested_amount}
                feePercent={Number(review.fee_percent ?? 0)}
                bonus={review.bonus_amount}
                reason={review.reason}
              />
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
