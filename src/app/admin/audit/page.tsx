import { AuditViewer } from "@/components/audit-viewer";
import { AuthenticatedShell } from "@/components/authenticated-shell";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ connectionId?: string }> }) {
  const { connectionId } = await searchParams;
  return <AuthenticatedShell><AuditViewer initialConnectionId={connectionId ?? ""} /></AuthenticatedShell>;
}
