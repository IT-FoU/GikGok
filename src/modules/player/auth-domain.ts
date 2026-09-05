/**
 * Pure domain helpers for auth lifecycle rules (unit-testable without DB).
 * Server authority remains in SECURITY DEFINER RPCs.
 */

export function grantWelcomeCreditIdempotent(input: {
  verified: boolean;
  alreadyGranted: boolean;
  amount: number;
}): { granted: boolean; already_granted: boolean; amount: number } {
  if (!input.verified) {
    throw new Error("verify email or phone before receiving welcome credit");
  }
  if (input.alreadyGranted) {
    return { granted: false, already_granted: true, amount: 0 };
  }
  if (input.amount <= 0) {
    return { granted: false, already_granted: false, amount: 0 };
  }
  return { granted: true, already_granted: false, amount: input.amount };
}

export function playerCanPlay(input: {
  status: string;
  verified: boolean;
}): boolean {
  return input.status === "active" && input.verified;
}
