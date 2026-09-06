// @vitest-environment node
import {
  ADMIN_CREDIT,
  PLAYER_A,
  PLAYER_B,
  asPlayer,
  asPostgres,
  closePool,
  ensureFixtures,
  isDbReachable,
} from "./helpers";

const dbUp = await isDbReachable();

/**
 * These tests prove Row Level Security isolation against a real local Supabase
 * Postgres. They require `supabase start` (see `npm run db:validate`).
 */
describe.runIf(dbUp)("RLS isolation", () => {
  beforeAll(async () => {
    await ensureFixtures();
  });
  afterAll(async () => {
    await closePool();
  });

  it("player sees only their own profile", async () => {
    const rows = await asPlayer(PLAYER_A, async (c) => {
      const r = await c.query("select id from public.profiles");
      return r.rows;
    });
    expect(rows).toEqual([{ id: PLAYER_A }]);
  });

  it("player cannot read another player's ledger", async () => {
    const { own, others } = await asPlayer(PLAYER_A, async (c) => {
      const mine = await c.query(
        "select count(*)::int as n from public.gik_ledger where player_id = $1",
        [PLAYER_A],
      );
      const theirs = await c.query(
        "select count(*)::int as n from public.gik_ledger where player_id = $1",
        [PLAYER_B],
      );
      return { own: mine.rows[0].n, others: theirs.rows[0].n };
    });
    expect(own).toBeGreaterThan(0);
    expect(others).toBe(0);
  });

  it("player cannot read another player's notifications", async () => {
    const n = await asPlayer(PLAYER_A, async (c) => {
      const r = await c.query(
        "select count(*)::int as n from public.notifications where player_id = $1",
        [PLAYER_B],
      );
      return r.rows[0].n;
    });
    expect(n).toBe(0);
  });

  it("admin with credits.view can read all ledgers", async () => {
    const seesB = await asPlayer(ADMIN_CREDIT, async (c) => {
      const r = await c.query(
        "select count(*)::int as n from public.gik_ledger where player_id = $1",
        [PLAYER_B],
      );
      return r.rows[0].n;
    });
    expect(seesB).toBeGreaterThan(0);
  });

  it("has_permission reflects granular permissions", async () => {
    const asPlayerPerm = await asPlayer(PLAYER_A, async (c) => {
      const r = await c.query("select public.has_permission('credits.view') as ok");
      return r.rows[0].ok;
    });
    const asAdminPerm = await asPlayer(ADMIN_CREDIT, async (c) => {
      const r = await c.query("select public.has_permission('credits.view') as ok");
      return r.rows[0].ok;
    });
    const adminLacks = await asPlayer(ADMIN_CREDIT, async (c) => {
      const r = await c.query("select public.has_permission('system.settings') as ok");
      return r.rows[0].ok;
    });
    expect(asPlayerPerm).toBe(false);
    expect(asAdminPerm).toBe(true);
    expect(adminLacks).toBe(false);
  });

  it("player cannot INSERT into the ledger", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `insert into public.gik_ledger (player_id, entry_type, amount, balance_after)
           values ($1,'admin_adjustment',999999,0)`,
          [PLAYER_A],
        );
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("player cannot read admin_security", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query("select * from public.admin_security");
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("ledger rows are immutable (UPDATE/DELETE blocked even for postgres)", async () => {
    await expect(
      asPostgres(async (c) => {
        await c.query(
          "update public.gik_ledger set amount = amount + 1 where player_id = $1",
          [PLAYER_A],
        );
      }),
    ).rejects.toThrow(/immutable/i);

    await expect(
      asPostgres(async (c) => {
        await c.query("delete from public.gik_ledger where player_id = $1", [PLAYER_A]);
      }),
    ).rejects.toThrow(/immutable/i);
  });

  it("daily reward RPC credits once per day and blocks a second claim", async () => {
    await asPlayer(PLAYER_B, async (c) => {
      const first = await c.query("select public.claim_daily_reward() as r");
      expect(first.rows[0].r.total_amount).toBeGreaterThan(0);
      await expect(
        c.query("select public.claim_daily_reward()"),
      ).rejects.toThrow(/already claimed/i);
    });
  });
});

describe.skipIf(dbUp)("RLS isolation (skipped: local DB unreachable)", () => {
  it("requires `supabase start`", () => {
    expect(dbUp).toBe(false);
  });
});
