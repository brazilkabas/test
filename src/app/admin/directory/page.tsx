import { AuthenticatedShell } from "@/components/authenticated-shell";
import { OrganizationUsers } from "@/components/organization-users";

export const dynamic = "force-dynamic";

export default function DirectoryPage() {
  return <AuthenticatedShell><OrganizationUsers /></AuthenticatedShell>;
}
