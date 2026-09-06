# Advisor triage — GIKGOK staging (`jlpcfatcpymjnjbxmclo`)

Demo GIK credits only. This note records Security / Performance Advisor outcomes
after P0 hardening and the P1 grant / RLS follow-ups.

## Security Advisor

### Internals revoked

Internal `SECURITY DEFINER` helpers are no longer executable by `anon` /
`authenticated`. EXECUTE is limited to `service_role` (and database owner where
applicable). Examples covered by forward migrations:

- `assert_admin_auth_rate_limit(text)`
- `open_game_round(text, public.game_mode, jsonb)`
- `ensure_player_round(text)`
- `admin_session_id()`
- `apply_settled_bet_engagement(...)`
- `record_mission_progress(text)` / `unlock_achievement(text)`
- `admin_has_verified_totp(uuid)`

Client roles calling these must fail with permission denied. Covered by
`tests/db/security-rpc.test.ts`.

### Intentional authenticated SECURITY DEFINER WARNs (~60)

Security Advisor still reports WARN for signed-in users executing SECURITY
DEFINER functions that are **intentional product RPCs** (player engagement,
ledger settlement entrypoints, admin console actions gated inside the function
body with `auth.uid()` / `has_permission`).

These are accepted with reasoning:

1. PostgREST clients need EXECUTE on the RPC surface; moving every call behind
   `service_role` would force a custom BFF for every player action.
2. Each remaining function pins `search_path` and enforces authz in-body
   (identity from `auth.uid()`, permission checks, ownership checks).
3. Internal helpers that Advisors previously flagged as callable have been
   revoked (see above); the remaining WARN count is the curated public API,
   not an untriaged dump of triggers/helpers.
4. `anon` EXECUTE on SECURITY DEFINER remains empty (asserted in DB tests and
   `npm run security:check` when a DB is reachable).

Do **not** “silence” Advisors by broadening grants. Prefer revoke + document.

## Performance Advisor

### Contacts policy split — now clean

Performance Advisor previously flagged multiple permissive SELECT policies on
`player_contacts` because `contacts_modify_own` was `FOR ALL` (including SELECT)
and stacked with `contacts_select_combined`.

Forward migration
`20260906020608_fix_player_contacts_permissive_select_overlap.sql` narrows
modify policies to INSERT/UPDATE/DELETE and keeps a single SELECT policy.
Performance Advisor for this overlap is **clean** after that migration.

## Related migrations

- `20260906013529_harden_p0_admin_mfa_missions_eligibility.sql`
- `20260906015729_triage_security_definer_grants_and_search_path.sql`
- `20260906020608_fix_player_contacts_permissive_select_overlap.sql`
- `20260906020814_harden_ticket_attachments_delete_and_constraints.sql`


## 2026-09-06 DEFINER surface pass (`20260906032157`, `20260906034500`)

Applied to staging `jlpcfatcpymjnjbxmclo` only.

- `refresh_leaderboard_entries()` — admin/`system.settings` or `service_role` only (body gate).
- `get_setting(text,jsonb)` — player whitelist; full read for `system.settings` / service_role.
- `assert_admin_sensitive()` — EXECUTE revoked from `authenticated` (internal DEFINER gate).
- `verify_admin_2fa(text)` — stub retained; EXECUTE revoked from `authenticated`.
- Comments recorded for remaining intentional authenticated DEFINER RPCs.

### Advisor reporting rule

Always report **WARN** and **INFO** counts separately. Never claim Advisors are
"fully clean" while INFO items remain. Intentional authenticated DEFINER RPCs are
expected Security WARNs until product architecture changes.


## Advisor recount (2026-09-06 after `20260906034500`)

Staging project `jlpcfatcpymjnjbxmclo` via Management API:

| Advisor | WARN | INFO | Notes |
|---------|------|------|-------|
| Security | **60** | **4** | WARN = intentional authenticated SECURITY DEFINER RPCs (`authenticated_security_definer_function_executable`). INFO = `rls_enabled_no_policy` on internal admin tables without client policies. |
| Performance | **0** | **71** | No WARN. INFO includes unused indexes / unindexed FKs — not claimed "fully clean". |

Never report Advisors as fully clean while INFO items remain.


## 2026-09-06 tip watermark `20260906080000`

- Staging project `jlpcfatcpymjnjbxmclo`.
- Additional revoke: `get_active_game_version` EXECUTE removed from `authenticated`/`anon`.
- Storage INSERT for `ticket-attachments` now requires owned ticket path.
- Management Advisors API returned **403** during this tip — do not invent new WARN totals.
- Last documented: Security WARN ~60 intentional authenticated DEFINER RPCs; Security INFO remain; Performance WARN ×0; Performance INFO remain.
- Live inventory this tip: ~81 public SECURITY DEFINER; ~63 authenticated EXECUTE; anon EXECUTE 0.
