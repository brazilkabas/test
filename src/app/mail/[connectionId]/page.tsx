import { AuthenticatedShell } from "@/components/authenticated-shell";
import { MailClient } from "@/components/mail-client";
import { currentMicrosoftConnection } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MailPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const boundConnection = await currentMicrosoftConnection();
  if (boundConnection && boundConnection.id !== connectionId) {
    redirect(`/mail/${boundConnection.id}`);
  }
  return <AuthenticatedShell><MailClient connectionId={connectionId} /></AuthenticatedShell>;
}
