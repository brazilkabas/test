import { type ReactNode } from "react";
import { redirect } from "next/navigation";

import { EnterpriseShell } from "@/components/enterprise-shell";
import { currentUser } from "@/lib/auth";

export async function AuthenticatedShell({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <EnterpriseShell user={user}>{children}</EnterpriseShell>;
}
