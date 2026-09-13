"use client";

import { Activity, Cloud, Inbox, KeyRound, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/components/api";
import { EmptyState, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Account = { id: string; displayName: string | null; userPrincipalName: string | null; authorizationStatus: string; lastSuccessfulGraphAt: string | null };
type AuditEvent = { id: string; action: string; targetType: string; result: string; createdAt: string; actor?: { displayName: string | null; email: string } | null };
type Deployment = { id: string; hostname: string; status: string; accessPolicy: unknown; createdAt: string; deployedAt: string | null; project: { name: string } };
type DashboardData = { metrics: Record<string, number>; health: Record<string, string>; connections: Account[]; recentEvents: AuditEvent[]; recentMailActivity: AuditEvent[]; recentDeployments: Deployment[] };

export function AdminDashboard() {
  const { notify } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setData(await api<DashboardData>("/dashboard")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load dashboard"); }
  }
  useEffect(() => { void load(); }, []);

  async function startConnection() {
    setBusy(true); setError("");
    try {
      const result = await api<{ connectUrl: string }>("/microsoft/device/start", { method: "POST", body: "{}" });
      window.location.assign(result.connectUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start authorization");
      notify({ title: "Connection could not start", message: caught instanceof Error ? caught.message : undefined, tone: "error" });
      setBusy(false);
    }
  }

  const metrics = data?.metrics ?? {};
  const cards = [
    { label: "Connected Accounts", value: metrics.connectedAccounts ?? 0, detail: `${metrics.healthyConnections ?? 0} healthy`, icon: UsersRound, tone: "blue" },
    { label: "Healthy Connections", value: metrics.healthyConnections ?? 0, detail: `${metrics.reauthenticationRequired ?? 0} require attention`, icon: Activity, tone: "green" },
    { label: "Unread Mail", value: metrics.unreadMail ?? 0, detail: "Across connected inboxes", icon: Inbox, tone: "violet" },
    { label: "Published Pages", value: metrics.activeDeployments ?? 0, detail: `${metrics.htmlProjects ?? 0} total projects`, icon: Cloud, tone: "cyan" },
    { label: "Active Access Codes", value: metrics.activeAccessCodes ?? 0, detail: "Non-expired application codes", icon: KeyRound, tone: "amber" },
  ] as const;

  return <div className="dashboard-page">
    <div className="page-header">
      <div><div className="eyebrow">Workspace overview</div><h1>Good evening, Administrator</h1><p className="muted">Microsoft connections, mail operations, published pages, and security activity.</p></div>
      <div className="page-actions"><Link className="button secondary" href="/admin/diagnostics"><Activity size={15} />Diagnostics</Link><button disabled={busy} onClick={() => void startConnection()}><Plus size={15} />{busy ? "Requesting…" : "Connect account"}</button></div>
    </div>
    {error && <div className="inline-alert error" role="alert">{error}</div>}
    <section className="metric-grid" aria-label="Operational metrics">
      {!data ? Array.from({ length: 5 }, (_, index) => <div className="metric-card" key={index}><Skeleton lines={2} /></div>) : cards.map(({ label, value, detail, icon: Icon, tone }) => <article className={`metric-card metric-${tone}`} key={label}><div className="metric-top"><span className="metric-icon"><Icon size={16} /></span><span className="metric-trend">Live</span></div><div className="metric-value">{value.toLocaleString()}</div><div className="metric-label">{label}</div><div className="metric-detail">{detail}</div></article>)}
    </section>
    <div className="dashboard-sections">
      <section className="panel dashboard-connections">
        <header className="panel-header"><div><h2>Recent Microsoft connections</h2><small>Connected employee identities</small></div><Link href="/admin/accounts">View all</Link></header>
        {!data ? <div className="panel-body"><Skeleton lines={4} /></div> : data.connections.length === 0 ? <EmptyState icon="◎" title="No Microsoft accounts" description="Start the official Microsoft device-code flow to connect an employee mailbox." action={<button onClick={() => void startConnection()}>Connect account</button>} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Status</th><th>Last Graph activity</th><th /></tr></thead><tbody>{data.connections.map((account) => <tr key={account.id}><td><div className="identity-cell"><span className="avatar">{(account.displayName ?? account.userPrincipalName ?? "?")[0]}</span><span><strong>{account.displayName ?? "Unnamed account"}</strong><small>{account.userPrincipalName}</small></span></div></td><td><StatusBadge status={account.authorizationStatus} /></td><td>{account.lastSuccessfulGraphAt ? new Date(account.lastSuccessfulGraphAt).toLocaleString() : "No activity yet"}</td><td><Link className="table-action" href={`/mail/${account.id}`}>Open mail</Link></td></tr>)}</tbody></table></div>}
      </section>
      <HealthPanel health={data?.health} />
      <ActivityPanel title="Recent mail activity" events={data?.recentMailActivity} empty="No mail operations recorded yet." />
      <DeploymentPanel deployments={data?.recentDeployments} />
      <ActivityPanel title="Recent audit events" events={data?.recentEvents} empty="No audit activity recorded yet." audit />
    </div>
  </div>;
}

function HealthPanel({ health }: { health?: Record<string, string> }) {
  return <section className="panel dashboard-health"><header className="panel-header"><div><h2>System health</h2><small>Current service readiness</small></div><Link href="/admin/diagnostics">Details</Link></header><div className="health-list">{health ? Object.entries(health).map(([service, status]) => <div key={service}><span><i className={status === "HEALTHY" || status === "CONFIGURED" ? "health-ok" : "health-warn"} />{friendly(service)}</span><StatusBadge status={status} /></div>) : <div className="panel-body"><Skeleton lines={4} /></div>}</div></section>;
}
function ActivityPanel({ title, events, empty, audit = false }: { title: string; events?: AuditEvent[]; empty: string; audit?: boolean }) {
  return <section className={`panel ${audit ? "dashboard-audit" : ""}`}><header className="panel-header"><div><h2>{title}</h2><small>{audit ? "Security and administrative operations" : "Graph-backed message operations"}</small></div>{audit && <Link href="/admin/audit">View all</Link>}</header>{!events ? <div className="panel-body"><Skeleton lines={4} /></div> : events.length === 0 ? <p className="compact-empty">{empty}</p> : <div className="activity-list">{events.map((event) => <div key={event.id}><span className="activity-mark">{event.action.startsWith("mail.") ? <Inbox size={14} /> : <Activity size={14} />}</span><div><strong>{friendly(event.action)}</strong><small>{event.actor?.displayName ?? event.actor?.email ?? "System"} · {event.targetType}</small></div><aside><StatusBadge status={event.result} /><time>{relativeTime(event.createdAt)}</time></aside></div>)}</div>}</section>;
}
function DeploymentPanel({ deployments }: { deployments?: Deployment[] }) {
  return <section className="panel"><header className="panel-header"><div><h2>Recent deployments</h2><small>Cloudflare-hosted HTML pages</small></div><Link href="/admin/deployments">View all</Link></header>{!deployments ? <div className="panel-body"><Skeleton lines={4} /></div> : deployments.length === 0 ? <p className="compact-empty">No pages have been deployed.</p> : <div className="activity-list">{deployments.map((deployment) => <div key={deployment.id}><span className="activity-mark"><Cloud size={14} /></span><div><strong>{deployment.project.name}</strong><small>{deployment.hostname}</small></div><aside><StatusBadge status={deployment.status} /><time>{relativeTime(deployment.deployedAt ?? deployment.createdAt)}</time></aside></div>)}</div>}</section>;
}
function friendly(value: string) { return value.replaceAll(".", " ").replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function relativeTime(value: string) { const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000); return minutes < 1 ? "Now" : minutes < 60 ? `${minutes}m ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1_440)}d ago`; }
