"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/modules/player/auth-shared";
import {
  computeNetCredit,
  computeSimulationFee,
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
  const note = String(formData.get("note") ?? "");

  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "Enter a positive whole-number amount." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("create_credit_request", {
    p_amount: amount,
    p_note: note || null,
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
  if (reason.length < 3) {
    return { ok: false, message: "Reason is required (min 3 characters)." };
  }

  const feeMode =
    feeModeRaw === "percent" || feeModeRaw === "amount"
      ? (feeModeRaw as FeeMode)
      : null;

  if (decision === "approved") {
    if (!Number.isInteger(gross) || gross <= 0) {
      return { ok: false, message: "Gross amount must be a positive integer." };
    }
    const fee = computeSimulationFee({
      gross,
      feeMode,
      feeValue: Number.isFinite(feeValue) ? feeValue : null,
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
    p_reason: reason,
    p_gross_amount: decision === "approved" ? gross : null,
    p_fee_mode: decision === "approved" ? feeMode : null,
    p_fee_value:
      decision === "approved" && feeMode && Number.isFinite(feeValue)
        ? feeValue
        : null,
    p_bonus_amount: decision === "approved" ? bonus || 0 : 0,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/admin");
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

export async function secondApproveCreditRequestAction(
  reviewId: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("second_approve_credit_request", {
    p_review_id: reviewId,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/admin");
  revalidatePath("/credits");
  revalidatePath("/ledger");
  return { ok: true, message: "Second approval recorded and credits granted." };
}
