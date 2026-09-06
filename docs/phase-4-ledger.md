# Phase 4 — Ledger, rewards, credit requests (staging schema)

## Delivered

- Append-only ledger domain helpers in `src/modules/ledger` (no direct balance mutation)
- Streak rules aligned with staging `claim_daily_reward`: consecutive UTC days increment; missed day resets to 1; streak keeps growing (no wrap at 7)
- Bonuses: `streak % 7 === 0` → day-7 bonus; else `streak % 7 === 3` → day-3 bonus
- Credit config mapped to settings keys: `rewards.welcome_credit`, `rewards.daily_base`, streak bonuses, `rewards.max_balance_for_daily`, `credits.second_approval_threshold`
- Player daily check-in + credit request create/cancel (`/credits`) — create via INSERT into `credit_requests` (no create RPC)
- Admin review via `review_credit_request` with `p_gross` / `p_fee_percent` / `p_bonus` / `p_reason`; second approval is a second call to the same RPC
- Player ledger history over `gik_ledger` (`/ledger`)
- Unit tests for streak, %7 bonuses, fee/net, strict `>` second-approver threshold, reconcile

## Validation

```bash
npm run typecheck
npm test
```
