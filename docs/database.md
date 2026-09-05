# GIKGOK Database (Supabase)

Local-first schema for the demo-credit platform. **GIK credits have no monetary
value.** Server-authoritative ledger and settlement; the browser never decides
balances or outcomes.

## Local workflow

Requires Docker (for the local Supabase stack). The Supabase CLI is pinned as a
dev dependency and invoked via `npx supabase` / npm scripts.

```bash
npm run db:start        # start local Supabase stack (Docker)
npm run db:reset        # recreate DB, apply all migrations, then seed
npm run db:test         # RLS isolation tests (Vitest, Node env)
npm run db:validate     # structural validation (migrations/RLS/seed/buckets/types)
npm run security:check  # secret-leak + RLS + SECURITY DEFINER + view checks
npm run db:types        # regenerate src/lib/supabase/types.gen.ts
npm run db:types:check  # fail if generated types are stale
```

## Migrations (application order)

| # | File | Contents |
|---|------|----------|
| 1 | `…_extensions_and_shared.sql` | `citext`, `pg_trgm`; `set_updated_at()`, `prevent_mutation()` |
| 2 | `…_admin_roles_and_permissions.sql` | `admin_users`, `admin_security`, roles, role/permission maps; `app_permission` enum |
| 3 | `…_authorization_helpers.sql` | `is_admin()`, `is_owner()`, `has_permission()` + permission-based admin policies |
| 4 | `…_profiles_and_accounts.sql` | `profiles`, `player_contacts`, `player_settings`; new-user bootstrap trigger |
| 5 | `…_ledger_and_balances.sql` | immutable `gik_ledger`, `player_balances` projection, balance trigger |
| 6 | `…_credit_requests.sql` | `credit_requests`, `credit_request_reviews`; self-cancel RPC |
| 7 | `…_daily_rewards_and_streaks.sql` | `player_streaks`, `daily_reward_claims` |
| 8 | `…_games_and_configurations.sql` | `games`, `game_versions`, release events, `feature_flags` |
| 9 | `…_rounds_bets_and_receipts.sql` | `game_rounds`, `bets`, `bet_outcomes`, `receipts` (idempotency + immutability) |
| 10 | `…_announcements_and_notifications.sql` | `announcements`, `announcement_reads`, `notifications` |
| 11 | `…_missions_achievements_social.sql` | missions, achievements, `leaderboard_entries` + `security_invoker` view, friends/invites |
| 12 | `…_support_tickets.sql` | tickets, messages, attachments (≤3/message) |
| 13 | `…_audit_and_system_operations.sql` | `audit_logs`, `system_settings`, maintenance, assets, health, QA accounts; reward/credit/status RPCs |
| 14 | `…_storage_buckets_and_policies.sql` | `avatars`, `ticket-attachments`, `game-assets` buckets + policies |

## Security model

- **RLS on every table.** Players access only their own rows (`player_id = auth.uid()`).
- **Admin authorization is server-verified** via `has_permission(app_permission)`,
  which reads the admin/role/permission tables. It is **never** derived from
  user-editable `auth.user_metadata`.
- **`admin_security`** (PIN hash / TOTP secret) is deny-all: RLS on, no policy, no
  `anon`/`authenticated` grants — only `service_role` can touch it.
- **SECURITY DEFINER functions** all pin `search_path = public`, are revoked from
  `PUBLIC`, and granted only to intended roles (`security:check` enforces this).
- **Views** exposed through the Data API use `security_invoker = true`
  (`leaderboard_ranked`), so base-table RLS still applies.
- **Immutable ledger/audit/receipts** are enforced by `prevent_mutation()`
  triggers that block UPDATE/DELETE for every role, including `service_role`.
- **No service-role/secret key** appears in client code (`security:check` scans `src/`).

## Seed (`supabase/seed.sql`)

Deterministic, idempotent, **staging/demo-safe only** (no `auth.users` inserts, no
secrets). Re-running refreshes values in place. Contents by category:

