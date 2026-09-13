import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin-dashboard";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="shell">
      <aside className="sidebar">
        <h2>Company Control</h2>
        <p>{user.displayName ?? user.email}</p>
        <nav>
          <Link href="/admin">Overview</Link>
          <Link href="/admin#accounts">Microsoft accounts</Link>
          <Link href="/admin#audit">Audit</Link>
          <span title="Available in a later milestone">HTML projects</span>
          <span title="Available in a later milestone">Cloudflare</span>
        </nav>
      </aside>
      <main className="content">
        <AdminDashboard />
      </main>
    </div>
  );
}
