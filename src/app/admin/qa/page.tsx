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
import { QaAccountForm } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminQaPage() {
  await requireAdminSession("admins.manage");
  const supabase = await createServerSupabaseClient();
  const { data: accounts } = await supabase
    .from("qa_demo_accounts")
    .select("player_id, label, purpose, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>QA / demo accounts</CardTitle>
          <CardDescription>
            Isolated from ordinary player analytics and ledger reporting.
          </CardDescription>
        </CardHeader>
        <QaAccountForm />
      </Card>
      <Table>
        <THead>
          <TR>
            <TH>Label</TH>
            <TH>Player</TH>
            <TH>Purpose</TH>
          </TR>
        </THead>
        <TBody>
          {(accounts ?? []).map((row) => (
            <TR key={row.player_id}>
              <TD>{row.label}</TD>
              <TD className="font-mono text-xs">{row.player_id}</TD>
              <TD>{row.purpose ?? "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
