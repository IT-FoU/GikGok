import { describe, expect, it, beforeAll } from "vitest";

import {
  asPlayer,
  asPostgres,
  commitAsPostgres,
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
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          sub: ADMIN_CREDIT,
          role: "authenticated",
          aal: "aal1",
        }),
      ]);
      await c.query("set local role authenticated");
      const r = await c.query(
        `select public.has_permission('players.view'::public.app_permission, auth.uid()) as ok`,
      );
      expect(r.rows[0].ok).toBe(false);
    });
  });

  it("role grant, allow override, deny override, and owner bypass follow precedence", async () => {
    await asPostgres(async (c) => {
      // Fresh role with reports.view only
      const role = await c.query(
        `insert into public.admin_roles (key, name, description, is_system)
         values ('fixture_reports_' || substr(gen_random_uuid()::text, 1, 8), 'Fixture Reports', 'test', false)
         returning id`,
      );
      const roleId = role.rows[0].id as string;
      await c.query(
        `insert into public.role_permissions (role_id, permission)
         values ($1, 'reports.view'::public.app_permission)
         on conflict do nothing`,
        [roleId],
      );
      await c.query(
        `delete from public.admin_user_permissions where admin_id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `delete from public.admin_user_roles where admin_id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `insert into public.admin_user_roles (admin_id, role_id) values ($1, $2)`,
        [ADMIN_CREDIT, roleId],
      );
      await c.query(
        `update public.admin_users set is_active = true, is_owner = false where id = $1`,
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

      const viaRole = await c.query(
        `select public.has_permission('reports.view'::public.app_permission) as ok`,
      );
      expect(viaRole.rows[0].ok).toBe(true);

      const other = await c.query(
        `select public.has_permission('credits.adjust'::public.app_permission) as ok`,
      );
      expect(other.rows[0].ok).toBe(false);

      // Explicit allow override
      await c.query("set local role postgres");
      await c.query(
        `insert into public.admin_user_permissions (admin_id, permission, granted)
         values ($1, 'credits.adjust'::public.app_permission, true)`,
        [ADMIN_CREDIT],
      );
      await c.query("set local role authenticated");
      const allowed = await c.query(
        `select public.has_permission('credits.adjust'::public.app_permission) as ok`,
      );
      expect(allowed.rows[0].ok).toBe(true);

      // Explicit deny override beats role grant
      await c.query("set local role postgres");
      await c.query(
        `insert into public.admin_user_permissions (admin_id, permission, granted)
         values ($1, 'reports.view'::public.app_permission, false)
         on conflict (admin_id, permission) do update set granted = false`,
        [ADMIN_CREDIT],
      );
      await c.query("set local role authenticated");
      const denied = await c.query(
        `select public.has_permission('reports.view'::public.app_permission) as ok`,
      );
      expect(denied.rows[0].ok).toBe(false);

      // Owner bypasses deny — demote any existing owner first (single-owner constraint).
      await c.query("set local role postgres");
      await c.query(
        `update public.admin_users set is_owner = false where is_owner = true`,
      );
      await c.query(
        `update public.admin_users set is_owner = true where id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query("set local role authenticated");
      const owner = await c.query(
        `select public.has_permission('reports.view'::public.app_permission) as ok`,
      );
      expect(owner.rows[0].ok).toBe(true);

      // Restore fixture admin (transaction rolls back anyway)
      await c.query("set local role postgres");
      await c.query(
        `update public.admin_users set is_owner = false where id = $1`,
        [ADMIN_CREDIT],
      );
    });
  });

  it("export permission is required for reports.export family", async () => {
    await asPostgres(async (c) => {
      await c.query(
        `update public.admin_users set is_active = true, is_owner = false where id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `delete from public.admin_user_permissions where admin_id = $1 and permission = 'reports.export'`,
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
      const denied = await c.query(
        `select public.has_permission('reports.export'::public.app_permission) as ok`,
      );
      expect(denied.rows[0].ok).toBe(false);

      await c.query("set local role postgres");
      await c.query(
        `insert into public.admin_user_permissions (admin_id, permission, granted)
         values ($1, 'reports.export'::public.app_permission, true)
         on conflict (admin_id, permission) do update set granted = true`,
        [ADMIN_CREDIT],
      );
      await c.query("set local role authenticated");
      const allowed = await c.query(
        `select public.has_permission('reports.export'::public.app_permission) as ok`,
      );
      expect(allowed.rows[0].ok).toBe(true);
    });
  });


  it("cross-resource: credits.adjust alone cannot claim storage orphan batch", async () => {
    await commitAsPostgres(async (c) => {
      await c.query(
        `update public.admin_users set is_active = true, is_owner = false where id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `delete from public.admin_user_permissions where admin_id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `insert into public.admin_user_permissions (admin_id, permission, granted)
         values ($1, 'credits.adjust'::public.app_permission, true)`,
        [ADMIN_CREDIT],
      );
    });

    try {
      await expect(
        asPlayer(ADMIN_CREDIT, async (c) => {
          await c.query(`select public.claim_storage_orphan_retry_batch(5)`);
        }),
      ).rejects.toThrow(/tickets\.manage|not authorized|permission|insufficient/i);
    } finally {
      await ensureFixtures();
    }
  });

  it("cross-resource: tickets.manage alone cannot review credit requests", async () => {
    await commitAsPostgres(async (c) => {
      await c.query(
        `update public.admin_users set is_active = true, is_owner = false where id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `delete from public.admin_user_permissions where admin_id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `insert into public.admin_user_permissions (admin_id, permission, granted)
         values ($1, 'tickets.manage'::public.app_permission, true)`,
        [ADMIN_CREDIT],
      );
    });

    try {
      await expect(
        asPlayer(ADMIN_CREDIT, async (c) => {
          await c.query(
            `select public.review_credit_request($1, 'approved', 1000, 0, 0, 'no credits.adjust')`,
            ["00000000-0000-0000-0000-000000000099"],
          );
        }),
      ).rejects.toThrow(/credits\.adjust|not authorized|permission|insufficient/i);
    } finally {
      await ensureFixtures();
    }
  });

  it("export_admin_report requires reports.export even when reports.view is granted", async () => {
    await commitAsPostgres(async (c) => {
      await c.query(
        `update public.admin_users set is_active = true, is_owner = false where id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `delete from public.admin_user_permissions where admin_id = $1`,
        [ADMIN_CREDIT],
      );
      await c.query(
        `insert into public.admin_user_permissions (admin_id, permission, granted)
         values ($1, 'reports.view'::public.app_permission, true)
         on conflict (admin_id, permission) do update set granted = true`,
        [ADMIN_CREDIT],
      );
    });

    try {
      await expect(
        asPlayer(ADMIN_CREDIT, async (c) => {
          await c.query(`select public.export_admin_report('players')`);
        }),
      ).rejects.toThrow(/export permission required|permission denied/i);

      await commitAsPostgres(async (c) => {
        await c.query(
          `insert into public.admin_user_permissions (admin_id, permission, granted)
           values
             ($1, 'reports.view'::public.app_permission, true),
             ($1, 'reports.export'::public.app_permission, true)
           on conflict (admin_id, permission) do update set granted = true`,
          [ADMIN_CREDIT],
        );
      });

      await asPlayer(ADMIN_CREDIT, async (c) => {
        const r = await c.query(
          `select public.export_admin_report('players') as payload`,
        );
        expect(r.rows[0].payload).toBeTruthy();
      });
    } finally {
      await ensureFixtures();
    }
  });


});

describe.skipIf(dbUp)("app_permission matrix (skipped: DB unreachable)", () => {
  it("requires a migrated database", () => {
    expect(dbUp).toBe(false);
  });
});
