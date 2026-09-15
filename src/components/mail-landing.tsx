"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/components/api";
import { EmptyState, Skeleton, useToast } from "@/components/design-system";

type MailAccount = {
  id: string;
  authorizationStatus: string;
  capabilities: { canReadMail: boolean };
};

export function MailLanding() {
  const router = useRouter();
  const { notify } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ accounts: MailAccount[] }>("/microsoft/accounts")
      .then(({ accounts }) => {
        const connected = accounts.filter((account) => account.authorizationStatus === "CONNECTED");
        const ready = connected.filter((account) => account.capabilities.canReadMail);
        const lastUsed = localStorage.getItem("company-last-mail-connection");
        const destination = ready.find((account) => account.id === lastUsed)
          ?? ready[0]
          ?? connected[0];
        if (destination) router.replace(`/mail/${destination.id}`);
        else setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        notify({
          title: "Microsoft accounts unavailable",
          message: error instanceof Error ? error.message : undefined,
          tone: "error",
        });
      });
  }, [notify, router]);

  if (loading) return <section className="panel panel-body"><Skeleton lines={6} /></section>;
  return <section className="panel panel-body">
    <EmptyState
      icon="◎"
      title="No Microsoft account connected"
      description="Connect a Microsoft account before opening Mail."
      action={<Link className="button" href="/admin/accounts">Connect Account</Link>}
    />
  </section>;
}
