# Phase 2 — Authentication notes

## Scope delivered

- Welcome / register / login / logout / forgot-password / reset-password / verify OTP pages
- Email or phone registration with OTP verification before play
- Nickname + preset avatar + JPG/PNG/WebP upload validation (max 2 MB)
- Verified email/phone uniqueness conflicts with clear messages
- `grant_welcome_credit` RPC grants 50,000 GIK exactly once after verification
- Profile/settings: language, sound pack/volume, graphics, account controls
- Soft deletion request preserves ledger + audit
- Middleware enforces session + active/verified status for player routes

## Validation

```bash
npm run lint
npm run typecheck
npm test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key \
npm run build
npm run db:validate
```


## Results (2026-09-04)

| Command | Result |
|---------|--------|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass (17 tests) |
| `npm run build` | pass (with public env placeholders) |
| `npm run db:validate` | pass (RLS + auth lifecycle RPCs) |
