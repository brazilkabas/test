import { AiApiChat } from "@/components/ai-api-chat";
import { AuthenticatedShell } from "@/components/authenticated-shell";

export default function AiChatPage() {
  return <AuthenticatedShell><AiApiChat /></AuthenticatedShell>;
}
