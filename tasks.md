# GIKGOK — AI Coding Agent Task Plan

## Execution rules

- [x] Read `requirements.md` completely before changing code.
- [x] Inspect the existing repository and preserve unrelated files/changes.
- [x] Keep the project demo-credit only; do not add real-money/payment/wallet/cash-out functionality.
- [ ] Complete tasks in order; do not mark a task complete without running its stated validation.
- [ ] Add migrations; never make production schema changes manually.
- [x] Use secure environment variables and never commit secrets.
- [ ] Commit logical milestones with descriptive messages after tests pass.

## Phase 0 — Discovery and architecture

- [x] Inspect repository, package manager, existing app, environment files, lint/typecheck/test scripts, and git status.
- [x] Write/refresh README with local setup, required environment variables, commands, and architecture summary.
- [x] Confirm Next.js + TypeScript strict mode baseline or scaffold it without overwriting unrelated work.
- [x] Install only required dependencies: Tailwind, shadcn/ui, Supabase clients, validation library, state/query tooling, testing tools, React Three Fiber/Three.js/Rapier, and i18n tooling.
- [x] Define module boundaries for player app, admin app, shared UI, game engine, ledger, database, and localization.
- [x] Create environment schema validation; include public Supabase URL/publishable key only and server-only variables separately.
- [x] Run lint, typecheck, tests, and production build; record baseline failures before proceeding.

## Phase 1 — Database and Supabase foundation

- [x] Create Supabase project configuration and typed client helpers for browser, server, and admin-safe server routes. (`supabase/config.toml`, `src/lib/supabase/*`, generated `types.gen.ts`)
- [x] Create migrations for profiles, verified contact fields, avatar metadata, user settings, status, and last-activity data.
- [x] Create migrations for admin roles, granular permissions, role assignments, admin PIN/2FA metadata, and approval limits.
- [x] Create immutable ledger, balance projection, credit request, credit request review, and daily reward/streak tables.
- [x] Create migrations for games, game versions/configurations, game release lifecycle, feature flags, rounds, bets, outcomes, and receipts.
- [x] Create migrations for announcements, notifications, tickets/messages/attachments, missions, achievements, leaderboard projections, friends/invites, and QA accounts.
- [x] Create migrations for audit log, system settings, asset metadata, maintenance state, and operational health events.
- [x] Add indexes, foreign keys, check constraints, enum/status constraints, timestamps, and soft-delete policy where appropriate.
- [x] Implement Row Level Security for every table and Storage bucket.
- [x] Add Storage policies for avatar, ticket attachment, and game asset buckets.
- [x] Generate database types and verify migration up/down or local reset succeeds. (`npm run db:validate`)
- [x] Write RLS tests proving player isolation and least-privilege administrator access. (`npm run db:test`)
- [ ] Remote staging integration (link / `db push` / seed): **WAITING** — needs `SUPABASE_ACCESS_TOKEN` + staging DB password; run only after approval. See [docs/database.md](docs/database.md).

> Note: server-authoritative game settlement (Phase 5) remains for a later phase.
> Migration RPCs cover ledger append, daily reward, credit review, and status changes;
> per-game round settlement is intentionally not implemented here.

## Phase 2 — Authentication and account lifecycle

- [ ] Build Welcome, registration, login, logout, password reset, and session-expiry flows.
- [ ] Support email and phone registration/login with OTP verification of at least one contact before play.
- [ ] Build nickname validation, preset avatar selection, safe avatar upload/crop/validation, and fallback avatar.
- [ ] Enforce one account per verified email/phone and explain conflicts clearly.
- [ ] Create verified-player welcome-credit ledger flow that runs exactly once.
- [ ] Build Profile/Settings page with language, sound volume/pack, graphics settings, and account controls.
- [ ] Add self-service account deletion request flow that preserves required ledger/audit records.
- [ ] Add player status enforcement for active, suspended, and banned accounts.
- [ ] Test login, OTP, reset, profile, avatar, suspension, and account deletion paths.

## Phase 3 — Design system, responsive shell, and localization

