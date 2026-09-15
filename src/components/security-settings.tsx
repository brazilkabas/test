"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/components/api";
import { ConfirmDialog, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type SecurityData = {
  sessions: Array<{ id: string; createdAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; roleOverride: string | null; user: { displayName: string | null; email: string } }>;
  roles: Array<{ role: string; permissions: string[]; assignedUsers: number }>;
  policies: Record<string, number>;
  encryption: { configured: boolean; algorithm: string; keyVersion: number };
  microsoftConnections: Array<{ status: string; count: number }>;
  cloudflare: { configured: boolean; apiToken: string };
  rateLimit: { trackedClients: number; storage: string };
};

export function SecuritySettings() {
  const { notify } = useToast();
  const [data, setData] = useState<SecurityData | null>(null);
  const [revoke, setRevoke] = useState<SecurityData["sessions"][number] | null>(null);
  async function load() {
    try { setData(await api<SecurityData>("/security")); }
    catch (error) { notify({ title: "Security state unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function revokeSession() {
    if (!revoke) return;
    try { await api(`/sessions/${revoke.id}`, { method: "DELETE" }); setRevoke(null); await load(); notify({ title: "Session revoked", tone: "success" }); }
    catch (error) { notify({ title: "Session revoke failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  if (!data) return <section className="panel panel-body"><Skeleton lines={10} /></section>;
  return <>
    <div className="page-header"><div><h1>Security and access</h1><p className="muted">Application controls and safe configuration state—secret values are never shown</p></div><div className="row"><Link className="button secondary" href="/admin/ai-code">AI Code</Link><Link className="button secondary" href="/admin/settings/brand-assets">Brand Assets</Link><Link className="button secondary" href="/admin/settings/cloudflare">Cloudflare</Link></div></div>
    <section className="metric-grid"><article className="metric-card"><div className="metric-label">Encryption</div><div className="metric-value" style={{ fontSize: "1rem" }}><StatusBadge status={data.encryption.configured ? "Configured" : "Missing"} /></div><div className="metric-detail">{data.encryption.algorithm} · key v{data.encryption.keyVersion}</div></article><article className="metric-card"><div className="metric-label">Active sessions</div><div className="metric-value">{data.sessions.length}</div><div className="metric-detail">{data.policies.sessionDurationHours}-hour maximum</div></article><article className="metric-card"><div className="metric-label">Access-code policy</div><div className="metric-value">{data.policies.accessCodeLength}</div><div className="metric-detail">characters · {data.policies.maxLoginAttempts} attempts/{data.policies.rateLimitWindowMinutes} min</div></article><article className="metric-card"><div className="metric-label">Cloudflare secret</div><div className="metric-value" style={{ fontSize: "1rem" }}><StatusBadge status={data.cloudflare.configured ? "Configured" : "Not configured"} /></div><div className="metric-detail">Token: {data.cloudflare.apiToken}</div></article></section>
    <section className="panel" style={{ marginTop: "1rem" }}><header className="panel-header"><h2>Active administrator sessions</h2></header><div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>IP</th><th>Role override</th><th>Created</th><th>Expires</th><th /></tr></thead><tbody>{data.sessions.map((session) => <tr key={session.id}><td>{session.user.displayName ?? session.user.email}<br /><small className="muted">{session.userAgent}</small></td><td>{session.ipAddress ?? "—"}</td><td>{session.roleOverride?.replaceAll("_", " ") ?? "User roles"}</td><td>{new Date(session.createdAt).toLocaleString()}</td><td>{new Date(session.expiresAt).toLocaleString()}</td><td><button className="secondary button-sm" onClick={() => setRevoke(session)}>Revoke</button></td></tr>)}</tbody></table></div></section>
    <section className="panel" style={{ marginTop: "1rem" }}><header className="panel-header"><h2>Internal role permission matrix</h2></header><div className="table-wrap"><table className="data-table"><thead><tr><th>Role</th><th>Internal permissions</th><th>Assigned users</th><th>Microsoft boundary</th></tr></thead><tbody>{data.roles.map((role) => <tr key={role.role}><td><strong>{role.role.replaceAll("_", " ")}</strong></td><td><div className="row">{role.permissions.map((permission) => <code className="badge" key={permission}>{permission}</code>)}</div></td><td>{role.assignedUsers}</td><td>Still requires delegated Microsoft scopes and mailbox rights</td></tr>)}</tbody></table></div></section>
    <section className="panel" style={{ marginTop: "1rem" }}><header className="panel-header"><h2>Operational security notes</h2></header><div className="panel-body definition-grid"><dl className="definition"><dt>Rate-limit storage</dt><dd>{data.rateLimit.storage.replaceAll("_", " ")} ({data.rateLimit.trackedClients} tracked)</dd></dl><dl className="definition"><dt>Microsoft connections</dt><dd>{data.microsoftConnections.map((item) => `${item.status}: ${item.count}`).join(", ") || "None"}</dd></dl><dl className="definition"><dt>Authentication boundary</dt><dd>Microsoft MFA and Conditional Access remain Microsoft-controlled.</dd></dl></div></section>
    <ConfirmDialog open={Boolean(revoke)} title="Revoke administrator session?" description="The selected browser session will be denied on its next authenticated request." confirmLabel="Revoke session" destructive onClose={() => setRevoke(null)} onConfirm={() => void revokeSession()} />
  </>;
}
