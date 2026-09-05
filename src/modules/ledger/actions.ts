"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/modules/player/auth-shared";
import {
  computeNetCredit,
  computeSimulationFee,
  feeValueToPercent,
  type FeeMode,
} from "@/modules/ledger";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function asMessage(error: { message: string } | null): string {
  return error?.message ?? "Unexpected error";
}

export async function claimDailyRewardAction(): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("claim_daily_reward");

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/home");
  revalidatePath("/credits");
  revalidatePath("/ledger");

  const payload = (data ?? {}) as {
    total_amount?: number;
    streak_day?: number;
  };

  return {
    ok: true,
    message: `Claimed ${(payload.total_amount ?? 0).toLocaleString()} GIK (day ${payload.streak_day ?? 0})`,
    data: payload,
  };
}

export async function createCreditRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "Enter a positive whole-number amount." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Sign in required." };
  }

  // Staging has no create_credit_request RPC — insert allowed columns only.
  const { error } = await supabase.from("credit_requests").insert({
    player_id: user.id,
    requested_amount: amount,
    note: note || null,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/credits");
  return { ok: true, message: "Credit request submitted." };
}

export async function cancelCreditRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("cancel_credit_request", {
    p_request_id: requestId,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/credits");
  return { ok: true, message: "Request cancelled." };
}

export async function reviewCreditRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const gross = Number(formData.get("grossAmount"));
  const feeModeRaw = String(formData.get("feeMode") ?? "");
  const feeValue = Number(formData.get("feeValue"));
  const bonus = Number(formData.get("bonusAmount") || 0);

  if (!requestId) {
    return { ok: false, message: "Missing request id." };
  }
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, message: "Choose approve or reject." };
  }
  if (reason.length < 1) {
    return { ok: false, message: "Reason is required." };
  }

  const feeMode =
    feeModeRaw === "percent" || feeModeRaw === "amount"
      ? (feeModeRaw as FeeMode)
      : null;

  let feePercent = 0;
  if (decision === "approved") {
    if (!Number.isInteger(gross) || gross <= 0) {
      return { ok: false, message: "Gross amount must be a positive integer." };
    }
    feePercent = feeValueToPercent(
      gross,
      feeMode,
      Number.isFinite(feeValue) ? feeValue : null,
    );
    const fee = computeSimulationFee({
      gross,
      feeMode: "percent",
      feeValue: feePercent,
    });
    const net = computeNetCredit({
      gross,
      fee,
      bonus: Number.isFinite(bonus) ? bonus : 0,
    });
    if (net < 0) {
      return { ok: false, message: "Net amount cannot be negative." };
    }
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("review_credit_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_gross: decision === "approved" ? gross : null,
    p_fee_percent: decision === "approved" ? feePercent : 0,
    p_bonus: decision === "approved" ? (Number.isFinite(bonus) ? bonus : 0) : 0,
    p_reason: reason,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/credits");
  revalidatePath("/credits");
  revalidatePath("/ledger");

  const payload = (data ?? {}) as { status?: string };
  return {
    ok: true,
    message:
      payload.status === "pending_second_approval"
        ? "Approved pending second approver."
        : `Request ${payload.status ?? decision}.`,
    data: payload,
  };
}

/**
 * Second approval is another `review_credit_request` call by a different admin.
 * Prefills gross / fee percent / bonus / reason from the first review.
 */
export async function secondApproveCreditRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Ensure decision is approved and feeMode is percent for the shared reviewer.
  const next = new FormData();
  for (const [key, value] of formData.entries()) {
    next.set(key, value);
  }
  next.set("decision", "approved");
  if (!next.get("feeMode")) {
    next.set("feeMode", "percent");
  }
  return reviewCreditRequestAction(null, next);
}