- **System settings** — welcome credit (50,000), daily base (5,000), streak day-3
  (+2,000) / day-7 (+10,000), daily cap (200,000), second-approval threshold
  (500,000), default accent/locale.
- **Admin roles + permission maps** — Super Admin, Game Manager, Player Manager,
  Credit Manager, Support Viewer, Report Viewer.
- **Games + v1 configs** — Fish–Prawn–Crab, High–Low, Spinning Plate (live, with
  active version pinned).
- **Missions / achievements** — sample data-driven definitions.
- **Feature flags** — leaderboard, 3D rendering, controlled-demo, friends/invites.

## Creating staging test users (after remote link)

The seed does **not** create accounts. Create Owner/Admin/Player test users
through supported Supabase Auth APIs, then promote as needed:

1. Create the auth user (service-role key, server-side only — never in the browser):

   ```bash
   # Owner
   curl -sS -X POST "$SUPABASE_URL/auth/v1/admin/users" \
     -H "apikey: $SUPABASE_SECRET_KEY" \
     -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
     -H "Content-Type: application/json" \
     -d '{"email":"owner@staging.example","password":"<generated>","email_confirm":true,
          "user_metadata":{"nickname":"owner"}}'
   ```

   The `handle_new_user()` trigger auto-creates the matching `profiles` +
   `player_settings` rows. Repeat for admin and player emails.

2. Promote the Owner (service-role SQL/RPC, once):

   ```sql
   select public.bootstrap_first_owner('<owner-auth-uuid>');  -- no-op if an owner exists
   ```

3. Grant an admin a role or individual permissions (service-role SQL):

   ```sql
   insert into public.admin_users (id, is_active) values ('<admin-uuid>', true)
     on conflict (id) do update set is_active = true;
   insert into public.admin_user_roles (admin_id, role_id)
     select '<admin-uuid>', id from public.admin_roles where key = 'credit_manager';
   ```

4. Players need no promotion; the trigger provisions their profile on signup.

> Secrets (service/secret keys, generated passwords) live only in the deployment
> environment configuration — never in the repo, seed, or client bundle.

## Status

| Item | Status |
|------|--------|
| Migrations apply to a clean local DB | ✅ verified (`db:reset`) |
| Seed applies + idempotent | ✅ verified |
| RLS isolation tests | ✅ pass (`db:test`) |
| `db:validate` / `security:check` | ✅ pass |
| Generated types current | ✅ `db:types:check` clean |
| **Remote staging integration** (link / `db push` / seed) | ✅ applied to `jlpcfatcpymjnjbxmclo` (14 migrations + seed) |
| Remote RLS / `security:check` against staging | ✅ pass (pooler connection) |
| Staging test users (owner / admin / player) | ✅ created + promoted (passwords ephemeral — reset via dashboard) |
| Security DEFINER privilege hardening | ✅ forward migration `20260905155508_harden_security_definer_privileges_and_rls_performance.sql` applied |
| Security / Performance advisors (post-hardening) | ✅ anon DEFINER + mutable search_path cleared; remaining findings documented below |

> Correction to the earlier Phase 0 record: the previous `db:validate` "PASS"
> did **not** validate a deployed schema, because migration and seed files did
> not yet exist. `db:validate` now validates the real schema against a local
> Supabase database.

## SECURITY DEFINER privilege matrix (post-hardening)

