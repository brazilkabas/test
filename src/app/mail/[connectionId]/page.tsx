import { redirect } from "next/navigation";

import { MailClient } from "@/components/mail-client";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MailPage({ params }: { params: Promise<{ connectionId: string }> }) {
  if (!(await currentUser())) redirect("/login");
  const { connectionId } = await params;
  return <main className="content"><MailClient connectionId={connectionId} /></main>;
}
