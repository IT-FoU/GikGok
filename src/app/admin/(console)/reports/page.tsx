import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportExportForm } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  await requireAdminSession("reports.view");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>
            Players, games, credits, activity, support, and system exports.
            Every export checks reports.view + reports.export and writes an
            audit event. QA accounts are excluded from player analytics exports.
          </CardDescription>
        </CardHeader>
        <ReportExportForm />
      </Card>
    </div>
  );
}
