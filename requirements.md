# GIKGOK — Product & Technical Requirements

## 1. Product scope

GIKGOK is a private, multi-account, mobile-first web game platform using **GIK demo credits only**. It supports Lao and English, responsive web experiences for phones, tablets, and desktop, and an Owner-controlled Admin Console.

### Non-negotiable exclusions

- No real-money deposits, payments, cash-out, transfers, wallets, QR payments, crypto, or monetary value.
- GIK credits cannot be bought, sold, transferred, redeemed, or exchanged for money.
- Server-side rules and settlement are authoritative; browser code never determines balances or outcomes.

## 2. Users and access

### Player

- Self-register with email or phone number, password, nickname, and avatar.
- Verify at least one registered email/phone via OTP before playing.
- One account per verified email/phone.
- Browse Welcome and Game Guide without authentication; login is required to play.
- Profile supports nickname, preset avatar or uploaded JPG/PNG/WebP avatar (max 2 MB), sound, language, and graphics settings.

### Administrative roles

Owner has all permissions, creates administrators, assigns granular permissions, selects one system-wide theme, approves game releases, and reviews all audit records.

Required permission groups: `players.view`, `players.suspend`, `credits.view`, `credits.adjust`, `games.view`, `games.control`, `games.configure`, `announcements.manage`, `tickets.manage`, `reports.view`, `reports.export`, `admins.manage`, `audit.view`, and `system.settings`.

Suggested roles: Owner, Super Admin, Game Manager, Player Manager, Credit Manager, Support Viewer, and Report Viewer. Roles are presets; permissions remain individually editable by Owner.

Admins use a separate `/admin` area. Require a separate admin PIN for high-impact actions. Owner must use 2FA; Owner configures 2FA requirements for other admins.

## 3. Credits, ledger, and requests

### GIK demo credit rules

- New verified players receive 50,000 GIK.
- Daily check-in: 5,000 GIK once per day.
- Streak bonuses: Day 3 +2,000 GIK; Day 7 +10,000 GIK; a missed day resets the streak only.
- Daily rewards are unavailable when current credit is above 200,000 GIK.
- Owner may change or disable every default and every threshold.
- Credits never expire.

### Demo-credit request

- Player may submit a request for GIK credits.
- Request lifecycle: `pending`, `approved`, `rejected`, `cancelled`.
- A permitted admin reviews it and may set gross GIK, a per-request simulation fee percentage or amount, bonus, net GIK, and a required reason.
- Example only: gross 100,000 GIK, simulation fee 2%, net 98,000 GIK. This is a simulated ledger entry—not a payment.
- Large adjustments must support a configurable approval threshold and second approver.

### Ledger requirements

Balance is derived from immutable ledger entries; do not directly edit a player balance. Required types include `welcome_credit`, `daily_reward`, `mission_reward`, `achievement_reward`, `demo_credit_grant`, `simulation_fee`, `bet_debit`, `game_payout`, `admin_adjustment`, and `reset_demo_data`.

Every entry includes an ID, player, amount, balance after settlement, source/reference ID, actor, timestamp, reason where relevant, and immutable audit metadata.

## 4. Games and common betting rules

All games have a Game Guide, clear current balance, manual whole-number stake input, quick stakes 500/1,000/5,000/10,000 GIK, explicit “Total Return” wording, sound effects, history receipt, and a Back action.

Validation: stake is a positive integer, does not exceed settled balance, has all required selections, and is accepted exactly once through an idempotency key. On confirmation the stake is debited, selections lock permanently, the result is settled once, winnings are credited, and a receipt/history record is created.

### Fish–Prawn–Crab

- Three dice use Fish, Prawn, Crab, Gourd, Rooster, and Deer symbols.
- Single Symbol: choose exactly one. If it occurs on at least one die, Total Return is x2; otherwise x0.
- Special Pair: choose exactly two different symbols. Both must occur across the three dice for Total Return x10; otherwise x0.
- Use a natural 2D and optional 3D dice reveal.

### High–Low Dice

- Roll three six-sided dice.
- Total 3–10 is Low; total 11–18 is High.
- Any triple makes High and Low both lose regardless of total.
- Player chooses exactly High or Low. Correct non-triple prediction gives Total Return x2; otherwise x0.

### Spinning Plate

- Exactly twelve selectable slots and a fixed top pointer.
- Player selects one slot; only landing exactly on it wins.
- Slot config: 1–4 x2; 5–7 x3; 8–9 x4; 10 x5; 11 x7; 12 x10.
- Initial icons: Clover, Diamond, Heart, Spade, Bell, Cherry, Lucky Clover, Star, Lucky 7, Crown, Diamond King, Jackpot.
- Highlight selected and landed slot after settlement.

## 5. Fairness and game operations

