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
    .select("id, title, body, is_published, publish_at, created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Announcements</CardTitle>
          <CardDescription>Draft and publish player announcements.</CardDescription>
        </CardHeader>
        <AnnouncementForm />
      </Card>
      <Table>
        <THead>
          <TR>
            <TH>Title</TH>
            <TH>Published</TH>
            <TH>Publish at</TH>
          </TR>
        </THead>
        <TBody>
          {(rows ?? []).map((row) => (
            <TR key={row.id}>
              <TD>{row.title}</TD>
              <TD>{row.is_published ? "yes" : "draft"}</TD>
              <TD>{row.publish_at ?? "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
