import { AuthenticatedShell } from "@/components/authenticated-shell";
import { MailLanding } from "@/components/mail-landing";

export const dynamic = "force-dynamic";

export default function MailLandingPage() {
  return <AuthenticatedShell><MailLanding /></AuthenticatedShell>;
}
