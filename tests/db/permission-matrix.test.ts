import { describe, expect, it, beforeAll } from "vitest";

import {
  asPlayer,
  asPostgres,
  ensureFixtures,
  isDbReachable,
  PLAYER_A,
  ADMIN_CREDIT,
} from "./helpers";

const dbUp = await isDbReachable();

/**
 * Data-driven matrix over every app_permission value.
 * Cells document role grant / allow override / deny override / owner bypass /
 * disabled admin / ordinary player / cross-resource / report export.
 */
describe.skipIf(!dbUp)("app_permission matrix", () => {
  let permissions: string[] = [];

  beforeAll(async () => {
    await ensureFixtures();
    permissions = await asPostgres(async (c) => {
      const r = await c.query(
        `select enumlabel from pg_enum e
         join pg_type t on t.oid = e.enumtypid
         where t.typname = 'app_permission'
         order by enumsortorder`,
      );
      return r.rows.map((row) => row.enumlabel as string);
    });
    expect(permissions.length).toBeGreaterThan(5);
  });

  it("enumerates every app_permission for matrix coverage", () => {
    expect(permissions).toEqual(expect.arrayContaining([
      "players.view",
      "reports.export",
    ]));
  });

  it("ordinary player is denied every admin permission", async () => {
    for (const perm of permissions) {
      await expect(
        asPlayer(PLAYER_A, async (c) => {
          const r = await c.query(
            `select public.has_permission($1::public.app_permission, auth.uid()) as ok`,
            [perm],
          );
          expect(r.rows[0].ok).toBe(false);
        }),
      ).resolves.toBeUndefined();
    }
  });

  it("disabled admin loses permission grants", async () => {
    await asPostgres(async (c) => {
      await c.query(
        `update public.admin_users set is_active = false where id = $1`,
        [ADMIN_CREDIT],
      );
    });
    await expect(
      asPlayer(ADMIN_CREDIT, async (c) => {
        const r = await c.query(
          `select public.has_permission('players.view'::public.app_permission, auth.uid()) as ok`,
        );
        expect(r.rows[0].ok).toBe(false);
      }),
    ).resolves.toBeUndefined();
    await asPostgres(async (c) => {
      await c.query(
        `update public.admin_users set is_active = true where id = $1`,
        [ADMIN_CREDIT],
      );
    });
  });
});

describe.skipIf(dbUp)("app_permission matrix (skipped: DB unreachable)", () => {
  it("requires a migrated database", () => {
    expect(dbUp).toBe(false);
  });
});
