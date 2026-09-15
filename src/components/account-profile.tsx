"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/components/api";
import { EmptyState, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Account = {
  id: string;
  tenantId: string;
  microsoftUserId: string;
  displayName: string | null;
  userPrincipalName: string | null;
  email: string | null;
  connectedAt: string;
  lastSuccessfulGraphAt: string | null;
  authorizationStatus: string;
  grantedScopes: string[];
  tokenCacheHealth: string;
  mailboxAvailable: boolean;
  mailboxStatus: "READY" | "NOT_AUTHORIZED" | "REAUTH_REQUIRED" | "ERROR";
  capabilities: Record<string, boolean>;
  auditEvents: Array<{ id: string; action: string; result: string; createdAt: string; targetType: string }>;
};

const tabs = ["Overview", "Mailbox", "Folders", "Rules", "Mailbox Settings", "Shared Mailboxes", "Microsoft Permissions", "Files", "Calendar", "Contacts", "Audit Log"] as const;

export function AccountProfile({ connectionId }: { connectionId: string }) {
  const { notify } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [folders, setFolders] = useState<Array<Record<string, unknown>>>([]);
  const [rules, setRules] = useState<Array<Record<string, unknown>>>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api<{ account: Account }>(`/microsoft/accounts/${connectionId}`)
      .then((result) => setAccount(result.account))
      .catch((error) => notify({ title: "Profile unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }));
  }, [connectionId, notify]);

  async function changeTab(next: (typeof tabs)[number]) {
    setTab(next);
    if (
      account
      && !account.mailboxAvailable
      && ["Folders", "Rules", "Mailbox Settings"].includes(next)
    ) return;
    try {
      if (next === "Folders" && !folders.length) setFolders((await api<{ folders: Array<Record<string, unknown>> }>(`/mail/${connectionId}/folders`)).folders);
      if (next === "Rules" && !rules.length) setRules((await api<{ rules: Array<Record<string, unknown>> }>(`/mail/${connectionId}/rules`)).rules);
      if (next === "Mailbox Settings" && !settings) setSettings((await api<{ settings: Record<string, unknown> }>(`/mail/${connectionId}/settings`)).settings);
    } catch (error) {
      notify({ title: `${next} could not load`, message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }

  if (!account) return <div className="panel panel-body"><Skeleton lines={8} /></div>;
  return (
    <>
      <div className="page-header"><div><Link href="/admin/accounts">← Microsoft accounts</Link><h1>{account.displayName ?? "Microsoft account"}</h1><p className="muted">{account.email ?? account.userPrincipalName}</p></div><div className="page-actions"><StatusBadge status={account.authorizationStatus} />{account.mailboxAvailable ? <Link className="button" href={`/mail/${account.id}`}>Open Mail</Link> : <StatusBadge status={account.mailboxStatus} />}</div></div>
      <section className="panel">
        <nav className="tabs" aria-label="Profile sections">{tabs.map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => void changeTab(item)}>{item}</button>)}</nav>
        <div className="panel-body">
          {tab === "Overview" && <div className="stack">
            <div className="definition-grid">
              <Info label="Microsoft object ID" value={account.microsoftUserId} />
              <Info label="Tenant ID" value={account.tenantId} />
              <Info label="Connection state" value={<StatusBadge status={account.authorizationStatus} />} />
              <Info label="Token cache health" value={<StatusBadge status={account.tokenCacheHealth} />} />
              <Info label="Mailbox availability" value={<StatusBadge status={account.mailboxStatus} />} />
              <Info label="Connected" value={new Date(account.connectedAt).toLocaleString()} />
              <Info label="Last Graph activity" value={account.lastSuccessfulGraphAt ? new Date(account.lastSuccessfulGraphAt).toLocaleString() : "Never"} />
              <Info label="Reauthentication" value={account.authorizationStatus === "REAUTHENTICATION_REQUIRED" ? "Required" : "Not required"} />
            </div>
            <h2>Detected capabilities</h2><div className="row">{Object.entries(account.capabilities).map(([capability, enabled]) => <span className={`status status-${enabled ? "positive" : "neutral"}`} key={capability}><span />{capability.replace(/([A-Z])/g, " $1")}</span>)}</div>
            <h2>Granted Graph scopes</h2><div className="row">{account.grantedScopes.map((scope) => <span className="badge" key={scope}>{scope}</span>)}</div>
          </div>}
          {tab === "Mailbox" && (account.mailboxAvailable
            ? <EmptyState icon="✉" title="Mailbox is available" description="Open the full folder-aware mail workspace for this employee." action={<Link className="button" href={`/mail/${account.id}`}>Open Mail</Link>} />
            : <Unavailable title="Mailbox is not available" description={`Current mailbox status: ${account.mailboxStatus.replaceAll("_", " ").toLowerCase()}.`} />)}
          {tab === "Folders" && (account.mailboxAvailable ? <SimpleTable rows={folders} columns={["displayName", "totalItemCount", "unreadItemCount"]} /> : <Unavailable title="Folders unavailable" description={`Mailbox status: ${account.mailboxStatus.replaceAll("_", " ").toLowerCase()}.`} />)}
          {tab === "Rules" && (account.mailboxAvailable ? <SimpleTable rows={rules} columns={["displayName", "isEnabled", "sequence"]} /> : <Unavailable title="Rules unavailable" description={`Mailbox status: ${account.mailboxStatus.replaceAll("_", " ").toLowerCase()}.`} />)}
          {tab === "Mailbox Settings" && (account.mailboxAvailable ? <div className="definition-grid">{settings && Object.entries(settings).filter(([, value]) => typeof value !== "object").map(([key, value]) => <Info key={key} label={key} value={String(value ?? "Not set")} />)}</div> : <Unavailable title="Mailbox settings unavailable" description={`Mailbox status: ${account.mailboxStatus.replaceAll("_", " ").toLowerCase()}.`} />)}
          {tab === "Shared Mailboxes" && <Unavailable title="Shared mailbox discovery is not configured" description="Shared access must be probed with Mail.ReadWrite.Shared/Mail.Send.Shared and existing Exchange mailbox rights. Global Admin alone does not grant access." />}
          {tab === "Microsoft Permissions" && <div className="row">{account.grantedScopes.map((scope) => <span className="badge" key={scope}>{scope}</span>)}</div>}
          {["Files", "Calendar", "Contacts"].includes(tab) && <Unavailable title={`${tab} module is disabled`} description={`This tenant connection has not enabled the dedicated ${tab.toLowerCase()} module or its least-privilege Graph permissions.`} />}
          {tab === "Audit Log" && <SimpleTable rows={account.auditEvents} columns={["createdAt", "action", "targetType", "result"]} />}
        </div>
      </section>
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <dl className="definition"><dt>{label}</dt><dd>{value}</dd></dl>;
}

function SimpleTable({ rows, columns }: { rows: Array<Record<string, unknown>>; columns: string[] }) {
  if (!rows.length) return <EmptyState title="No records found" description="Microsoft returned no items for this section." />;
  return <div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{column.replace(/([A-Z])/g, " $1")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{column.endsWith("At") && row[column] ? new Date(String(row[column])).toLocaleString() : String(row[column] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}

function Unavailable({ title, description }: { title: string; description: string }) {
  return <EmptyState icon="◇" title={title} description={description} />;
}
