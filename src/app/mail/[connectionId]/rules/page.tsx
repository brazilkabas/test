import { AuthenticatedShell } from "@/components/authenticated-shell";
import { MailRulesAdmin } from "@/components/mail-rules-admin";

export const dynamic = "force-dynamic";

export default async function RulesPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  return <AuthenticatedShell><MailRulesAdmin connectionId={connectionId} /></AuthenticatedShell>;
}
