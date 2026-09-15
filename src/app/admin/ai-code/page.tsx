import { AuthenticatedShell } from "@/components/authenticated-shell";
import { AiCodeConsole } from "@/components/ai-code-console";

export const dynamic = "force-dynamic";

export default function AiCodePage() {
  return <AuthenticatedShell><AiCodeConsole /></AuthenticatedShell>;
}
