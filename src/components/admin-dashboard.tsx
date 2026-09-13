"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/components/api";
import { EmptyState, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Account = {
  id: string;
  displayName: string | null;
  userPrincipalName: string | null;
  tenantId: string;
  microsoftUserId: string;
  authorizationStatus: string;
  lastSuccessfulGraphAt: string | null;
  grantedScopes: string[];
};

type AuditEvent = {
  id: string;
  action: string;
  targetType: string;
  result: string;
  createdAt: string;
  actor?: { displayName: string | null; email: string } | null;
};

export function AdminDashboard() {
  const { notify } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [health, setHealth] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await api<{ metrics: Record<string, number>; health: Record<string, string>; connections: Account[]; recentEvents: AuditEvent[] }>("/dashboard");
      setAccounts(data.connections);
      setEvents(data.recentEvents);
      setMetrics(data.metrics);
      setHealth(data.health);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function startConnection() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ connectUrl: string }>("/microsoft/device/start", {
        method: "POST",
        body: "{}",
      });
      window.location.assign(result.connectUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start authorization");
      notify({ title: "Connection could not start", message: caught instanceof Error ? caught.message : undefined, tone: "error" });
      setBusy(false);
    }
  }

  const metricCards = [
    ["Connected Microsoft accounts", metrics.connectedAccounts ?? 0, "Total managed identities", "#6e8cff"],
    ["Healthy connections", metrics.healthyConnections ?? 0, "Graph reachable now", "#1aa47f"],
    ["Reauthentication required", metrics.reauthenticationRequired ?? 0, "Needs employee action", "#e49424"],
    ["Unread mail", metrics.unreadMail ?? 0, "Across healthy mailboxes", "#7358db"],
    ["Shared mailboxes", metrics.sharedMailboxes ?? 0, "Discovery not configured", "#637289"],
    ["Recent sends", metrics.recentSends ?? 0, "Last 24 hours", "#3885cf"],
    ["Active deployments", metrics.activeDeployments ?? 0, "Cloudflare-hosted pages", "#e06f31"],
    ["HTML projects", metrics.htmlProjects ?? 0, `${metrics.activeAccessCodes ?? 0} active access codes`, "#a357b5"],
  ] as const;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Operations overview</h1>
          <p className="muted">Microsoft services, deployment activity and security posture</p>
        </div>
        <div className="page-actions"><Link className="button secondary" href="/admin/diagnostics">Run diagnostics</Link><button disabled={busy} onClick={startConnection}>{busy ? "Requesting code…" : "+ Connect account"}</button></div>
      </div>
      {error && <div className="card error" role="alert">{error}</div>}
      <section className="metric-grid" aria-label="Operational metrics">
        {loading ? Array.from({ length: 8 }, (_, index) => <div className="metric-card" key={index}><Skeleton lines={2} /></div>) : metricCards.map(([label, value, detail, color]) => (
          <article className="metric-card" style={{ "--metric-color": color } as React.CSSProperties} key={label}><div className="metric-label">{label}</div><div className="metric-value">{value.toLocaleString()}</div><div className="metric-detail">{detail}</div></article>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <header className="panel-header"><h2>Microsoft connections</h2><Link href="/admin/accounts">View all →</Link></header>
          {loading ? <div className="panel-body"><Skeleton lines={4} /></div> : accounts.length === 0 ? <EmptyState icon="◎" title="No Microsoft accounts" description="Create a secure device-code session to connect the first employee mailbox." action={<button onClick={startConnection}>Connect account</button>} /> : (
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Status</th><th>Last activity</th><th /></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><strong>{account.displayName ?? "Unnamed account"}</strong><br /><small className="muted">{account.userPrincipalName}</small></td><td><StatusBadge status={account.authorizationStatus} /></td><td>{account.lastSuccessfulGraphAt ? new Date(account.lastSuccessfulGraphAt).toLocaleString() : "Never"}</td><td><Link className="button secondary button-sm" href={`/mail/${account.id}`}>Open mail</Link></td></tr>)}</tbody></table></div>
          )}
        </section>
        <section className="panel">
          <header className="panel-header"><h2>Service health</h2><Link href="/admin/diagnostics">Details</Link></header>
          <div className="panel-body stack">{Object.entries(health).map(([service, status]) => <div className="row between" key={service}><span>{service.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</span><StatusBadge status={status} /></div>)}</div>
        </section>
        <section className="panel">
          <header className="panel-header"><h2>Recent security and audit events</h2><Link href="/admin/audit">Open audit log →</Link></header>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Actor</th><th>Action</th><th>Target</th><th>Result</th><th>Time</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.actor?.displayName ?? event.actor?.email ?? "System"}</td><td>{event.action}</td><td>{event.targetType}</td><td><StatusBadge status={event.result} /></td><td>{new Date(event.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>
        </section>
        <section className="panel">
          <header className="panel-header"><h2>Quick actions</h2></header>
          <div className="panel-body stack"><button onClick={startConnection}>Connect Microsoft account</button><Link className="button secondary" href="/admin/access-codes">Generate access code</Link><Link className="button secondary" href="/admin/html-projects">Create HTML project</Link></div>
        </section>
      </div>
    </div>
  );
}