- [ ] Create GIKGOK brand tokens: deep green base, lime accent, rounded surfaces, typography, spacing, elevation, states, and chart/status colors.
- [ ] Implement Light and Dark mode preserving green brand identity.
- [ ] Implement Owner-controlled system accent theme (red/white, blue/white, yellow/gray); prevent player theme changes.
- [ ] Build responsive player shell: phone bottom navigation, tablet compact navigation, desktop layout.
- [ ] Build responsive admin shell with secure `/admin` route and desktop-first data layouts.
- [ ] Implement Lao and English translation catalogs for all user-facing text, validation, empty states, and admin UI.
- [ ] Structure localization so Thai can be added without refactoring.
- [ ] Build accessible shared components: buttons, inputs, dialogs, cards, tables, filters, toasts, loading/error states, and pagination.
- [ ] Implement reduced motion, keyboard navigation, touch targets, focus management, and contrast checks.
- [ ] Build sound manager with Classic Casino, Arcade, Silent, volume, preload/lazy-load strategy, and mute behavior.
- [ ] Validate layouts at phone, tablet, and desktop breakpoints in both languages and both modes.

## Phase 4 — Ledger, rewards, and credit requests

- [ ] Implement append-only ledger domain layer; prohibit direct client balance mutation.
- [ ] Implement atomic balance projection and ledger consistency checks.
- [ ] Implement daily check-in: 5,000 GIK, Day 3 +2,000, Day 7 +10,000, reset streak after missed day, block above 200,000 GIK.
- [ ] Move all reward values/limits into Owner-editable system configuration.
- [ ] Build player daily check-in UI with countdown, streak calendar, result receipt, and duplicate-click protection.
- [ ] Build player demo-credit request UI, validation, history, cancellation rules, and notification updates.
- [ ] Build admin credit-request review: approve/reject, gross GIK, per-request simulated fee, optional bonus, net GIK, required reason.
- [ ] Create separate ledger entries for grant, simulated fee, bonus, and adjustments.
- [ ] Implement configurable two-person approval threshold for large credit adjustments.
- [ ] Build player ledger/history view with filters and receipt details.
- [ ] Test concurrent reward/credit-request actions, idempotency, rejected actions, and ledger reconciliation.

## Phase 5 — Server-authoritative game engine

- [ ] Create central game-definition/configuration interface reusable by current and future games.
- [ ] Create shared bet validation, idempotency-key, atomic debit/settle, receipt, game-version, and audit services.
- [ ] Implement secure server/Edge Function settlement; browser must not calculate outcomes, credit, or payouts.
- [ ] Implement Random Mode default and explicit auditable Controlled Demo Mode selected before a round.
- [ ] Ensure controlled-demo state appears in admin records and player receipt; never silently alter locked normal rounds.
- [ ] Implement game availability, feature flags, limits, smooth maintenance closure, and release lifecycle.
- [ ] Add rate limiting and replay protection for every game endpoint.
- [ ] Write exhaustive unit tests for validation, settlement, negative balance prevention, duplicate requests, and config version retention.

## Phase 6 — Fish–Prawn–Crab

- [ ] Add versioned Fish–Prawn–Crab game configuration and Lao/English Guide.
- [ ] Implement server settlement for Single Symbol: one selection, at least one matching die, Total Return x2.
- [ ] Implement server settlement for Special Pair: two distinct symbols, both must occur, Total Return x10.
- [ ] Build 2D dice symbols, selection controls, stake input/quick stakes, locked state, result, receipt, and history representation.
- [ ] Build lazy-loaded optional 3D dice with physics-based visual reveal of the settled server result.
- [ ] Add Classic Casino/Arcade sound cues and reduce-motion fallback.
- [ ] Test all winning/losing combinations, invalid pair selections, insufficient balance, double submission, and refresh recovery.

## Phase 7 — High–Low Dice

- [ ] Add versioned High–Low configuration and bilingual Game Guide.
- [ ] Implement server settlement for Low 3–10 and High 11–18, Total Return x2.
- [ ] Implement triple override: any triple loses both High and Low.
- [ ] Build 2D UI, stake controls, locked state, dice/total/triple result explanation, receipt, and history representation.
- [ ] Build lazy-loaded 3D three-dice physics animation revealing settled result.
- [ ] Add sound, reduced-motion, graphics quality, and recovery behavior.
- [ ] Test all totals, all triples, selected side, payout, retries, and disconnected/reconnected flows.

## Phase 8 — Spinning Plate

- [ ] Add versioned 12-slot spinning-plate configuration and bilingual Game Guide.
- [ ] Configure initial slots/icons and returns: slots 1–4 x2, 5–7 x3, 8–9 x4, 10 x5, 11 x7, 12 x10.
- [ ] Implement server settlement: exactly one selected slot and exact-match-only win.
- [ ] Build 2D circular wheel with fixed pointer, selection states, multiplier labels, locked state, and selected/landed highlight.
- [ ] Build lazy-loaded 3D spinning plate using physics-inspired animation that lands on server-settled slot.
- [ ] Implement Graphics Auto/2D/3D setting, WebGL detection, low-FPS fallback, and quality controls.
- [ ] Add sound, reduced-motion, accessibility textual result, and receipt/history display.
- [ ] Test all 12 slots, multipliers, loss cases, retry/idempotency, fallback renderer, and refresh recovery.

