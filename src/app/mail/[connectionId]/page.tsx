import { AuthenticatedShell } from "@/components/authenticated-shell";
import { MailClient } from "@/components/mail-client";

export const dynamic = "force-dynamic";

export default async function MailPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  return <AuthenticatedShell><MailClient connectionId={connectionId} /></AuthenticatedShell>;
}
