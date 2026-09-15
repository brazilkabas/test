import { AuthenticatedShell } from "@/components/authenticated-shell";
import { MailClient } from "@/components/mail-client";
import { currentMicrosoftConnection } from "@/lib/auth";
import { probeMailboxReadiness } from "@/lib/microsoft";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MailPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const boundConnection = await currentMicrosoftConnection();
  if (boundConnection && boundConnection.id !== connectionId) {
    redirect(`/mail/${boundConnection.id}`);
  }
  const mailbox = await probeMailboxReadiness(connectionId);
  return (
    <AuthenticatedShell>
      <MailClient connectionId={connectionId} initialMailboxStatus={mailbox.mailboxStatus} />
    </AuthenticatedShell>
  );
}
