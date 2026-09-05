import { Pool, type PoolClient } from "pg";

/**
 * Local Supabase Postgres connection for RLS/database tests.
 * Uses the standard local dev connection string unless overridden.
 */
export const LOCAL_DB_URL =
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const PLAYER_A = "00000000-0000-0000-0000-0000000000a1";
export const PLAYER_B = "00000000-0000-0000-0000-0000000000b2";
export const ADMIN_CREDIT = "00000000-0000-0000-0000-0000000000c3";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: LOCAL_DB_URL, max: 4 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** True when the local database is reachable. */
export async function isDbReachable(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    await client.query("select 1");
    client.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `fn` inside a transaction impersonating the `authenticated` role with the
 * given JWT subject, then ROLLBACK. This is how Supabase evaluates RLS:
 * `auth.uid()` reads `request.jwt.claims.sub`.
 */
export async function asPlayer<T>(
  sub: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

/** Run `fn` as the privileged `postgres` role (bypasses RLS), then ROLLBACK. */
export async function asPostgres<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

/** Idempotently create the fixture users, an admin, and some ledger/notifications. */
export async function ensureFixtures(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    for (const [id, email, nickname] of [
      [PLAYER_A, "rls_player_a@example.test", "rls_player_a"],
      [PLAYER_B, "rls_player_b@example.test", "rls_player_b"],
      [ADMIN_CREDIT, "rls_admin_credit@example.test", "rls_admin_credit"],
    ] as const) {
      await client.query(
        `insert into auth.users (id, aud, role, email, encrypted_password,
           raw_user_meta_data, email_confirmed_at, created_at, updated_at)
         values ($1,'authenticated','authenticated',$2, crypt('demo-only', gen_salt('bf')),
           jsonb_build_object('nickname', $3::text), now(), now(), now())
         on conflict (id) do nothing`,
        [id, email, nickname],
      );
    }

    // Promote the admin and grant a couple of granular permissions (no owner).
    await client.query(
      `insert into public.admin_users (id, is_owner, is_active)
       values ($1, false, true)
       on conflict (id) do update set is_active = true`,
      [ADMIN_CREDIT],
    );
    await client.query(
      `insert into public.admin_user_permissions (admin_id, permission, granted)
       values ($1,'credits.view',true), ($1,'players.view',true)
       on conflict (admin_id, permission) do update set granted = excluded.granted`,
      [ADMIN_CREDIT],
    );

    // Give each player a welcome-credit ledger entry (balance via trigger).
    for (const id of [PLAYER_A, PLAYER_B]) {
      const existing = await client.query(
        `select 1 from public.gik_ledger where player_id = $1 and entry_type = 'welcome_credit'`,
        [id],
      );
      if (existing.rowCount === 0) {
        await client.query(
          `insert into public.gik_ledger
             (player_id, entry_type, amount, balance_after, source, reason)
           values ($1,'welcome_credit',50000,0,'seed','fixture')`,
          [id],
        );
      }
      await client.query(
        `insert into public.notifications (player_id, type, title, body)
         select $1,'system','fixture','hello'
         where not exists (
           select 1 from public.notifications where player_id = $1 and title = 'fixture')`,
        [id],
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