- Production result, validation, debit, payout, and receipt generation happen in one server-side transactional flow.
- Random Mode is default.
- Controlled Demo Mode is separately visible in Admin records and player receipts. It must be chosen before the round begins, never silently alter a locked normal round, and must be auditable.
- Admin game controls apply to subsequent rounds only: enable/disable, scheduled launch, smooth maintenance close, configuration presets, limits, and sound pack.
- A smooth close stops new bets, settles already locked bets, then shows a maintenance announcement.
- Store a game configuration version with every bet. Config changes never alter historical bets.
- Game lifecycle: `draft → qa → owner_approved → scheduled → live → disabled`.

## 6. Player product

Pages: Welcome/Register/Login, Home, three Game pages, Game Guide, History, Profile/Settings, Notifications, Leaderboard, Daily Mission, Achievements, Friends/Invite, and Support Tickets.

Home includes balance, daily check-in, three game cards, announcement, activity summary, mission progress, top-three leaderboard preview, recent achievement, support shortcut, and settings/sound shortcut.

History filters All/Wins/Losses and shows game, timestamp, bet ID, selection, stake, outcome, Total Return, balance after settlement, game version, and random/controlled-demo receipt state.

Leaderboard includes three tabs: highest current credit, highest cumulative winnings, and most wins. Show nickname and avatar only.

Daily Missions are optional, never force a player to use every game, and may include single-game or any-game goals. Owner can configure or disable them. Achievements are data-driven.

Support tickets support category, text, up to three image attachments, threaded messages, ownership, and statuses `open`, `in_progress`, `waiting_for_player`, `resolved`, `closed`, plus post-close satisfaction feedback.

## 7. Design system and accessibility

- Brand base: deep casino green with lime-green accent, informed by the supplied reference’s clean rounded cards and high-contrast balance area.
- Support Light and Dark mode while preserving green brand identity.
- Owner chooses one system-wide accent theme; players cannot change it. Available accents: red/white, blue/white, yellow/gray.
- Mobile-first: bottom navigation on phone, compact navigation on tablet, sidebar/admin data layouts on desktop.
- Lao and English localization must cover every visible UI state; architecture must permit Thai later.
- Graphics setting: Auto (default), 2D, or 3D. Auto selects 3D when supported and safely falls back to 2D on unsupported/slow devices.
- Quality settings: low/medium/high, FPS cap, shadows/effects, reduce-motion support.
- Sound packs: Classic Casino, Arcade, Silent; players set own volume while Owner may enable/disable available packs.
- Meet keyboard, screen-reader, contrast, touch-target, loading, error, and reduced-motion accessibility requirements.

## 8. 2D/3D presentation platform

Separate game rules from visuals. Use 2D Canvas/SVG/CSS as a lightweight renderer and Three.js/React Three Fiber with Rapier physics for optional 3D dice and spinning plate. Physics/animation only reveal an already-authoritative server result; they never calculate the outcome.

Use lazy-loaded game assets, performance budgets, error fallback to 2D, and rights-cleared/self-created models, textures, icons, and sound assets only. New games plug into a central definition containing rules, bet options, renderer, sound pack, guide, config, and admin permissions.

## 9. Admin Console

Admin modules: Dashboard, Players, Credit Requests/Ledger, Game Control, Game Configuration, Game Release Workflow, Announcements, Tickets, Missions/Badges, Leaderboard controls, Admins/Roles, Reports, Audit Log, Feature Flags, Assets, System Settings, and QA/Demo Accounts.

Dashboard must show online/active players near real-time, latest activity, current game/page state at a necessary operational level, pending credit requests/tickets/approvals, game status, and health/error summary. Do not expose player screens or unnecessary surveillance data.

Audit log is append-only and filterable by actor, target, type, date, and result. Record before/after values, reason, approval chain, and request metadata for privileged actions.

## 10. Security, quality, deployment

- Next.js + TypeScript strict mode; Tailwind CSS; shadcn/ui; Lucide icons.
- Supabase Auth, Postgres, Storage, Realtime, Edge Functions, CLI migrations, and Row Level Security.
- No service-role key in frontend or repository.
- Rate limit login, OTP, bet, daily reward, support, and credit requests.
- RLS tests prove players can access only their data and administrators only granted capabilities.
- Use server transaction/RPC or Edge Function atomic settlement and idempotency protection.
- Test rules/ledger with Vitest; critical player and admin journeys with Playwright.
- Use environment validation, structured logs, monitoring, backups/export, recovery documentation, and secure headers.
- Build responsive web first, then PWA installability and device QA for iOS/Android.
- Deploy only after staging/QA acceptance. Keep secrets only in platform environment configuration.

## 11. Acceptance criteria

The first release is complete only when all three games, player auth/verification, ledger, credit requests, admin permissions, required admin modules, Lao/English, system theme, light/dark modes, 2D/3D fallback, sound, history/receipts, required engagement features, RLS/security tests, responsive QA, and deployment/runbook have passed documented checks.
