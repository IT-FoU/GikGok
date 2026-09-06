## Latest tip `31a03af`
- Implementable i18n/security/test deepen loop landed; public Playwright PASS; external Owner gates still WAITING.

# Continuation checkpoint — GIKGOK continuous implementation

## Branch
- `cursor/gikgok-continuous-implementation`
- Tip: use `git rev-parse HEAD` (do not hard-code a self-referential hash here)
- PR [#14](https://github.com/IT-FoU/GikGok/pull/14) (Draft) → `cursor/supabase-staging-integration-455c`
- Staging Supabase project: **`jlpcfatcpymjnjbxmclo` only**
- Migration watermark on staging: **`20260906080000`**

## Progress
| Phase | Status |
|-------|--------|
| 0–11 implementable core | Mostly complete; Owner/external gates remain |
| P0 admin MFA / missions / eligibility / contact verify | VERIFIED on staging |
| Storage orphan authorization + manual admin retry | VERIFIED (no automatic retry consumer) |
| Ticket-attachments Storage INSERT ownership | VERIFIED (`20260906080000`) |
| Dual-approval + attachment concurrency DB tests | VERIFIED |
| Permission-matrix behavioral DB tests | VERIFIED (representative families) |
| CSRF/Origin on mutating server actions | VERIFIED (player/ledger/engagement/game/admin) |
| CSP script nonce via `src/proxy.ts` | IMPLEMENTED; style still `unsafe-inline` |
| LO/EN chrome + ActionResult codes | ADVANCED — tickets/home/MFA chrome, notification type labels, admin/engagement/ledger codes; EN/LO parity required |
| Playwright authenticated E2E | WAITING credentials |
| Physical device QA | WAITING devices |
| Phone OTP live | WAITING SMS provider |
| Local Docker Supabase | BLOCKED (overlayfs) |
| Hosted preview deploy | WAITING Owner hosting |
| Advisor Management API recount | BLOCKED (HTTP 403 this session) |

## Last completed (this loop)
- CI static vs DB split (secrets not in job-level `if`)
- Storage orphan grant/RPC hardening + behavioral tests
- Manual admin orphan cleanup (honest “manual only” messaging)
- Dual-approval threshold/concurrency + attachment limit concurrency
- CSRF Origin on remaining mutators including MFA enroll
- Stable ActionResult codes + shared `resolveActionMessage`
- Migration `20260906080000` (Storage INSERT ticket ownership; revoke `get_active_game_version` from authenticated)
- Proxy nonce CSP for scripts; static CSP removed from `next.config.ts`
- Serialize Vitest DB workers (`fileParallelism: false`, `maxWorkers: 1`) to stop shared-fixture races
- CI concurrency: group by branch name (push+PR); DB job queues on `gikgok-staging-db-rls-suite` so parallel workflows cannot race staging fixtures
- Harden shared staging fixtures: advisory lock + aggressive admin perm restore; profiles-first lock order; deadlock retry on `mark_contact_verified`; restore perms before `has_permission` self-assert
- Tip Actions green on `bd220c9` after fixture/deadlock hardenings (Static + DB)
- Residual chrome i18n: profile settings/deletion, ledger admin review / second approve / filters, create-admin form — EN/LO parity

## Next actions
1. Recount Advisors via dashboard when Management API allows (do not claim “fully clean”)
2. Owner: staging auth credentials → Playwright critical journeys
3. Owner: physical iOS/Android/tablet Light/Dark Lao/English QA
4. Owner: SMS provider → Phone OTP
5. Owner: hosted preview deploy
6. Do **not** merge to `main` or production without Owner approval
7. Optional follow-up: style CSP nonce (`style-src` still `unsafe-inline`); deeper DEFINER COMMENT coverage; remaining admin placeholder chrome i18n

## Tip Actions
- Latest tip green: [https://github.com/IT-FoU/GikGok/actions/runs/34032016542](https://github.com/IT-FoU/GikGok/actions/runs/34032016542) — Static PASS + DB PASS on `75ec7b3` (residual chrome i18n)
- Prior green (fixture/deadlock hardenings): [https://github.com/IT-FoU/GikGok/actions/runs/34031542121](https://github.com/IT-FoU/GikGok/actions/runs/34031542121) on `bd220c9`
- Prior green (Owner-corrected secret): [https://github.com/IT-FoU/GikGok/actions/runs/34026129961](https://github.com/IT-FoU/GikGok/actions/runs/34026129961) on `2474719`

## Validation snapshot
- `npm run lint` / `typecheck` / `test` / `build` / `security:check` / `npm audit --omit=dev` — run at tip
- `npm run db:test` against staging — run at tip
- Static CI green ≠ live DB security PASS
- DEFINER inventory (staging): ~81 public SECURITY DEFINER; ~63 EXECUTE for `authenticated`; `anon` EXECUTE = 0
- Security Advisor WARN: treat ~60 intentional authenticated DEFINER RPCs as WARN (last documented); INFO remains (RLS-enabled tables without policies, etc.)
- Performance Advisor WARN ×0 last documented; INFO remain

## Safe resume
Continue remaining chrome i18n and Owner gates. Forward-only migrations. Never touch `main`, production, or other Supabase projects.
