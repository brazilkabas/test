import { AuthenticatedShell } from "@/components/authenticated-shell";
import { SecuritySettings } from "@/components/security-settings";

export const dynamic = "force-dynamic";

export default function SecurityPage() {
  return <AuthenticatedShell><SecuritySettings /></AuthenticatedShell>;
}
