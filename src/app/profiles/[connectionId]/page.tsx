import { AccountProfile } from "@/components/account-profile";
import { AuthenticatedShell } from "@/components/authenticated-shell";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  return <AuthenticatedShell><AccountProfile connectionId={connectionId} /></AuthenticatedShell>;
}
