import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin-dashboard";
import { EnterpriseShell } from "@/components/enterprise-shell";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <EnterpriseShell user={user}>
      <AdminDashboard />
    </EnterpriseShell>
  );
}
