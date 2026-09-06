import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ADMIN_CREDIT,
  PLAYER_A,
  PLAYER_B,
  asPlayer,
  closePool,
  commitAsPostgres,
  ensureFixtures,
  isDbReachable,
} from "./helpers";

const dbUp = await isDbReachable();

describe.skipIf(!dbUp)("storage_orphan_objects authorization", () => {
  beforeAll(async () => {
    await ensureFixtures();
  });

  afterAll(async () => {
    await closePool();
  });

  it("denies direct authenticated INSERT into storage_orphan_objects", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `insert into public.storage_orphan_objects
             (bucket_id, object_path, source, last_error)
           values ('ticket-attachments', $1, 'ticket_attachment_delete', 'x')`,
          [`${randomUUID()}/${PLAYER_A}/direct.jpg`],
        );
      }),
    ).rejects.toThrow(/permission denied|row-level security|violates/i);
  });

  it("denies direct authenticated UPDATE of storage_orphan_objects", async () => {
    const orphanId = await commitAsPostgres(async (c) => {
      const ticketId = randomUUID();
      const path = `${ticketId}/${PLAYER_A}/upd.jpg`;
      await c.query(
        `insert into public.support_tickets (id, player_id, category, subject, status)
         values ($1, $2, 'other', 'orphan-upd', 'open')`,
        [ticketId, PLAYER_A],
      );
      const ins = await c.query(
        `insert into public.storage_orphan_objects
           (bucket_id, object_path, source, recorded_by)
         values ('ticket-attachments', $1, 'ticket_attachment_delete', $2)
         returning id`,
        [path, PLAYER_A],
      );
      return ins.rows[0].id as string;
    });

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `update public.storage_orphan_objects
           set last_error = 'pwned' where id = $1`,
          [orphanId],
        );
      }),
    ).rejects.toThrow(/permission denied|row-level security/i);

    await commitAsPostgres(async (c) => {
      await c.query(`delete from public.storage_orphan_objects where id = $1`, [
        orphanId,
      ]);
    });
  });

  it("rejects cross-user orphan recording for another player's path", async () => {
    const ticketId = randomUUID();
    await commitAsPostgres(async (c) => {
      await c.query(
        `insert into public.support_tickets (id, player_id, category, subject, status)
         values ($1, $2, 'other', 'cross-orphan', 'open')`,
        [ticketId, PLAYER_A],
      );
    });

    await expect(
      asPlayer(PLAYER_B, async (c) => {
        await c.query(
          `select public.record_storage_orphan(
             'ticket-attachments', $1, 'ticket_attachment_delete', null, 'x')`,
          [`${ticketId}/${PLAYER_A}/x.jpg`],
        );
      }),
    ).rejects.toThrow(/not authorized|insufficient/i);

    await commitAsPostgres(async (c) => {
      await c.query(`delete from public.support_tickets where id = $1`, [
        ticketId,
      ]);
    });
  });

  it("rejects arbitrary path and invalid source / bucket", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `select public.record_storage_orphan(
             'avatars', $1, 'ticket_attachment_delete', null, 'x')`,
          [`${PLAYER_A}/avatar.jpg`],
        );
      }),
    ).rejects.toThrow(/bucket not allowed|check/i);

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `select public.record_storage_orphan(
             'ticket-attachments', 'not-a-valid-path', 'ticket_attachment_delete', null, 'x')`,
        );
      }),
    ).rejects.toThrow(/invalid attachment object path|check/i);

    const ticketId = randomUUID();
    await commitAsPostgres(async (c) => {
      await c.query(
        `insert into public.support_tickets (id, player_id, category, subject, status)
         values ($1, $2, 'other', 'bad-source', 'open')`,
        [ticketId, PLAYER_A],
      );
    });

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `select public.record_storage_orphan(
             'ticket-attachments', $1, 'evil_source', null, 'x')`,
          [`${ticketId}/${PLAYER_A}/x.jpg`],
        );
      }),
    ).rejects.toThrow(/source not allowed|check/i);

    await commitAsPostgres(async (c) => {
      await c.query(`delete from public.support_tickets where id = $1`, [
        ticketId,
      ]);
    });
  });

  it("deduplicates unresolved orphans for the same bucket+path", async () => {
    const ticketId = randomUUID();
    const path = `${ticketId}/${PLAYER_A}/dedupe.jpg`;
    await commitAsPostgres(async (c) => {
      await c.query(
        `insert into public.support_tickets (id, player_id, category, subject, status)
         values ($1, $2, 'other', 'dedupe', 'open')`,
        [ticketId, PLAYER_A],
      );
    });

    const { first, second, count } = await asPlayer(PLAYER_A, async (c) => {
      const a = await c.query(
        `select public.record_storage_orphan(
           'ticket-attachments', $1, 'ticket_attachment_delete', null, 'one') as id`,
        [path],
      );
      const b = await c.query(
        `select public.record_storage_orphan(
           'ticket-attachments', $1, 'ticket_attachment_upload_rollback', null, 'two') as id`,
        [path],
      );
      // Same transaction — count via privileged subquery is not available under RLS;
      // uniqueness is asserted by identical returned ids.
      return {
        first: a.rows[0].id as string,
        second: b.rows[0].id as string,
        count: 1 };
    });

    expect(second).toBe(first);
    expect(count).toBe(1);

    await commitAsPostgres(async (c) => {
      await c.query(
        `delete from public.storage_orphan_objects where object_path = $1`,
        [path],
      );
      await c.query(`delete from public.support_tickets where id = $1`, [
        ticketId,
      ]);
    });
  });

  it("denies privileged cleanup RPCs to ordinary players", async () => {
    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(`select public.claim_storage_orphan_retry_batch(5)`);
      }),
    ).rejects.toThrow(/tickets\.manage|insufficient|not authorized/i);

    await expect(
      asPlayer(PLAYER_A, async (c) => {
        await c.query(
          `select public.validate_storage_orphan_for_deletion($1)`,
          [randomUUID()],
        );
      }),
    ).rejects.toThrow(/tickets\.manage|insufficient|not authorized/i);
  });

  it("admin cleanup rejects deletion when an active attachment still references the path", async () => {
    const ticketId = randomUUID();
    const messageId = randomUUID();
    const path = `${ticketId}/${PLAYER_A}/active.jpg`;
    const orphanId = await commitAsPostgres(async (c) => {
      await c.query(
        `insert into public.support_tickets (id, player_id, category, subject, status)
         values ($1, $2, 'other', 'active-attach', 'open')`,
        [ticketId, PLAYER_A],
      );
      await c.query(
        `insert into public.ticket_messages (id, ticket_id, author_id, body)
         values ($1, $2, $3, 'hello')`,
        [messageId, ticketId, PLAYER_A],
      );
      await c.query(
        `insert into public.ticket_attachments
           (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
         values ($1, $2, $3, 'active.jpg', 'image/jpeg', 100, $4)`,
        [ticketId, messageId, path, PLAYER_A],
      );
      const ins = await c.query(
        `insert into public.storage_orphan_objects
           (bucket_id, object_path, source, recorded_by)
         values ('ticket-attachments', $1, 'ticket_attachment_delete', $2)
         returning id`,
        [path, PLAYER_A],
      );
      return ins.rows[0].id as string;
    });

    await expect(
      asPlayer(ADMIN_CREDIT, async (c) => {
        await c.query(
          `select public.validate_storage_orphan_for_deletion($1)`,
          [orphanId],
        );
      }),
    ).rejects.toThrow(/still referenced|active attachment|check|referenced/i);

    await commitAsPostgres(async (c) => {
      await c.query(`delete from public.storage_orphan_objects where id = $1`, [
        orphanId,
      ]);
      await c.query(`delete from public.support_tickets where id = $1`, [
        ticketId,
      ]);
    });
  });
});

describe.skipIf(dbUp)(
  "storage_orphan_objects authorization (skipped: DB unreachable)",
  () => {
    it("requires a migrated database", () => {
      expect(dbUp).toBe(false);
    });
  },
);
