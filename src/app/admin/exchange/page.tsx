import { AuthenticatedShell } from "@/components/authenticated-shell";
import { ExchangeAdmin } from "@/components/exchange-admin";

export const dynamic = "force-dynamic";

export default function ExchangePage() {
  return <AuthenticatedShell><ExchangeAdmin /></AuthenticatedShell>;
}
