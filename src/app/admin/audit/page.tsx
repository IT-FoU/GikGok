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
import { filterAuditRows } from "@/modules/admin";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; target?: string }>;
}) {
  await requireAdminSession("audit.view");
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, target_type, target_id, reason, result, created_at, actor_id")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = filterAuditRows(data ?? [], {
    action: params.action,
    targetType: params.target,
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>
            Append-only search by action and target. Export via reports module.
          </CardDescription>
        </CardHeader>
        <form className="flex flex-wrap gap-2">
          <input
            name="action"
            defaultValue={params.action ?? ""}
            placeholder="Action contains…"
            className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
          />
          <input
            name="target"
            defaultValue={params.target ?? ""}
            placeholder="Target type"
            className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm text-black"
          >
            Filter
          </button>
        </form>
      </Card>

      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}

      <Table>
        <THead>
          <TR>
            <TH>When</TH>
            <TH>Action</TH>
            <TH>Target</TH>
            <TH>Reason</TH>
            <TH>Result</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="whitespace-nowrap text-xs">{row.created_at}</TD>
              <TD className="font-mono text-xs">{row.action}</TD>
              <TD>
                {row.target_type}:{row.target_id}
              </TD>
              <TD>{row.reason ?? "—"}</TD>
              <TD>{row.result}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
