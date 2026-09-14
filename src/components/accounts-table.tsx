"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/components/api";
import { ConfirmDialog, EmptyState, Modal, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Account = {
  id: string;
  displayName: string | null;
  email: string | null;
  userPrincipalName: string | null;
  tenantId: string;
  microsoftUserId: string;
  authorizationStatus: string;
  connectedAt: string;
  lastSuccessfulGraphAt: string | null;
  grantedScopes: string[];
};

export function AccountsTable({ initialQuery = "" }: { initialQuery?: string }) {
  const { notify } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Account | null>(null);
  const [disconnect, setDisconnect] = useState<Account | null>(null);

  async function load() {
    try {
      const result = await api<{ accounts: Account[] }>("/microsoft/accounts");
      setAccounts(result.accounts);
    } catch (error) {
      notify({ title: "Accounts unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => accounts.filter((account) => {
    const text = `${account.displayName} ${account.email} ${account.userPrincipalName} ${account.tenantId} ${account.microsoftUserId}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (status === "all" || account.authorizationStatus === status);
  }), [accounts, query, status]);

  async function startConnection() {
    try {
      const result = await api<{ authorizationUrl: string }>("/microsoft/auth/start", { method: "POST", body: "{}" });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      notify({ title: "Could not start connection", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  async function confirmDisconnect() {
    if (!disconnect) return;
    try {
      await api(`/microsoft/accounts/${disconnect.id}`, { method: "DELETE" });
      notify({ title: "Connection removed", message: "Cached Microsoft credentials were erased locally.", tone: "success" });
      setDisconnect(null);
      await load();
    } catch (error) {
      notify({ title: "Disconnect failed", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  return (
    <>
      <div className="page-header"><div><h1>Microsoft accounts</h1><p className="muted">Connected employees and delegated Graph capabilities</p></div><button onClick={startConnection}>+ Connect account</button></div>
      <section className="panel">
        <div className="table-toolbar"><input type="search" aria-label="Search accounts" placeholder="Search employee, email, tenant or object ID" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter connection status" style={{ width: 210 }} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="CONNECTED">Connected</option><option value="REAUTHENTICATION_REQUIRED">Reauthentication required</option><option value="REVOKED">Revoked</option><option value="FAILED">Failed</option></select><span className="muted">{filtered.length} account{filtered.length === 1 ? "" : "s"}</span></div>
        {loading ? <div className="panel-body"><Skeleton lines={6} /></div> : filtered.length === 0 ? <EmptyState icon="◎" title="No matching accounts" description={accounts.length ? "Change the filters to see other connections." : "Connect an employee through Microsoft Entra in the browser."} action={!accounts.length ? <button onClick={startConnection}>Connect account</button> : undefined} /> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Tenant</th><th>Connection</th><th>Microsoft user ID</th><th>Last activity</th><th>Mailbox</th><th>Shared</th><th>Capabilities</th><th>Actions</th></tr></thead><tbody>{filtered.map((account) => (
            <tr key={account.id}>
              <td><strong>{account.displayName ?? "Unnamed employee"}</strong><br /><span className="muted">{account.email ?? account.userPrincipalName}</span></td>
              <td><small>{account.tenantId}</small></td>
              <td><StatusBadge status={account.authorizationStatus} /></td>
              <td><small>{account.microsoftUserId}</small></td>
              <td>{account.lastSuccessfulGraphAt ? new Date(account.lastSuccessfulGraphAt).toLocaleString() : "Never"}</td>
              <td><StatusBadge status={account.authorizationStatus === "CONNECTED" ? "Available" : "Unavailable"} /></td>
              <td>0</td>
              <td>{account.grantedScopes.includes("Mail.Send") ? "Mail operator" : "Mail viewer"}</td>
              <td><details className="action-menu"><summary aria-label={`Actions for ${account.displayName}`}>•••</summary><div><Link href={`/mail/${account.id}`}>Open mail</Link><Link href={`/profiles/${account.id}`}>Open profile</Link><button onClick={startConnection}>Reconnect</button><button onClick={() => setPermissions(account)}>View permissions</button><a href="https://outlook.office.com/mail/" target="_blank" rel="noopener noreferrer">Open Outlook</a><Link href={`/admin/audit?connectionId=${account.id}`}>Audit history</Link><button className="error" onClick={() => setDisconnect(account)}>Disconnect</button></div></details></td>
            </tr>
          ))}</tbody></table></div>
        )}
      </section>
      <Modal open={Boolean(permissions)} title="Microsoft delegated permissions" onClose={() => setPermissions(null)}>{permissions && <div className="stack"><p className="muted">Permissions granted to {permissions.displayName ?? permissions.userPrincipalName}. Internal roles do not expand these Microsoft permissions.</p><div className="row">{permissions.grantedScopes.map((scope) => <span className="badge" key={scope}>{scope}</span>)}</div></div>}</Modal>
      <ConfirmDialog open={Boolean(disconnect)} title="Disconnect Microsoft account?" description="This erases the local encrypted MSAL cache and prevents further Graph access. It does not bypass or modify Microsoft tenant policy." confirmLabel="Disconnect account" destructive onClose={() => setDisconnect(null)} onConfirm={() => void confirmDisconnect()} />
    </>
  );
}
