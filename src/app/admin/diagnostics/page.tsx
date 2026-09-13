import { AuthenticatedShell } from "@/components/authenticated-shell";
import { MicrosoftDiagnostics } from "@/components/microsoft-diagnostics";

export const dynamic = "force-dynamic";

export default function DiagnosticsPage() {
  return <AuthenticatedShell><MicrosoftDiagnostics /></AuthenticatedShell>;
}
