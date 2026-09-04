import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AnnouncementForm } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requireAdminSession("announcements.manage");
  const supabase = await createServerSupabaseClient();
  const { data: rows } = await supabase
    .from("announcements")
    .select("id, status, title_i18n, published_at, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(40);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Announcements</CardTitle>
          <CardDescription>Draft, schedule, publish, and archive.</CardDescription>
        </CardHeader>
        <AnnouncementForm />
      </Card>
      <Table>
        <THead>
          <TR>
            <TH>Title</TH>
            <TH>Status</TH>
            <TH>Published</TH>
          </TR>
        </THead>
        <TBody>
          {(rows ?? []).map((row) => {
            const title = row.title_i18n as { en?: string; lo?: string };
            return (
              <TR key={row.id}>
                <TD>{title?.en ?? title?.lo ?? row.id}</TD>
                <TD>{row.status}</TD>
                <TD>{row.published_at ?? "—"}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