## Phase 9 — Player experience and engagement

- [ ] Build Home: balance, daily reward, three game cards, announcements, activity, mission progress, leaderboard preview, achievement preview, support, and settings shortcuts.
- [ ] Build filterable full bet history with receipt details and random/controlled-demo state.
- [ ] Implement announcements with targeting, scheduling, read state, and safe dismissal.
- [ ] Build notifications for verification, rewards, credit requests, tickets, achievements, and announcements.
- [ ] Implement configurable optional Daily Missions that never require playing every game.
- [ ] Implement data-driven Achievement/Badge system and player collection view.
- [ ] Implement leaderboard with tabs for highest credit, cumulative winnings, and most wins; expose nickname/avatar only.
- [ ] Implement friends/invite privacy-safe flows, blocks/removal, and feature flag control.
- [ ] Build player Support Tickets, messages, attachment limits, statuses, and satisfaction feedback.
- [ ] Add responsible-play controls: session-break reminder, owner-configurable limits, voluntary temporary pause, and demo-credit notice.
- [ ] Test all player pages, empty/error states, notifications, language switching, and mobile accessibility.

## Phase 10 — Admin Console and real-time operations

- [ ] Secure `/admin` routing, session checks, admin PIN for sensitive actions, 2FA enforcement, and permission guards.
- [ ] Build Owner admin-management UI: create admins, assign roles, override granular permissions, disable accounts, and review assignments.
- [ ] Build admin dashboard with near-real-time operational presence, pending queues, game status, latest activity, and error/health summary.
- [ ] Build Players module with search, profile, status changes, activity view, safe suspension/ban, and player ledger access by permission.
- [ ] Build Credit Requests/Ledger module with approval workflow, adjustment limits, second approval, and receipts.
- [ ] Build Game Control module: random/controlled-demo pre-round setup, availability, limits, smooth maintenance close, and sound controls.
- [ ] Build Game Configuration module with versioned configs, wheel icons/payouts, rules presentation, and future-round-only changes.
- [ ] Build Game Release Workflow with Draft, QA, Owner Approved, Scheduled, Live, Disabled states; Owner-only final approval.
- [ ] Build Announcement, Ticket, Mission, Badge, Leaderboard, Feature Flag, Asset, and System Settings modules.
- [ ] Build QA/Demo Account tools isolated from ordinary player analytics and ledger reporting.
- [ ] Build audit log search/filter/export with actor, action, target, before/after, reason, approval chain, and timestamp.
- [ ] Build reports for players, games, credits, activity, support, and system operations; permission-check every export.
- [ ] Test every permission boundary, approval rule, audit event, maintenance transition, and concurrent admin action.

## Phase 11 — Security, performance, QA, and release

- [ ] Audit all RLS policies, API/Edge Function authorization, input schemas, rate limits, and secret exposure.
- [ ] Add secure headers, CSRF/origin protections where applicable, file validation, and dependency/security checks.
- [ ] Implement structured error logging, operational health events, and user-safe error boundaries.
- [ ] Add database backup/export procedure and documented recovery drill.
- [ ] Optimize assets: lazy-load 3D/physics/audio, cache static files, compress textures/audio, and set performance budgets.
- [ ] Verify 2D fallback on no-WebGL and lower-capability mobile environments.
- [ ] Run Vitest suites for ledger, rewards, permissions, every game rule, config versions, and concurrency/idempotency.
- [ ] Run Playwright end-to-end suites for register/verify, daily reward, request approval, three games, history, admin operations, and security boundaries.
- [ ] Perform manual QA on current iOS Safari, Android Chrome, tablet, and desktop browsers in Light/Dark modes and Lao/English.
- [ ] Add PWA manifest, icons, service worker strategy, offline-shell behavior, and install QA after responsive web passes.
- [ ] Configure staging deployment, production environment variables, migration release process, and rollback procedure.
- [ ] Run final lint, typecheck, tests, build, migration verification, security review, and deployment smoke tests.
- [ ] Update README/runbook with architecture, setup, deployment, backup/recovery, admin onboarding, and known limitations.
- [ ] Deliver final report: commits, changed files, validation commands/results, deployed URL, and remaining follow-ups.
