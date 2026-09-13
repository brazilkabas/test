import { AccountsTable } from "@/components/accounts-table";
import { AuthenticatedShell } from "@/components/authenticated-shell";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <AuthenticatedShell><AccountsTable initialQuery={q ?? ""} /></AuthenticatedShell>;
}
