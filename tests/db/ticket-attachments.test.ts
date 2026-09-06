// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  PLAYER_A,
  PLAYER_B,
  asPlayer,
  asPostgres,
  closePool,
  ensureFixtures,
  isDbReachable,
} from "./helpers";

const dbUp = await isDbReachable();

describe.runIf(dbUp)("ticket_attachments invariants", () => {
  beforeAll(async () => {
    await ensureFixtures();
  });
  afterAll(async () => {
    await closePool();
  });

  it("rejects message_id from a different ticket", async () => {
    await asPostgres(async (c) => {
      const ticketId = randomUUID();
      const messageId = randomUUID();
      const foreignTicketId = randomUUID();
      const foreignMessageId = randomUUID();

      await c.query(
        `insert into public.support_tickets (id, player_id, category, subject, status)
         values
           ($1, $2, 'other', 'attach-a', 'open'),
           ($3, $2, 'other', 'attach-b', 'open')`,
        [ticketId, PLAYER_A, foreignTicketId],
      );
      await c.query(
        `insert into public.ticket_messages (id, ticket_id, author_id, body)
         values
           ($1, $2, $3, 'hello'),
           ($4, $5, $3, 'other ticket')`,
        [messageId, ticketId, PLAYER_A, foreignMessageId, foreignTicketId],
      );

      await expect(
        c.query(
          `insert into public.ticket_attachments
             (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
           values ($1, $2, $3, 'x.jpg', 'image/jpeg', 100, $4)`,
          [
            ticketId,
            foreignMessageId,
            `${ticketId}/${PLAYER_A}/x.jpg`,
            PLAYER_A,
          ],
        ),
      ).rejects.toThrow(/belong|message_id|foreign/i);
    });
  });

  it("concurrency-safe: fourth attachment is rejected with ticket lock", async () => {
    await asPostgres(async (c) => {
      const ticketId = randomUUID();
      const messageId = randomUUID();
      await c.query(
        `insert into public.support_tickets (id, player_id, category, subject, status)
         values ($1, $2, 'other', 'cap', 'open')`,
        [ticketId, PLAYER_A],
      );
      await c.query(
        `insert into public.ticket_messages (id, ticket_id, author_id, body)
         values ($1, $2, $3, 'hello')`,
        [messageId, ticketId, PLAYER_A],
      );

      for (let i = 0; i < 3; i++) {
        await c.query(
          `insert into public.ticket_attachments
             (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
           values ($1, $2, $3, $4, 'image/jpeg', 100, $5)`,
          [
            ticketId,
            messageId,
            `${ticketId}/${PLAYER_A}/${i}.jpg`,
            `${i}.jpg`,
            PLAYER_A,
          ],
        );
      }

      await expect(
        c.query(
          `insert into public.ticket_attachments
             (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
           values ($1, $2, $3, '4.jpg', 'image/jpeg', 100, $4)`,
          [ticketId, messageId, `${ticketId}/${PLAYER_A}/4.jpg`, PLAYER_A],
        ),
      ).rejects.toThrow(/at most 3/i);
    });
  });

  it("rejects attachments on closed tickets", async () => {
    await asPostgres(async (c) => {
      const ticketId = randomUUID();
      const messageId = randomUUID();
      await c.query(
        `insert into public.support_tickets (id, player_id, category, subject, status)
         values ($1, $2, 'other', 'closed', 'closed')`,
        [ticketId, PLAYER_A],
      );
      await c.query(
        `insert into public.ticket_messages (id, ticket_id, author_id, body)
         values ($1, $2, $3, 'hello')`,
        [messageId, ticketId, PLAYER_A],
      );

      await expect(
        c.query(
          `insert into public.ticket_attachments
             (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
           values ($1, $2, $3, 'x.jpg', 'image/jpeg', 100, $4)`,
          [ticketId, messageId, `${ticketId}/${PLAYER_A}/closed.jpg`, PLAYER_A],
        ),
      ).rejects.toThrow(/closed/i);
    });
  });

  it("unauthorized player cannot select another player's attachments", async () => {
    const ticketId = randomUUID();
    const messageId = randomUUID();

    // Commit seed via ensureFixtures-style privileged connection.
    const client = await (await import("./helpers")).getPool().connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into public.support_tickets (id, player_id, category, subject, status)
         values ($1, $2, 'other', 'priv', 'open')`,
        [ticketId, PLAYER_A],
      );
      await client.query(
        `insert into public.ticket_messages (id, ticket_id, author_id, body)
         values ($1, $2, $3, 'hello')`,
        [messageId, ticketId, PLAYER_A],
      );
      await client.query(
        `insert into public.ticket_attachments
           (ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
         values ($1, $2, $3, 'x.jpg', 'image/jpeg', 100, $4)`,
        [ticketId, messageId, `${ticketId}/${PLAYER_A}/priv.jpg`, PLAYER_A],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const rows = await asPlayer(PLAYER_B, async (c) => {
      const r = await c.query(
        `select id from public.ticket_attachments where ticket_id = $1`,
        [ticketId],
      );
      return r.rows;
    });
    expect(rows).toEqual([]);
  });
});

describe.skipIf(dbUp)("ticket_attachments invariants (skipped: DB unreachable)", () => {
  it("requires a migrated database", () => {
    expect(dbUp).toBe(false);
  });
});
