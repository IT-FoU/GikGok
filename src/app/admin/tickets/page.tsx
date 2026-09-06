import { Card, CardHeader } from "@/components/ui/card";
import {
  Table,
  TBody,
  TD,
  TR,
} from "@/components/ui/table";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TicketStatusForm, StorageOrphanCard } from "@/modules/admin/ui";
import {
  AdminTicketsHeader,
  AdminTicketsTableHead,
} from "@/modules/admin/tickets-chrome";
import { requireAdminSession } from "@/modules/admin/guards";
import { signTicketAttachmentUrls } from "@/modules/engagement/actions";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  await requireAdminSession("tickets.manage");
  const supabase = await createServerSupabaseClient();
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, subject, status, category, player_id, created_at, assigned_admin")
    .order("updated_at", { ascending: false })
    .limit(50);

  const attachmentLists = await Promise.all(
    (tickets ?? []).map(async (ticket) => ({
      ticketId: ticket.id,
      items: await signTicketAttachmentUrls(ticket.id),
    })),
  );
  const attachmentsByTicket = new Map(
    attachmentLists.map((row) => [row.ticketId, row.items]),
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <AdminTicketsHeader />
        </CardHeader>
        <TicketStatusForm
          tickets={(tickets ?? []).map((t) => ({
            id: t.id,
            subject: t.subject,
            status: t.status,
          }))}
        />
      </Card>
      <StorageOrphanCard />
      <Table>
        <AdminTicketsTableHead />
        <TBody>
          {(tickets ?? []).map((ticket) => {
            const items = attachmentsByTicket.get(ticket.id) ?? [];
            return (
              <TR key={ticket.id}>
                <TD>{ticket.subject}</TD>
                <TD>{ticket.category}</TD>
                <TD>{ticket.status}</TD>
                <TD>{ticket.created_at}</TD>
                <TD>
                  {items.length === 0 ? (
                    <span className="text-[var(--brand-muted)]">—</span>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {items.map((item) => (
                        <li key={item.id}>
                          {item.signedUrl ? (
                            <a
                              href={item.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-4 hover:underline"
                            >
                              {item.file_name}
                            </a>
                          ) : (
                            item.file_name
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
