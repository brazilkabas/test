"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { ConfirmDialog, EmptyState, StatusBadge, useToast } from "@/components/design-system";

type Configuration = { enabled: boolean; organization: string | null; appId: string | null; certificate: string; powershell: string };
type Pending = { operation: string; mailbox: string; delegate: string } | null;

export function ExchangeAdmin() {
  const { notify } = useToast();
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [mailbox, setMailbox] = useState("");
  const [delegation, setDelegation] = useState<Record<string, unknown> | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => { api<{ configuration: Configuration }>("/exchange").then((data) => setConfiguration(data.configuration)).catch(() => undefined); }, []);
  async function inspect(event: FormEvent) {
    event.preventDefault();
    try { const data = await api<{ delegation: Record<string, unknown> }>(`/exchange?mailbox=${encodeURIComponent(mailbox)}`); setDelegation(data.delegation); }
    catch (error) { notify({ title: "Delegation unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  async function execute() {
    if (!pending) return;
    try { await api("/exchange", { method: "POST", body: JSON.stringify({ ...pending, confirmed: true }) }); notify({ title: "Exchange permission updated", tone: "success" }); setPending(null); const data = await api<{ delegation: Record<string, unknown> }>(`/exchange?mailbox=${encodeURIComponent(pending.mailbox)}`); setDelegation(data.delegation); }
    catch (error) { notify({ title: "Exchange operation failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  return <>
    <div className="page-header"><div><h1>Exchange administration</h1><p className="muted">Official Exchange Online PowerShell and Exchange RBAC—not Microsoft Graph mailbox delegation</p></div><StatusBadge status={configuration?.enabled ? "Configured" : "Not configured"} /></div>
    {!configuration?.enabled ? <EmptyState icon="◇" title="Exchange Online administration is disabled" description="Configure certificate-based Exchange Online app authentication, the ExchangeOnlineManagement module, and restricted Exchange RBAC before enabling this module. Internal Super Admin does not grant Exchange rights." /> : <>
      <section className="panel"><form className="panel-body row" onSubmit={inspect}><label style={{ flex: 1 }}>Mailbox address<input type="email" value={mailbox} onChange={(event) => setMailbox(event.target.value)} required placeholder="employee@company.com" /></label><button>View delegation</button></form></section>
      {delegation && <section className="panel" style={{ marginTop: "1rem" }}><header className="panel-header"><h2>Current delegation</h2></header><div className="panel-body"><pre>{JSON.stringify(delegation, null, 2)}</pre></div></section>}
      <PermissionForm mailbox={mailbox} onConfirm={setPending} />
    </>}
    <section className="panel" style={{ marginTop: "1rem" }}><div className="panel-body"><h2>Authorization boundaries</h2><p className="muted">Full Access, Send As and Send on Behalf are separate Exchange permissions. Every change requires this explicit confirmation and creates an application audit event. Microsoft Entra administrator roles and delegated Graph scopes do not imply these rights.</p></div></section>
    <ConfirmDialog open={Boolean(pending)} title="Confirm Exchange permission change" description={`${pending?.operation.replaceAll("_", " ")} for ${pending?.delegate} on ${pending?.mailbox}. This is a privileged Exchange Online operation.`} confirmLabel="Apply permission change" destructive={pending?.operation.startsWith("REVOKE")} onClose={() => setPending(null)} onConfirm={() => void execute()} />
  </>;
}

function PermissionForm({ mailbox, onConfirm }: { mailbox: string; onConfirm: (pending: NonNullable<Pending>) => void }) {
  const [delegate, setDelegate] = useState("");
  return <section className="panel" style={{ marginTop: "1rem" }}><header className="panel-header"><h2>Change mailbox delegation</h2></header><div className="panel-body stack"><label>Delegate address<input type="email" value={delegate} onChange={(event) => setDelegate(event.target.value)} placeholder="operator@company.com" /></label><div className="grid">{[["Full Access", "GRANT_FULL_ACCESS", "REVOKE_FULL_ACCESS"], ["Send As", "GRANT_SEND_AS", "REVOKE_SEND_AS"], ["Send on Behalf", "GRANT_SEND_ON_BEHALF", "REVOKE_SEND_ON_BEHALF"]].map(([label, grant, revoke]) => <article className="definition" key={label}><strong>{label}</strong><p className="muted">Managed by Exchange Online RBAC.</p><div className="row"><button disabled={!mailbox || !delegate} onClick={() => onConfirm({ operation: grant, mailbox, delegate })}>Grant</button><button className="secondary" disabled={!mailbox || !delegate} onClick={() => onConfirm({ operation: revoke, mailbox, delegate })}>Revoke</button></div></article>)}</div></div></section>;
}
