import { AccessCodeAdmin } from "@/components/access-code-admin";
import { AuthenticatedShell } from "@/components/authenticated-shell";

export const dynamic = "force-dynamic";

export default function AccessCodesPage() {
  return <AuthenticatedShell><AccessCodeAdmin /></AuthenticatedShell>;
}
