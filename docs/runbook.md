# Runbook — GIKGOK operations

## Demo credits only

GIK has **no cash value**. Never add deposits, withdrawals, wallets, or payment processors.

## Admin onboarding

1. Create the Auth user in Supabase.
2. As Owner, open `/admin/admins` and create the admin profile + role.
3. Ask the admin to set PIN (and optional demo 2FA) under `/admin/settings`.
4. Confirm permissions via dashboard access; review `audit_log`.

## Backup

```bash
npm run db:backup
# or
bash scripts/db-backup.sh
```

Outputs gzipped SQL under `backups/` (keeps last 14).

### Recovery drill (document results)

1. Take a fresh backup.
2. Restore into a scratch database:
   ```bash
   createdb gikgok_restore
   gunzip -c backups/gikgok-YYYYMMDD….sql.gz | psql postgresql://…/gikgok_restore
   ```
3. Run `npm run db:validate` against a clean instance to prove migrations still apply.
4. Spot-check: profiles, ledger balances reconcile, one game round, one credit request.
5. Record operator, timestamp, and outcome in the incident/ops log.

## Incident basics

- Rotate compromised anon keys and revoke sessions.
- Disable games via `/admin/games` or lifecycle → `disabled`.
- Enable platform maintenance from `/admin/settings`.
- Export audit via `/admin/reports` (`activity` / `system`).
