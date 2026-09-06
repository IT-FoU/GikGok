import { Pool, type PoolClient } from "pg";

/**
 * Postgres connection for RLS/database tests.
 * Prefers SUPABASE_DB_URL / DATABASE_URL; otherwise builds a staging pooler
 * URL when SUPABASE_DB_PASSWORD is present; else local Supabase.
 */
function resolveDbUrl(): string {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.SUPABASE_DB_PASSWORD) {
    const ref = process.env.SUPABASE_PROJECT_REF ?? "jlpcfatcpymjnjbxmclo";
    const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
    return `postgresql://postgres.${ref}:${pw}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

export const LOCAL_DB_URL = resolveDbUrl();

export const PLAYER_A = "00000000-0000-0000-0000-0000000000a1";
export const PLAYER_B = "00000000-0000-0000-0000-0000000000b2";
export const ADMIN_CREDIT = "00000000-0000-0000-0000-0000000000c3";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: LOCAL_DB_URL,
      max: 4,
      ssl: LOCAL_DB_URL.includes("supabase.com")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** True when the database is reachable. */
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
 * Run `fn` inside a transaction impersonating `authenticated` with the given
 * JWT subject, then ROLLBACK.
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

/** Run `fn` as privileged postgres (bypasses RLS), then ROLLBACK. */
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

/** Idempotently create fixture users, admin, verified contacts, and seed ledger. */
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

      await client.query(
        `insert into public.profiles (id, nickname, status)
         values ($1, $2, 'active'::public.player_status)
         on conflict (id) do update
         set nickname = excluded.nickname,
             status = 'active'::public.player_status`,
        [id, nickname],
      );
    }

    await client.query(
      `insert into public.admin_users (id, is_owner, is_active, requires_2fa, requires_pin)
       values ($1, false, true, false, false)
       on conflict (id) do update set is_active = true`,
      [ADMIN_CREDIT],
    );

    try {
      await client.query(
        `insert into public.admin_user_permissions (admin_id, permission, granted)
         values ($1,'credits.view',true), ($1,'players.view',true)
         on conflict (admin_id, permission) do update set granted = excluded.granted`,
        [ADMIN_CREDIT],
      );
    } catch {
      // optional on some schema revisions
    }

    for (const id of [PLAYER_A, PLAYER_B]) {
      const existing = await client.query(
        `select 1 from public.gik_ledger where player_id = $1 and entry_type = 'welcome_credit' limit 1`,
        [id],
      );
      if ((existing.rowCount ?? 0) === 0) {
        await client.query(
          `select public.append_ledger_entry(
             $1,
             'welcome_credit'::public.ledger_entry_type,
             50000,
             'seed',
             null,
             $1,
             'fixture welcome credit',
             '{}'::jsonb
           )`,
          [id],
        );
      }

      const email =
        id === PLAYER_A ? "rls_player_a@example.test" : "rls_player_b@example.test";
      await client.query(
        `insert into public.player_contacts
           (player_id, contact_type, value, is_primary, is_verified, verified_at)
         select $1, 'email'::public.contact_type, $2, true, true, now()
         where not exists (
           select 1 from public.player_contacts where player_id = $1 and is_primary
         )`,
        [id, email],
      );
      await client.query(
        `update public.player_contacts
         set is_verified = true, verified_at = coalesce(verified_at, now()), value = $2
         where player_id = $1 and is_primary`,
        [id, email],
      );

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
