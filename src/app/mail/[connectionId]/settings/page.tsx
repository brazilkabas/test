import { AuthenticatedShell } from "@/components/authenticated-shell";
import { MailboxSettingsAdmin } from "@/components/mailbox-settings-admin";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  return <AuthenticatedShell><MailboxSettingsAdmin connectionId={connectionId} /></AuthenticatedShell>;
}
