"use client";

import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { ConfirmDialog, EmptyState, Modal, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Deployment = { id: string; hostname: string; status: string; createdAt: string; deployedAt: string | null; expiresAt: string | null; accessPolicy: { type?: string } | null; project: { name: string; status: string } };
type Project = { id: string; name: string; status: string };
type Status = { configured: boolean; accountId: string | null; zoneId: string | null; baseDomain: string | null; apiToken: string; connectivity: string; accountName?: string; error?: string };

export function CloudflareDeployments() {
  const { notify } = useToast();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [deployOpen, setDeployOpen] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [removing, setRemoving] = useState<Deployment | null>(null);

  async function load() {
    try {
      const [deploymentData, projectData, statusData] = await Promise.all([
        api<{ deployments: Deployment[] }>("/cloudflare"),
        api<{ projects: Project[] }>("/html-projects"),
        api<Status>("/cloudflare/status"),
      ]);
      setDeployments(deploymentData.deployments); setProjects(projectData.projects); setStatus(statusData);
    } catch (error) { notify({ title: "Cloudflare dashboard unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function deploy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ accessCode?: string }>("/cloudflare", { method: "POST", body: JSON.stringify({ projectId: data.get("projectId"), policy: data.get("policy"), expiresAt: data.get("expiresAt") || undefined }) });
      setDeployOpen(false); if (result.accessCode) setAccessCode(result.accessCode); await load(); notify({ title: "Deployment published", tone: "success" });
    } catch (error) { notify({ title: "Deployment failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  async function action(deployment: Deployment, value: "ENABLE" | "DISABLE" | "REDEPLOY") {
    try { await api(`/cloudflare/${deployment.id}`, { method: "PATCH", body: JSON.stringify({ action: value }) }); await load(); notify({ title: `Deployment ${value.toLowerCase()}d`, tone: "success" }); }
    catch (error) { notify({ title: "Deployment action failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  async function remove() {
    if (!removing) return;
    try { await api(`/cloudflare/${removing.id}`, { method: "DELETE" }); setRemoving(null); await load(); notify({ title: "Deployment deleted", tone: "success" }); }
    catch (error) { notify({ title: "Delete failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }

  return <>
    <div className="page-header"><div><h1>Cloudflare deployments</h1><p className="muted">One wildcard Worker, centralized KV content and collision-safe hostnames</p></div><button disabled={!status?.configured} onClick={() => setDeployOpen(true)}>+ Create deployment</button></div>
    <section className="metric-grid" style={{ marginBottom: "1rem" }}><article className="metric-card"><div className="metric-label">Configuration</div><div className="metric-value" style={{ fontSize: "1rem" }}><StatusBadge status={status?.configured ? "Configured" : "Not configured"} /></div><div className="metric-detail">API token: {status?.apiToken ?? "Unknown"}</div></article><article className="metric-card"><div className="metric-label">Cloudflare account</div><div className="metric-value" style={{ fontSize: "1rem" }}>{status?.accountName ?? status?.accountId ?? "Not configured"}</div><div className="metric-detail">{status?.connectivity ?? "Not tested"}</div></article><article className="metric-card"><div className="metric-label">Base domain</div><div className="metric-value" style={{ fontSize: "1rem" }}>{status?.baseDomain ?? "Not configured"}</div><div className="metric-detail">Wildcard routing required</div></article><article className="metric-card"><div className="metric-label">Active deployments</div><div className="metric-value">{deployments.filter((item) => item.status === "ACTIVE").length}</div><div className="metric-detail">{deployments.length} total records</div></article></section>
    {!status?.configured && !loading && <div className="security-warning"><strong>Customer configuration required.</strong> Add the Cloudflare account, zone, base domain and least-privilege API token on the server. The token is never returned here.</div>}
    <section className="panel">{loading ? <div className="panel-body"><Skeleton lines={7} /></div> : !deployments.length ? <EmptyState icon="☁" title="No deployments" description={status?.configured ? "Publish an HTML project to a secure random hostname." : "Complete server-side Cloudflare configuration before publishing."} action={status?.configured ? <button onClick={() => setDeployOpen(true)}>Create deployment</button> : undefined} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Hostname</th><th>Project</th><th>Status</th><th>Access policy</th><th>Created</th><th>Last deployment</th><th>Expires</th><th /></tr></thead><tbody>{deployments.map((deployment) => <tr key={deployment.id}><td><a href={`https://${deployment.hostname}`} target="_blank" rel="noopener noreferrer">{deployment.hostname} ↗</a></td><td>{deployment.project.name}</td><td><StatusBadge status={deployment.status} /></td><td>{deployment.accessPolicy?.type?.replaceAll("_", " ") ?? "PUBLIC"}</td><td>{new Date(deployment.createdAt).toLocaleString()}</td><td>{deployment.deployedAt ? new Date(deployment.deployedAt).toLocaleString() : "Never"}</td><td>{deployment.expiresAt ? new Date(deployment.expiresAt).toLocaleString() : "Never"}</td><td><details className="action-menu"><summary>•••</summary><div><button onClick={() => void navigator.clipboard.writeText(`https://${deployment.hostname}`)}>Copy URL</button><button onClick={() => void action(deployment, "REDEPLOY")}>Redeploy</button><button onClick={() => void action(deployment, deployment.status === "ACTIVE" ? "DISABLE" : "ENABLE")}>{deployment.status === "ACTIVE" ? "Disable" : "Enable"}</button><button className="error" onClick={() => setRemoving(deployment)}>Delete</button></div></details></td></tr>)}</tbody></table></div>}</section>
    <Modal open={deployOpen} title="Create Cloudflare deployment" onClose={() => setDeployOpen(false)}><form className="stack" onSubmit={deploy}><label>HTML project<select name="projectId" required>{projects.map((project) => <option value={project.id} key={project.id}>{project.name} ({project.status})</option>)}</select></label><label>Access policy<select name="policy"><option value="PUBLIC">Public</option><option value="ACCESS_CODE">Access-code protected</option></select></label><label>Expiration (optional)<input name="expiresAt" type="datetime-local" /></label><p className="muted">A cryptographically random hostname is generated and checked for collisions. Protected deployments generate a new 15-character code shown once.</p><div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="secondary" onClick={() => setDeployOpen(false)}>Cancel</button><button>Deploy project</button></div></form></Modal>
    <Modal open={Boolean(accessCode)} title="Copy deployment access code" onClose={() => setAccessCode("")}><div className="stack"><p className="muted">This plaintext code is shown once. Store it securely before closing.</p><div className="device-code" style={{ fontSize: "1.55rem" }}>{accessCode}</div><button onClick={() => void navigator.clipboard.writeText(accessCode)}>Copy code</button></div></Modal>
    <ConfirmDialog open={Boolean(removing)} title="Delete deployment?" description={`Remove ${removing?.hostname ?? ""} from centralized Cloudflare storage?`} confirmLabel="Delete deployment" destructive onClose={() => setRemoving(null)} onConfirm={() => void remove()} />
  </>;
}