| Function | Class | DEFINER required? | `anon` | `authenticated` | `service_role` |
|----------|-------|-------------------|--------|-----------------|----------------|
| `is_admin` / `is_owner` / `has_permission` | RLS helper | Yes — read admin tables under RLS | ✗ | ✓ | ✓ |
| `handle_new_user` | trigger | Yes — insert profile/settings on signup | ✗ | ✗ | ✗ (trigger only) |
| `append_ledger_entry` | internal-only | Yes — mint ledger rows | ✗ | ✗ | ✓ |
| `write_audit` | internal-only | Yes — insert audit rows | ✗ | ✗ | ✓ |
| `get_setting` | authenticated RPC | Yes — settings table is admin-gated | ✗ | ✓ (requires `auth.uid()` or service) | ✓ |
| `claim_daily_reward` | authenticated player RPC | Yes — writes claims/ledger for caller | ✗ | ✓ (`auth.uid()` only) | ✓ |
| `cancel_credit_request` | authenticated player RPC | Yes — updates own pending request | ✗ | ✓ (own row only) | ✓ |
| `admin_set_player_status` | permission-gated admin RPC | Yes — updates any profile after `players.suspend` check | ✗ | ✓ | ✓ |
| `review_credit_request` | permission-gated admin RPC | Yes — credits `request.player_id` after `credits.adjust` | ✗ | ✓ | ✓ |
| `bootstrap_first_owner` | internal bootstrap | Yes — creates first owner; refuses if one exists; JWT role must be `service_role` | ✗ | ✗ | ✓ |
| `set_updated_at` / `prevent_mutation` / `apply_ledger_entry` / `enforce_attachment_limit` | trigger helpers | No — `SECURITY INVOKER` + pinned `search_path` | ✗ | ✗ | ✗ |

`has_permission` / `is_admin` / `is_owner` ignore caller-supplied `uid` unless the JWT role is `service_role`.

## Advisor findings (staging)

**Before → after** the hardening migration:

| Advisor | Before | After | Disposition |
|---------|--------|-------|-------------|
| `anon_security_definer_function_executable` | 12 | 0 | Fixed |
| `function_search_path_mutable` | 4 | 0 | Fixed |
| `authenticated_security_definer_function_executable` | 12 | 8 | **Accepted** — intentional EXECUTE for RLS helpers + player/admin RPCs |
| `rls_enabled_no_policy` (`admin_security`) | 1 | 1 | **Accepted** — deny-all by design |
| `auth_leaked_password_protection` | 1 | 1 | **Deferred** — Auth dashboard setting |
| `unindexed_foreign_keys` | 31 | 0 | Fixed |
| `auth_rls_initplan` | 38 | 0 | Fixed (`(select auth.uid())`) |
| `multiple_permissive_policies` | 18 | 1 (after follow-up) | **Accepted** — remaining overlap is `player_contacts` `FOR ALL` own-row + admin SELECT combined policy; merging would change write semantics. Redundant `player_settings` SELECT dropped in `20260905160657_…` |
| `unused_index` | 39 | 70 | **Deferred** — empty staging; includes new FK indexes; do not drop |
| `auth_db_connections_absolute` | 1 | 1 | **Deferred** — project plan / pool sizing |

## `sb_secret_…` HTTP 401 root cause

Official docs: send publishable/secret keys on the **`apikey` header**, not alone on
`Authorization: Bearer` (they are not JWTs). Repro without printing secrets:

| Call pattern | Result |
|--------------|--------|
| `Authorization: Bearer sb_secret_…` only | **401** `No API key found in request` |
| `apikey: sb_secret_…` (REST) | **200** |
| `createClient(url, sb_secret_…)` then `auth.admin.listUsers` | **ok** |

Earlier Auth Admin failures were from Bearer-only usage. Do **not** add a legacy
`service_role` key to Cloud Environment; use `SUPABASE_SECRET_KEY` with the
supported client/`apikey` convention when backend admin APIs are needed.

## Remote staging commands (guarded; staging project only)

Target project ref: `jlpcfatcpymjnjbxmclo`. Never `db reset` remote, never
touch another project, never deploy production.

```bash
export SUPABASE_ACCESS_TOKEN=…   # personal access token (secret)
export SUPABASE_DB_PASSWORD=…    # staging DB password (secret)
npx supabase link --project-ref jlpcfatcpymjnjbxmclo
npx supabase migration list --linked
npx supabase db push --dry-run   # confirm only the reviewed forward migration(s)
npx supabase db push             # apply to staging
npx supabase db push --include-seed   # staging-only seed (already applied once)
```
