import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ADMIN_CREDIT,
  ADMIN_CREDIT_B,
  PLAYER_A,
  asPostgres,
  closePool,
  commitAsPostgres,
  ensureFixtures,
  isDbReachable,
  openAuthenticatedClient,
} from "./helpers";

const dbUp = await isDbReachable();

async function seedPendingCreditRequest(amount: number): Promise<string> {
  return commitAsPostgres(async (c) => {
    await c.query(
      `update public.credit_requests set status = 'cancelled'
       where player_id = $1 and status = 'pending'`,
      [PLAYER_A],
    );
    const ins = await c.query(
      `insert into public.credit_requests (player_id, requested_amount, note, status)
       values ($1, $2, 'dual-approval fixture', 'pending')
       returning id`,
      [PLAYER_A, amount],
    );
    return ins.rows[0].id as string;
  });
}

/** Run an authenticated RPC and commit immediately (needed for lock release). */
async function authRpc<T>(
  sub: string,
  fn: (client: Awaited<ReturnType<typeof openAuthenticatedClient>>) => Promise<T>,
): Promise<T> {
  const client = await openAuthenticatedClient(sub);
  try {
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe.skipIf(!dbUp)("dual approval + true concurrency", () => {
  beforeAll(async () => {
    await ensureFixtures();
    await commitAsPostgres(async (c) => {
      await c.query(
        `insert into public.system_settings (key, value)
         values ('credits.second_approval_threshold', '500000'::jsonb)
         on conflict (key) do update set value = excluded.value`,
      );
    });
  }, 60_000);

  afterAll(async () => {
    await closePool();
  }, 60_000);

  it("below-threshold approval completes with a single distinct approver", async () => {
    const requestId = await seedPendingCreditRequest(1000);
    const result = await authRpc(ADMIN_CREDIT, async (c) => {
      const r = await c.query(
        `select public.review_credit_request($1, 'approved', 1000, 0, 0, 'under threshold') as payload`,
        [requestId],
      );
      return r.rows[0].payload as { status: string };
    });
    expect(result.status).toBe("approved");
  });

  it(
    "above-threshold requires two distinct approvers; self-second is rejected",
    async () => {
      const requestId = await seedPendingCreditRequest(600000);

      const first = await authRpc(ADMIN_CREDIT, async (c) => {
        const r = await c.query(
          `select public.review_credit_request($1, 'approved', 600000, 0, 0, 'first approval') as payload`,
          [requestId],
        );
        return r.rows[0].payload as { status: string };
      });
      expect(first.status).toBe("pending_second_approval");

      await expect(
        authRpc(ADMIN_CREDIT, async (c) => {
          await c.query(
            `select public.review_credit_request($1, 'approved', 600000, 0, 0, 'self second')`,
            [requestId],
          );
        }),
      ).rejects.toThrow(/self second|not allowed|check/i);

      const second = await authRpc(ADMIN_CREDIT_B, async (c) => {
        const r = await c.query(
          `select public.review_credit_request($1, 'approved', 600000, 0, 0, 'second approval') as payload`,
          [requestId],
        );
        return r.rows[0].payload as {
          status: string;
          is_second_approval: boolean;
        };
      });
      expect(second.status).toBe("approved");
      expect(second.is_second_approval).toBe(true);

      const ledgerCount = await asPostgres(async (c) => {
        const r = await c.query(
          `select count(*)::int as n from public.gik_ledger
           where reference_id = $1 and entry_type = 'demo_credit_grant'`,
          [requestId],
        );
        return r.rows[0].n as number;
      });
      expect(ledgerCount).toBe(1);
    },
    60_000,
  );

  it(
    "concurrent first approvals serialize (separate connections)",
    async () => {
      const raceId = await seedPendingCreditRequest(900000);

      const [rx, ry] = await Promise.allSettled([
        authRpc(ADMIN_CREDIT, async (c) => {
          const r = await c.query(
            `select public.review_credit_request($1, 'approved', 900000, 0, 0, 'race-a') as payload`,
            [raceId],
          );
          return r.rows[0].payload as { status: string };
        }),
        authRpc(ADMIN_CREDIT_B, async (c) => {
          const r = await c.query(
            `select public.review_credit_request($1, 'approved', 900000, 0, 0, 'race-b') as payload`,
            [raceId],
          );
          return r.rows[0].payload as { status: string };
        }),
      ]);

      const statuses: string[] = [];
      for (const r of [rx, ry]) {
        if (r.status === "fulfilled") statuses.push(r.value.status);
      }

      expect(statuses.length).toBe(2);
      const approved = statuses.filter((s) => s === "approved").length;
      const pending = statuses.filter(
        (s) => s === "pending_second_approval",
      ).length;
      // Under row lock: one first-approval + one second-approval (or equivalent).
      expect(approved).toBe(1);
      expect(pending).toBe(1);

      const finalGrants = await asPostgres(async (c) => {
        const r = await c.query(
          `select count(*)::int as n from public.gik_ledger
           where reference_id = $1 and entry_type = 'demo_credit_grant'`,
          [raceId],
        );
        return r.rows[0].n as number;
      });
      expect(finalGrants).toBe(1);
    },
    60_000,
  );

  it(
    "attachment limit: two concurrent inserts with 2 existing → exactly one success, final count 3",
    async () => {
      const ticketId = randomUUID();
      const messageId = randomUUID();

      await commitAsPostgres(async (c) => {
        await c.query(
          `insert into public.support_tickets (id, player_id, category, subject, status)
           values ($1, $2, 'other', 'conc-attach', 'open')`,
          [ticketId, PLAYER_A],
        );
        await c.query(
          `insert into public.ticket_messages (id, ticket_id, author_id, body)
           values ($1, $2, $3, 'hello')`,
          [messageId, ticketId, PLAYER_A],
        );
        for (let i = 0; i < 2; i++) {
          await c.query(
            `insert into public.ticket_attachments
               (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
             values ($1, $2, $3, $4, 'image/jpeg', 100, $5)`,
            [
              ticketId,
              messageId,
              `${ticketId}/${PLAYER_A}/existing-${i}.jpg`,
              `existing-${i}.jpg`,
              PLAYER_A,
            ],
          );
        }
      });

      const [r1, r2] = await Promise.allSettled([
        authRpc(PLAYER_A, async (c) => {
          await c.query(
            `insert into public.ticket_attachments
               (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
             values ($1, $2, $3, 'race-1.jpg', 'image/jpeg', 100, $4)`,
            [
              ticketId,
              messageId,
              `${ticketId}/${PLAYER_A}/race-1.jpg`,
              PLAYER_A,
            ],
          );
        }),
        authRpc(PLAYER_A, async (c) => {
          await c.query(
            `insert into public.ticket_attachments
               (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
             values ($1, $2, $3, 'race-2.jpg', 'image/jpeg', 100, $4)`,
            [
              ticketId,
              messageId,
              `${ticketId}/${PLAYER_A}/race-2.jpg`,
              PLAYER_A,
            ],
          );
        }),
      ]);

      const ok = [r1, r2].filter((r) => r.status === "fulfilled").length;
      const bad = [r1, r2].filter((r) => r.status === "rejected").length;
      expect(ok).toBe(1);
      expect(bad).toBe(1);

      const finalCount = await asPostgres(async (c) => {
        const r = await c.query(
          `select count(*)::int as n from public.ticket_attachments where ticket_id = $1`,
          [ticketId],
        );
        return r.rows[0].n as number;
      });
      expect(finalCount).toBe(3);

      await commitAsPostgres(async (c) => {
        await c.query(`delete from public.support_tickets where id = $1`, [
          ticketId,
        ]);
      });
    },
    60_000,
  );

  it("exact-threshold net equals threshold completes with a single approver", async () => {
    const requestId = await seedPendingCreditRequest(500_000);
    const result = await authRpc(ADMIN_CREDIT, async (c) => {
      const r = await c.query(
        `select public.review_credit_request($1, 'approved', 500000, 0, 0, 'exact threshold') as payload`,
        [requestId],
      );
      return r.rows[0].payload as { status: string };
    });
    expect(result.status).toBe("approved");
  });

  it("reject while pending leaves no ledger grant and blocks later approve", async () => {
    const requestId = await seedPendingCreditRequest(2500);
    const rejected = await authRpc(ADMIN_CREDIT, async (c) => {
      const r = await c.query(
        `select public.review_credit_request($1, 'rejected', 2500, 0, 0, 'reject fixture') as payload`,
        [requestId],
      );
      return r.rows[0].payload as { status: string };
    });
    expect(rejected.status).toBe("rejected");

    await expect(
      authRpc(ADMIN_CREDIT_B, async (c) => {
        await c.query(
          `select public.review_credit_request($1, 'approved', 2500, 0, 0, 'after reject')`,
          [requestId],
        );
      }),
    ).rejects.toThrow(/not pending/i);

    const grants = await asPostgres(async (c) => {
      const r = await c.query(
        `select count(*)::int as n from public.gik_ledger
         where reference_id = $1 and entry_type = 'demo_credit_grant'`,
        [requestId],
      );
      return r.rows[0].n as number;
    });
    expect(grants).toBe(0);
  });

  it("stale approve on already-approved request is rejected", async () => {
    const requestId = await seedPendingCreditRequest(1500);
    await authRpc(ADMIN_CREDIT, async (c) => {
      await c.query(
        `select public.review_credit_request($1, 'approved', 1500, 0, 0, 'first')`,
        [requestId],
      );
    });
    await expect(
      authRpc(ADMIN_CREDIT_B, async (c) => {
        await c.query(
          `select public.review_credit_request($1, 'approved', 1500, 0, 0, 'stale')`,
          [requestId],
        );
      }),
    ).rejects.toThrow(/not pending/i);
  });

  it(
    "concurrent second approvals: exactly one grant for above-threshold request",
    async () => {
      const requestId = await seedPendingCreditRequest(750_000);
      await authRpc(ADMIN_CREDIT, async (c) => {
        const r = await c.query(
          `select public.review_credit_request($1, 'approved', 750000, 0, 0, 'first') as payload`,
          [requestId],
        );
        expect((r.rows[0].payload as { status: string }).status).toBe(
          "pending_second_approval",
        );
      });

      const ADMIN_CREDIT_C = "00000000-0000-0000-0000-0000000000c5";
      await commitAsPostgres(async (c) => {
        await c.query(
          `insert into auth.users (id, aud, role, email, encrypted_password,
             raw_user_meta_data, email_confirmed_at, created_at, updated_at)
           values ($1,'authenticated','authenticated',$2, crypt('demo-only', gen_salt('bf')),
             jsonb_build_object('nickname', 'rls_admin_credit_c'), now(), now(), now())
           on conflict (id) do nothing`,
          [ADMIN_CREDIT_C, "rls_admin_credit_c@example.test"],
        );
        await c.query(
          `insert into public.profiles (id, nickname, status)
           values ($1, 'rls_admin_credit_c', 'active'::public.player_status)
           on conflict (id) do nothing`,
          [ADMIN_CREDIT_C],
        );
        await c.query(
          `insert into public.admin_users (id, is_owner, is_active, requires_2fa, requires_pin)
           values ($1, false, true, false, false)
           on conflict (id) do update set is_active = true`,
          [ADMIN_CREDIT_C],
        );
        await c.query(
          `insert into public.admin_user_permissions (admin_id, permission, granted)
           values
             ($1,'credits.view',true),
             ($1,'credits.adjust',true)
           on conflict (admin_id, permission) do update set granted = excluded.granted`,
          [ADMIN_CREDIT_C],
        );
      });

      const [rx, ry] = await Promise.allSettled([
        authRpc(ADMIN_CREDIT_B, async (c) => {
          const r = await c.query(
            `select public.review_credit_request($1, 'approved', 750000, 0, 0, 'second-b') as payload`,
            [requestId],
          );
          return r.rows[0].payload as { status: string };
        }),
        authRpc(ADMIN_CREDIT_C, async (c) => {
          const r = await c.query(
            `select public.review_credit_request($1, 'approved', 750000, 0, 0, 'second-c') as payload`,
            [requestId],
          );
          return r.rows[0].payload as { status: string };
        }),
      ]);

      const approved = [rx, ry].filter(
        (r) => r.status === "fulfilled" && r.value.status === "approved",
      ).length;
      const failed = [rx, ry].filter((r) => r.status === "rejected").length;
      expect(approved).toBe(1);
      expect(approved + failed).toBe(2);

      const grants = await asPostgres(async (c) => {
        const r = await c.query(
          `select count(*)::int as n from public.gik_ledger
           where reference_id = $1 and entry_type = 'demo_credit_grant'`,
          [requestId],
        );
        return r.rows[0].n as number;
      });
      expect(grants).toBe(1);
    },
    60_000,
  );


});

describe.skipIf(dbUp)(
  "dual approval + concurrency (skipped: DB unreachable)",
  () => {
    it("requires a migrated database", () => {
      expect(dbUp).toBe(false);
    });
  },
);
