import { AdminShell } from "@/components/shell/admin-shell";
import { requireAdminSession } from "@/modules/admin/guards";

export default async function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = await requireAdminSession();
  return <AdminShell session={session}>{children}</AdminShell>;
}
