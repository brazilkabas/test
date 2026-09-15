import { redirect } from "next/navigation";

import { EnterpriseShell } from "@/components/enterprise-shell";
import { currentMicrosoftConnection, currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MailLandingPage() {
  const [user, connection] = await Promise.all([
    currentUser(),
    currentMicrosoftConnection(),
  ]);
  if (!user) redirect("/login");
  if (connection) redirect(`/mail/${connection.id}`);

  return (
    <EnterpriseShell user={user}>
      <section className="panel panel-body stack">
        <h1>Mailbox access has not been authorized yet.</h1>
        <p className="muted">
          Connect a Microsoft account first. Mail will then use that account&apos;s
          encrypted server-side authorization cache.
        </p>
      </section>
    </EnterpriseShell>
  );
}
