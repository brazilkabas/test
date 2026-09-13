"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { EmptyState, Modal, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Project = { id: string; name: string; slug: string; status: string; updatedAt: string; createdBy: { displayName: string | null; email: string }; versions: Array<{ version: number; createdAt: string }>; deployments: Array<{ hostname: string; status: string; deployedAt: string | null }> };

export function HtmlProjects() {
  const router = useRouter();
  const { notify } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    try {
      const data = await api<{ projects: Project[]; templates: Array<{ id: string; name: string }> }>("/html-projects");
      setProjects(data.projects); setTemplates(data.templates);
    } catch (error) { notify({ title: "Projects unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ project: { id: string } }>("/html-projects", { method: "POST", body: JSON.stringify({ name: data.get("name"), template: data.get("template") }) });
      router.push(`/admin/html-projects/${result.project.id}`);
    } catch (error) { notify({ title: "Project not created", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }

  async function duplicate(project: Project) {
    try { await api(`/html-projects/${project.id}/duplicate`, { method: "POST", body: "{}" }); await load(); notify({ title: "Project duplicated", tone: "success" }); }
    catch (error) { notify({ title: "Duplicate failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }

  return <>
    <div className="page-header"><div><h1>HTML projects</h1><p className="muted">Branded internal documents and microsites—never credential collection pages</p></div><button onClick={() => setCreateOpen(true)}>+ New project</button></div>
    <section className="panel">{loading ? <div className="panel-body"><Skeleton lines={6} /></div> : projects.length === 0 ? <EmptyState icon="▤" title="No HTML projects" description="Start from an editable company template or a blank page." action={<button onClick={() => setCreateOpen(true)}>Create project</button>} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Project</th><th>Status</th><th>Version</th><th>Created by</th><th>Modified</th><th>Deployment</th><th /></tr></thead><tbody>{projects.map((project) => <tr key={project.id}><td><strong>{project.name}</strong><br /><small className="muted">{project.slug}</small></td><td><StatusBadge status={project.status} /></td><td>v{project.versions[0]?.version ?? 0}</td><td>{project.createdBy.displayName ?? project.createdBy.email}</td><td>{new Date(project.updatedAt).toLocaleString()}</td><td>{project.deployments[0] ? <><StatusBadge status={project.deployments[0].status} /><br /><small>{project.deployments[0].hostname}</small></> : "Not deployed"}</td><td><div className="row"><Link className="button secondary button-sm" href={`/admin/html-projects/${project.id}`}>Edit</Link><button className="secondary button-sm" onClick={() => void duplicate(project)}>Duplicate</button></div></td></tr>)}</tbody></table></div>}</section>
    <Modal open={createOpen} title="Create HTML project" onClose={() => setCreateOpen(false)}><form className="stack" onSubmit={create}><label>Project name<input name="name" maxLength={120} required autoFocus /></label><label>Starter template<select name="template">{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label><p className="muted">Templates are company-branded starting points and do not imitate third-party login experiences.</p><div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="secondary" onClick={() => setCreateOpen(false)}>Cancel</button><button>Create project</button></div></form></Modal>
  </>;
}
