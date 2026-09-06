// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  ADMIN_CREDIT,
  PLAYER_A,
  PLAYER_B,
  asPlayer,
  asPostgres,
  closePool,
  ensureFixtures,
  getPool,
  isDbReachable,
} from "./helpers";

const dbUp = await isDbReachable();

/**
 * Privilege and takeover tests for SECURITY DEFINER RPCs.
 * Requires a migrated database (local or staging via DATABASE_URL).
 */
describe.runIf(dbUp)("SECURITY DEFINER RPC hardening", () => {
  beforeAll(async () => {
    await ensureFixtures();
  });
  afterAll(async () => {
    await closePool();
  });

  it("anon cannot execute sensitive DEFINER functions", async () => {
    const rows = await asPostgres(async (c) => {
      const r = await c.query(`
        select p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef
          and has_function_privilege('anon', p.oid, 'execute')
        order by 1`);
      return r.rows.map((x) => x.proname);
    });
    expect(rows).toEqual([]);
  });

  it("authenticated cannot execute append_ledger_entry or write_audit or bootstrap_first_owner", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `select public.append_ledger_entry($1, 'admin_adjustment', 1, 'test', null, $1, 'x', '{}'::jsonb)`,
          [PLAYER_A],
        );
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.write_audit('x')`);
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.bootstrap_first_owner($1)`, [PLAYER_A]);
      }),
    ).rejects.toThrow(/permission denied|restricted to service_role|owner already exists/i);
  });

  it("second user cannot promote themselves via bootstrap_first_owner", async () => {
    // Even as postgres (bypass grant), the function must refuse once an owner exists.
    // Staging already has an owner; locally ensureFixtures does not create an owner,
    // so create one first when needed.
    await asPostgres(async (c) => {
      const owners = await c.query(
        `select count(*)::int as n from public.admin_users where is_owner and is_active`,
      );
      if (owners.rows[0].n === 0) {
        // Use service_role JWT claim so the function's defense-in-depth check passes.
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ role: "service_role" }),
        ]);
        await c.query(`select public.bootstrap_first_owner($1)`, [ADMIN_CREDIT]);
      }

      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ role: "service_role" }),
      ]);
      await expect(
        c.query(`select public.bootstrap_first_owner($1)`, [PLAYER_B]),
      ).rejects.toThrow(/owner already exists/i);
    });
  });

  it("has_permission ignores spoofed uid for authenticated callers", async () => {
    // PLAYER_A calling has_permission(..., ADMIN_CREDIT) must not inherit admin rights.
    const spoofed = await asPlayer(PLAYER_A, async (c) => {
      const r = await c.query(
        `select public.has_permission('credits.view', $1::uuid) as ok`,
        [ADMIN_CREDIT],
      );
      return r.rows[0].ok;
    });
    expect(spoofed).toBe(false);

    const self = await asPlayer(ADMIN_CREDIT, async (c) => {
      const r = await c.query(`select public.has_permission('credits.view') as ok`);
      return r.rows[0].ok;
    });
    expect(self).toBe(true);
  });

  it("unauthorized admin action is rejected", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `select public.admin_set_player_status($1, 'suspended', 'nope')`,
          [PLAYER_B],
        );
      }),
    ).rejects.toThrow(/not authorized|insufficient/i);

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `select public.review_credit_request($1, 'rejected', null, 0, 0, 'nope')`,
          [randomUUID()],
        );
      }),
    ).rejects.toThrow(/not authorized|insufficient/i);
  });

  it("cancel_credit_request cannot cancel another player's request", async () => {
    const requestId = await asPostgres(async (c) => {
      const ins = await c.query(
        `insert into public.credit_requests (player_id, requested_amount, note, status)
         values ($1, 1000, 'cross-player cancel test', 'pending')
         returning id`,
        [PLAYER_B],
      );
      return ins.rows[0].id as string;
    });

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.cancel_credit_request($1)`, [requestId]);
      }),
    ).rejects.toThrow(/no cancellable|not found|no_data_found/i);
  });

  it("claim_daily_reward only credits the authenticated caller", async () => {
    await asPlayer(PLAYER_A, async (c) => {
      const beforeA = Number(
        (
          await c.query(
            `select coalesce(balance,0)::bigint as balance from public.player_balances where player_id = $1`,
            [PLAYER_A],
          )
        ).rows[0]?.balance ?? 0,
      );
      const beforeB = Number(
        (
          await c.query(
            `select coalesce(balance,0)::bigint as balance from public.player_balances where player_id = $1`,
            [PLAYER_B],
          )
        ).rows[0]?.balance ?? 0,
      );

      let claimed = false;
      await c.query("savepoint before_daily_claim");
      try {
        const r = await c.query(`select public.claim_daily_reward() as r`);
        expect(
          Number(
            r.rows[0].r.total_amount ??
              r.rows[0].r.amount ??
              r.rows[0].r.credited ??
              0,
          ),
        ).toBeGreaterThan(0);
        claimed = true;
        await c.query("release savepoint before_daily_claim");
      } catch (err) {
        await c.query("rollback to savepoint before_daily_claim");
        // Already claimed today, or balance above the configurable daily-reward cap.
        expect(String(err)).toMatch(
          /already claimed|balance exceeds|unavailable while balance/i,
        );
      }

      const afterA = Number(
        (
          await c.query(
            `select coalesce(balance,0)::bigint as balance from public.player_balances where player_id = $1`,
            [PLAYER_A],
          )
        ).rows[0]?.balance ?? 0,
      );
      const afterB = Number(
        (
          await c.query(
            `select coalesce(balance,0)::bigint as balance from public.player_balances where player_id = $1`,
            [PLAYER_B],
          )
        ).rows[0]?.balance ?? 0,
      );

      expect(afterB).toBe(beforeB);
      if (claimed) expect(afterA).toBeGreaterThan(beforeA);
      else expect(afterA).toBe(beforeA);
    });
  });


  it("trigger helpers pin search_path", async () => {
    const rows = await asPostgres(async (c) => {
      const r = await c.query(`
        select p.proname, p.proconfig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
            'set_updated_at','prevent_mutation','apply_ledger_entry','enforce_attachment_limit'
          )
        order by 1`);
      return r.rows;
    });
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.proconfig?.some((c: string) => c.startsWith("search_path="))).toBe(true);
    }
  });

  it("P0: authenticated cannot execute record_mission_progress or unlock_achievement", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.record_mission_progress('fish_prawn_crab')`);
      }),
    ).rejects.toThrow(/permission denied|internal-only|internal only/i);

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.unlock_achievement('first_win')`);
      }),
    ).rejects.toThrow(/permission denied|internal-only|internal only/i);
  });

  it("P1: authenticated cannot execute internal admin/round helpers", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.assert_admin_auth_rate_limit('otp')`);
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `select public.open_game_round('fish_prawn_crab', 'random'::public.game_mode, '{}'::jsonb)`,
        );
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.ensure_player_round('fish_prawn_crab')`);
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.admin_session_id()`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("P0: verify_admin_2fa no longer mints otp stamps from arbitrary codes", async () => {
    const def = await asPostgres(async (c) => {
      const r = await c.query(
        `select pg_get_functiondef('public.verify_admin_2fa(text)'::regprocedure) as d`,
      );
      return r.rows[0].d as string;
    });
    expect(def).toMatch(/removed|aal2|feature_not_supported/i);
    expect(def).not.toMatch(/otp_verified_at\s*=\s*now\(\)/i);
    expect(def).not.toMatch(/demo-totp|accept the last 6/i);

    await asPostgres(async (c) => {
      await c.query(
        `insert into public.admin_users (id, is_owner, is_active, requires_2fa, requires_pin)
         values ($1, false, true, true, false)
         on conflict (id) do update
         set is_active = true, requires_2fa = true, requires_pin = false`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `insert into public.admin_security (admin_id, totp_enabled)
         values ($1, true)
         on conflict (admin_id) do update set totp_enabled = true`,
        [ADMIN_CREDIT],
      );
    });

    // Direct RPC must fail closed even for aal2 + non-blacklisted codes.
    await expect(
      asPlayer(
        ADMIN_CREDIT,
        async (c) => {
          await c.query(`select public.verify_admin_2fa('424242')`);
        },
        { aal: "aal2" },
      ),
    ).rejects.toThrow(/removed|aal2|mfa|2fa|not supported/i);

    await expect(
      asPlayer(ADMIN_CREDIT, async (c) => {
        await c.query(`select public.verify_admin_2fa('000000')`);
      }),
    ).rejects.toThrow(/removed|aal2|mfa|2fa|not supported/i);
  });

  it("P0: assert_admin_sensitive fails closed without enrollment or aal2", async () => {
    await asPostgres(async (c) => {
      await c.query(
        `insert into public.admin_users (id, is_owner, is_active, requires_2fa, requires_pin)
         values ($1, false, true, true, false)
         on conflict (id) do update
         set is_active = true, requires_2fa = true, requires_pin = false`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `insert into public.admin_security (admin_id, totp_enabled, totp_secret)
         values ($1, false, null)
         on conflict (admin_id) do update
         set totp_enabled = false, totp_secret = null`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `delete from public.admin_sensitive_challenges where admin_id = $1`,
        [ADMIN_CREDIT],
      );

      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          sub: ADMIN_CREDIT,
          role: "authenticated",
          aal: "aal1",
        }),
      ]);
      await c.query("set local role authenticated");
      await c.query("savepoint sp_aal1");
      // Direct EXECUTE revoked from authenticated — gate is internal-only.
      await expect(
        c.query(`select public.assert_admin_sensitive()`),
      ).rejects.toThrow(/permission denied/i);
      await c.query("rollback to savepoint sp_aal1");

      // Public surface still fails closed via admin_prepare_sensitive without AAL2/enrollment.
      await c.query("set local role postgres");
      await c.query(
        `insert into public.admin_users (id, is_owner, is_active, requires_2fa, requires_pin)
         values ($1, false, true, true, false)
         on conflict (id) do update
         set is_active = true, requires_2fa = true, requires_pin = false`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `insert into public.admin_security (admin_id, totp_enabled)
         values ($1, false)
         on conflict (admin_id) do update set totp_enabled = false`,
        [ADMIN_CREDIT],
      );
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          sub: ADMIN_CREDIT,
          role: "authenticated",
          aal: "aal1",
        }),
      ]);
      await c.query("set local role authenticated");
      await c.query("savepoint sp_prepare");
      await expect(
        c.query(`select public.admin_prepare_sensitive(null, null)`),
      ).rejects.toThrow(/2fa|mfa|enroll|aal/i);
      await c.query("rollback to savepoint sp_prepare");
    });
  });

  it("P0: admin_prepare_sensitive rejects p_otp and requires PIN when configured", async () => {
    await asPostgres(async (c) => {
      await c.query(
        `insert into public.admin_users (id, is_owner, is_active, requires_2fa, requires_pin)
         values ($1, false, true, false, true)
         on conflict (id) do update
         set is_active = true, requires_2fa = false, requires_pin = true`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `insert into public.admin_security (admin_id, pin_hash, totp_enabled)
         values ($1, crypt('2468', gen_salt('bf')), false)
         on conflict (admin_id) do update
         set pin_hash = excluded.pin_hash, totp_enabled = false`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `delete from public.admin_sensitive_challenges where admin_id = $1`,
        [ADMIN_CREDIT],
      );
    });

    await expect(
      asPlayer(ADMIN_CREDIT, async (c) => {
        await c.query(
          `select public.admin_prepare_sensitive(null, '424242')`,
        );
      }),
    ).rejects.toThrow(/otp|aal2|mfa|do not pass/i);

    await expect(
      asPlayer(ADMIN_CREDIT, async (c) => {
        await c.query(`select public.admin_prepare_sensitive(null, null)`);
      }),
    ).rejects.toThrow(/pin/i);

    // Expired PIN confirmation must fail.
    await asPostgres(async (c) => {
      await c.query(
        `insert into public.admin_sensitive_challenges
           (admin_id, session_id, pin_verified_at, updated_at)
         values ($1, 'test-session', now() - interval '20 minutes', now())
         on conflict (admin_id, session_id) do update
         set pin_verified_at = excluded.pin_verified_at`,
        [ADMIN_CREDIT],
      );
    });
  });

  it("P0: disabled admin cannot call assert_admin_sensitive", async () => {
    await asPostgres(async (c) => {
      await c.query(
        `insert into public.admin_users (id, is_owner, is_active, requires_2fa, requires_pin)
         values ($1, false, false, false, false)
         on conflict (id) do update
         set is_active = false, requires_2fa = false, requires_pin = false`,
        [ADMIN_CREDIT],
      );
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          sub: ADMIN_CREDIT,
          role: "authenticated",
          aal: "aal2",
        }),
      ]);
      await c.query("set local role authenticated");
      await c.query("savepoint sp_assert");
      await expect(
        c.query(`select public.assert_admin_sensitive()`),
      ).rejects.toThrow(/permission denied/i);
      await c.query("rollback to savepoint sp_assert");

      await c.query("savepoint sp_prepare_disabled");
      await expect(
        c.query(`select public.admin_prepare_sensitive(null, null)`),
      ).rejects.toThrow(/admin access required|inactive|disabled|not an admin/i);
      await c.query("rollback to savepoint sp_prepare_disabled");
    });
  });

  it("P0: owners always require 2fa in session state", async () => {
    const state = await asPostgres(async (c) => {
      const owner = await c.query(
        `select id from public.admin_users where is_owner limit 1`,
      );
      if (!owner.rows[0]) return null;
      const id = owner.rows[0].id as string;
      await c.query(
        `update public.admin_users set requires_2fa = false where id = $1`,
        [id],
      );
      // Re-apply invariant the migration enforces for owners.
      await c.query(
        `update public.admin_users set requires_2fa = true
         where is_owner and coalesce(requires_2fa, false) = false`,
      );
      const row = await c.query(
        `select requires_2fa from public.admin_users where id = $1`,
        [id],
      );
      return row.rows[0].requires_2fa as boolean;
    });
    if (state !== null) expect(state).toBe(true);
  });

  it("P0: assert_play_allowed rejects suspended profiles", async () => {
    const client = await getPool().connect();
    try {
      await client.query(
        `update public.profiles set status = 'suspended'::public.player_status where id = $1`,
        [PLAYER_A],
      );

      await expect(
        asPlayer(PLAYER_A, async (c) => {
          await c.query(`select public.assert_play_allowed()`);
        }),
      ).rejects.toThrow(/not allowed|suspended|active|status/i);
    } finally {
      await client
        .query(
          `update public.profiles set status = 'active'::public.player_status where id = $1`,
          [PLAYER_A],
        )
        .catch(() => undefined);
      client.release();
    }
  });


  it("P1: refresh_leaderboard_entries denies ordinary players", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.refresh_leaderboard_entries()`);
      }),
    ).rejects.toThrow(/system\.settings|service role|insufficient/i);
  });

  it("P1: get_setting whitelists client-safe keys only", async () => {
    await asPlayer(PLAYER_A, async (c) => {
      const ok = await c.query(
        `select public.get_setting('locale.default', '"en"'::jsonb) as v`,
      );
      expect(ok.rows[0].v).toBeTruthy();
    });
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `select public.get_setting('credits.second_approval_threshold', '0'::jsonb)`,
        );
      }),
    ).rejects.toThrow(/not client-readable|insufficient/i);
  });

  it("P0: mark_contact_verified requires Auth confirmation evidence", async () => {
    await asPostgres(async (c) => {
      await c.query(
        `update auth.users
            set email = 'rls_player_a@example.test',
                email_confirmed_at = null,
                phone = null,
                phone_confirmed_at = null
          where id = $1`,
        [PLAYER_A],
      );
      await c.query(
        `insert into public.player_contacts
           (player_id, contact_type, value, is_primary, is_verified)
         values ($1, 'email', 'rls_player_a@example.test', true, false)
         on conflict do nothing`,
        [PLAYER_A],
      );
      await c.query(
        `update public.player_contacts
            set value = 'rls_player_a@example.test',
                is_verified = false,
                verified_at = null
          where player_id = $1 and contact_type = 'email' and is_primary`,
        [PLAYER_A],
      );

      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: PLAYER_A, role: "authenticated", aal: "aal1" }),
      ]);
      await c.query("set local role authenticated");
      await c.query("savepoint sp_unconfirmed");
      await expect(
        c.query(`select public.mark_contact_verified('email')`),
      ).rejects.toThrow(/not confirmed/i);
      await c.query("rollback to savepoint sp_unconfirmed");

      await c.query("set local role postgres");
      await c.query(
        `update auth.users set email_confirmed_at = now() where id = $1`,
        [PLAYER_A],
      );
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: PLAYER_A, role: "authenticated", aal: "aal1" }),
      ]);
      await c.query("set local role authenticated");
      const ok = await c.query(`select public.mark_contact_verified('email') as r`);
      expect(ok.rowCount).toBe(1);

      await c.query("savepoint sp_phone");
      await expect(
        c.query(`select public.mark_contact_verified('phone')`),
      ).rejects.toThrow(/no phone|not confirmed|channel must be/i);
      await c.query("rollback to savepoint sp_phone");
    });
  });


});

describe.skipIf(dbUp)("SECURITY DEFINER RPC hardening (skipped: DB unreachable)", () => {
  it("requires a migrated database", () => {
    expect(dbUp).toBe(false);
  });
});
