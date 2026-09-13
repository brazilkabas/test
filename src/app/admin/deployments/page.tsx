import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CloudflareDeployments } from "@/components/cloudflare-deployments";

export const dynamic = "force-dynamic";

export default function DeploymentsPage() {
  return <AuthenticatedShell><CloudflareDeployments /></AuthenticatedShell>;
}
