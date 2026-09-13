import { AuthenticatedShell } from "@/components/authenticated-shell";
import { CloudflareConfiguration } from "@/components/cloudflare-configuration";

export default function CloudflareSettingsPage() {
  return <AuthenticatedShell><CloudflareConfiguration /></AuthenticatedShell>;
}
