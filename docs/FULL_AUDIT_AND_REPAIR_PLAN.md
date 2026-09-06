# GIKGOK — Full Audit and Repair Plan

**Baseline (start of this loop):** `38342c9702e4c31cc92f9eabf8bbba54aedfece8` on `cursor/gikgok-continuous-implementation`
**PR:** [#14](https://github.com/IT-FoU/GikGok/pull/14) (Draft) → `cursor/supabase-staging-integration-455c`
**Staging project:** `jlpcfatcpymjnjbxmclo` only
**Migrations applied through:** `20260905210000` (new fixes are forward-only)

## Completeness concepts (do not conflate)

| Concept | Meaning |
|---------|---------|
| Implementation complete | Code/schema exists and matches requirements |
| Automated verification complete | Focused + suite tests prove the behavior |
| Staging integration complete | Forward migration applied to `jlpcfatcpymjnjbxmclo` and verified |
| Release acceptance complete | Owner gates + physical QA + merge criteria met |

## Environment snapshot

| Item | Value |
|------|-------|
| HEAD at audit start | `38342c9702e4c31cc92f9eabf8bbba54aedfece8` |
| Dirty tree | clean (except new audit artifacts during loop) |
| Commits ahead of PR base | 18 |
| Commits ahead of `main` | 32 |
| GitHub CI workflows | **none** (no `.github/workflows`) |
| Node / npm / Next / Supabase CLI | v22.14.0 / 10.9.7 / 16.3.4 / 2.116.0 |
| Local Docker Supabase | historically BLOCKED (overlayfs) |
| Advisors (pre-repair) | Security WARN ×64 (authenticated EXECUTE on SECURITY DEFINER); Performance WARN ×1 (multiple permissive policies on contacts) |

---

## Findings ledger

### P0-001 — Admin 2FA accepts demo code `000000` and plaintext secrets

- **Severity:** P0
- **Phase / requirement:** Phase 10 — Admin PIN/2FA for sensitive actions
- **Affected:** `verify_admin_2fa`, `set_admin_2fa`, `assert_admin_sensitive`, `admin_security`, `admin_sensitive_challenges`, `src/modules/admin/actions.ts`
- **Evidence:** Live `pg_get_functiondef('verify_admin_2fa')` accepts last-6-of-secret **or** `'000000'`. `set_admin_2fa` stores caller secret / `'demo-totp-secret'`. `assert_admin_sensitive` only enforces PIN/2FA when hash/flag already present (fail-open).
- **Impact:** Any admin can pass sensitive RPCs with `000000` or by leaving 2FA unset while `requires_2fa` is true.
- **Root cause:** Demo MFA left in staging RPCs.
- **Planned fix:** Supabase Auth MFA (AAL2) + fail-closed asserts; reject demo codes; no plaintext TOTP secrets; session-scoped challenges; attempt rate limits; audit.
- **Regression tests:** Wrong/`000000` fail; required-but-unconfigured blocks; sensitive RPCs covered.
- **Migration:** yes (`harden_p0_admin_mfa_missions_eligibility`)
- **Status:** VERIFIED (staging + DB tests)
- **Commit:** pending push

### P0-002 — Mission/achievement progress forgeable via direct RPC

- **Severity:** P0
- **Phase / requirement:** Phase 9 — missions/achievements; security DEFINER grants
- **Affected:** `record_mission_progress`, `unlock_achievement`, `place_and_settle_bet`, game-engine actions
- **Evidence:** `authenticated` has EXECUTE; functions increment progress / unlock without bet proof. App also calls them after settle (bypassable by skipping the app).
- **Impact:** Players can farm mission rewards and badges without playing.
- **Root cause:** Client-callable SECURITY DEFINER mutators.
- **Planned fix:** Revoke EXECUTE from `authenticated`/`anon`; settle-path-only `apply_settled_bet_engagement` with bet-id idempotency; keep `claim_mission_reward` once-only.
- **Regression tests:** Direct RPC denied; settle grants once; claim once; replay safe.
- **Migration:** yes
- **Status:** VERIFIED (staging + DB tests)
- **Commit:** pending push

### P0-003 — Responsible-play / status gates incomplete in DB mutators

- **Severity:** P0/P1
- **Phase / requirement:** Phase 2/9/11 — status + responsible play
- **Affected:** `assert_play_allowed`, `place_and_settle_bet`, `claim_daily_reward`, `credit_requests` INSERT policy, middleware
- **Evidence:** `assert_play_allowed` only checks `play_paused_until`. `place_and_settle_bet` checks active+verified but **not** pause. Daily reward has no status/pause check. Credit insert WITH CHECK is only `player_id = auth.uid()`. Middleware status gates only `/home` and `/profile*`.
- **Impact:** Paused/suspended/deletion-requested players can still mutate via RPC/RLS.
- **Root cause:** Eligibility not centralized; UI middleware treated as control.
- **Planned fix:** Expand `assert_play_allowed`; call from settle + daily claim + mission claim; harden credit INSERT WITH CHECK; broaden middleware as convenience only.
- **Regression tests:** Paused/suspended/banned/deletion-requested denied on direct RPC; existing session after status change denied.
- **Migration:** yes
- **Status:** VERIFIED (staging + DB tests)
- **Commit:** pending push

### P0-004 — `mark_contact_verified` trusts authenticated caller without Auth proof

- **Severity:** P0/P1
- **Phase / requirement:** Phase 2 — verification before play / welcome credit
- **Affected:** `mark_contact_verified`, player verify actions
- **Evidence:** Any authenticated user can mark own primary contact verified without `auth.users` email/phone confirmation match. Admins can mark arbitrary users via `is_admin()`.
- **Impact:** Unverified users can unlock play + welcome credit.
- **Root cause:** Application RPC does not bind to Auth confirmation state.
- **Planned fix:** Require confirmed Auth email/phone matching contact value for self-verify; restrict admin path to `players.suspend`+owner or service_role only (narrow); tests for bypass + races.
- **Regression tests:** Direct self-verify without Auth confirmation fails; welcome credit remains exactly-once after genuine verify.
- **Migration:** yes
- **Status:** VERIFIED (staging + DB tests)
- **Commit:** pending push

### P1-001 — Security Advisor: 64 authenticated-callable SECURITY DEFINER functions

- **Severity:** P1
- **Phase / requirement:** Phase 1/11 — least privilege
- **Affected:** all public SECURITY DEFINER RPCs
- **Evidence:** `supabase db advisors --linked --type security` → 64 WARN “Signed-In Users Can Execute SECURITY DEFINER Function”
- **Impact:** Large attack surface; internal helpers may be callable.
- **Root cause:** Broad EXECUTE grants to `authenticated`.
- **Planned fix:** Classify public vs internal; revoke internal; document intentional player/admin RPCs; pin `search_path` (already mostly pinned).
- **Regression tests:** anon execute empty; internal helpers denied to authenticated.
- **Migration:** yes (`20260906015729_triage_security_definer_grants_and_search_path.sql` + P0)
- **Status:** VERIFIED (internals revoked; ~60 intentional authenticated WARNs documented in `docs/ADVISOR_TRIAGE.md`; DB tests assert deny for rate-limit / round / session helpers)
- **Commit:** _(this branch)_

### P1-002 — Performance Advisor: multiple permissive policies

- **Severity:** P1
- **Phase / requirement:** Phase 1 — RLS performance
- **Affected:** contacts table policies (advisor metadata)
- **Evidence:** 1 Performance WARN (SELECT overlap)
- **Planned fix:** consolidate policies after confirming table name/policies
- **Migration:** `20260906020608_fix_player_contacts_permissive_select_overlap.sql`
- **Status:** VERIFIED (Performance Advisor clean after contacts policy split; see `docs/ADVISOR_TRIAGE.md`)

### P1-003 — Support ticket image attachments incomplete

- **Severity:** P1
- **Phase / requirement:** Phase 9 — attachments max 3, private bucket, validation
- **Evidence:** Schema/bucket exist; player UI/upload path and magic-byte validation incomplete vs claims in `docs/security-audit.md`
- **Status:** FIXED (upload/delete actions, magic-byte validation, Support/TicketReply forms, signed URL thumbnails on player + admin; migration `20260906020814_harden_ticket_attachments_delete_and_constraints.sql`)

### P1-004 — Avatar crop / content validation incomplete

- **Severity:** P1
- **Phase / requirement:** Phase 2 — avatar upload/crop/validation
- **Evidence:** Upload uses client MIME; no real crop workflow / magic-byte check end-to-end
- **Status:** FIXED (square crop preview in `AvatarUploadForm`; server `validateImageMagicBytes` in `uploadAvatarAction`)

### P1-005 — Lao/English localization gaps

- **Severity:** P1
- **Phase / requirement:** Phase 3 — all user-facing strings
- **Evidence:** Hard-coded English remains in admin action forms, admin page copy, home/history/leaderboard chrome, RPC/action error messages, and notification title/body payloads
- **Status:** IN PROGRESS — high-impact pass done for support tickets, friends, missions, credits (player ledger UI), engagement controls (notifications / responsible play / mission claim / friend actions), common Loading/Empty/Error + `titleKey`, admin shell nav labels + aria. `FUTURE_LOCALES` (`th`) preserved. Remaining: broad admin module page strings, home and other player chrome, server/action message localization, DB-sourced notification text.

### P1-006 — False-confidence tests

- **Severity:** P1
- **Phase / requirement:** Phase 11 — QA
- **Affected:** `tests/e2e/smoke.spec.ts` posts `/api/games/bet` and accepts 404; `security:check` PASSes when DB skipped; thin admin permission tests; missing Phase 9–11 DB RPC abuse tests; no CI workflows
- **Status:** IN PROGRESS (`.github/workflows/ci.yml` added with lint/typecheck/unit/build/`security:check`; DB skip only via `SECURITY_CHECK_ALLOW_SKIP_DB=1`)

### P1-007 — Security docs/controls mismatch

- **Severity:** P1/P2
- **Affected:** `docs/security-audit.md`, `assertSameOrigin` unused on mutations, CSP `unsafe-eval`, middleware deprecation note for Next 16
- **Status:** IN PROGRESS (`requireSameOrigin` on bet + ticket uploads; prod CSP drops `unsafe-eval`; audit doc updated; remaining mutators + middleware→proxy still open)

### P2-001 — Stale continuation / final report metadata

- **Severity:** P2
- **Affected:** `docs/CONTINUATION.md`, `docs/FINAL_REPORT.md` commit IDs / branch framing
- **Status:** FIXED (updated to PR #14 + current tip; refresh HEAD after each push)

### P2-002 — tasks.md over-checked relative to verification evidence

- **Severity:** P2
- **Evidence:** Many Phase 9–11 boxes checked without authenticated Playwright, device QA, or DB abuse tests; Phase 10 “test every permission boundary” not evidenced by suite size
- **Planned fix:** Re-open checkboxes lacking evidence after repair pass
- **Status:** OPEN

### WAITING / BLOCKED (Owner / environment only)

| ID | Item | Status |
|----|------|--------|
| W-001 | Live Phone OTP / SMS provider | WAITING |
| W-002 | Authenticated staging Playwright credentials (safe create/reset) | WAITING |
| W-003 | Local Docker Supabase | BLOCKED |
| W-004 | Hosted preview deployment approval | WAITING |
| W-005 | Physical iOS/Android/tablet QA | WAITING |
| W-006 | Production deploy / merge to `main` | WAITING (do not perform) |

---

## Repair order

1. P0-001 … P0-004 (this migration + app/tests)
2. P1-001 / P1-002 advisors
3. P1-003 … P1-005 features
4. P1-006 tests + CI
5. P1-007 / P2 docs + honest `tasks.md`

## Validation gates (record exact output each loop)

`npm ci` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run security:check` · `npm audit` · `git diff --check` · staging `db push --dry-run` then push · Advisors · Playwright smoke


## Repair progress log

| When | Action | Result |
|------|--------|--------|
| Loop 1 | Created audit ledger | Done |
| Loop 1 | Forward migration `20260906013529_harden_p0_admin_mfa_missions_eligibility.sql` | Applied to staging `jlpcfatcpymjnjbxmclo` |
| Loop 1 | Admin MFA fail-closed + Auth MFA path | VERIFIED (DB tests reject `000000`; assert fails without enrollment) |
| Loop 1 | Mission/achievement client forge closed | VERIFIED (EXECUTE revoked; settle-path engagement) |
| Loop 1 | `assert_play_allowed` + settle/daily/mission/credit gates | VERIFIED (suspended rejected; verified contact required) |
| Loop 1 | `mark_contact_verified` Auth-bound | VERIFIED (function requires confirmation evidence) |
| Loop 1 | E2E false-positive bet 404 test replaced | Done |
| Loop 1 | `security:check` no longer PASSes when DB skipped | Done (exit 2) |
| Loop 1 | Middleware status gates broadened | Done (convenience only) |
| Loop 2 | Advisor triage docs + contacts policy split + ticket attachment delete constraints | Done |
| Loop 2 | Ticket attachments upload/delete + signed URLs; avatar crop + magic bytes; partial i18n; CI workflow | FIXED / IN PROGRESS |
| Remaining | Broader i18n (P1-005), false-confidence tests (P1-006 remainder), docs mismatch (P1-007) | OPEN |



## Findings ledger (this loop)

| ID | Severity | Finding | Fix | Status |
|----|----------|---------|-----|--------|
| A-MFA | CRITICAL | `verify_admin_2fa` minted OTP on AAL2 + arbitrary code | Auth TOTP + AAL2; stub/revoke; PIN separate | FIXED |
| B-ATT | HIGH | 5MB×3 vs 1MB action body; attachment invariants | `bodySizeLimit` 16mb; triggers; orphan table | FIXED |
| C-DEF | HIGH | Broad authenticated DEFINER surface | Classify/comment; revoke internals; whitelist settings | PARTIAL→improved |
| D-I18N | HIGH | Hard-coded EN auth/status; raw action messages | Catalogs + codes + parity tests | PARTIAL |
| E-TEST | HIGH | 404-as-security; regex-only contact verify; weak daily isolation | Honest smoke; behavioral RPC; A/B snapshots; matrix scaffold | PARTIAL |
| F-NEXT | MED | middleware deprecation; CSP unsafe-inline; origin spoof | `proxy.ts`; exact origin match; CSP limitation documented | PARTIAL |
| G-DOCS | MED | Over-checked tasks / stale PR body | Reopen honesty; docs authoritative | IN PROGRESS |
