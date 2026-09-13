"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "@/components/api";
import { EmptyState, Modal, Skeleton, StatusBadge, useToast } from "@/components/design-system";
import { renderPageDocument } from "@/lib/page-document";
import { visualTemplates } from "@/lib/visual-templates";

type Project = { id: string; name: string; slug: string; templateId: string; status: string; updatedAt: string; createdBy: { displayName: string | null; email: string }; versions: Array<{ version: number; createdAt: string }>; deployments: Array<{ hostname: string; status: string; deployedAt: string | null }> };

export function HtmlProjects() {
  const router = useRouter();
  const { notify } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const categories = useMemo(() => ["All", ...new Set(visualTemplates.map((template) => template.category))], []);
  const templates = category === "All" ? visualTemplates : visualTemplates.filter((template) => template.category === category);

  async function load() {
    try { setProjects((await api<{ projects: Project[] }>("/html-projects")).projects); }
    catch (error) { notify({ title: "Projects unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
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
    <div className="page-header"><div><h1>Page Builder</h1><p className="muted">Create professional branded pages visually—no HTML required</p></div><button onClick={() => setCreateOpen(true)}>+ New page</button></div>
    <section className="panel">{loading ? <div className="panel-body"><Skeleton lines={6} /></div> : projects.length === 0 ? <EmptyState icon="▤" title="Create your first page" description="Choose a genuinely different visual layout, customize it, preview every viewport, and publish." action={<button onClick={() => setCreateOpen(true)}>Browse templates</button>} /> : <div className="project-gallery">{projects.map((project) => {
      const template = visualTemplates.find((item) => item.id === project.templateId);
      return <article className="project-card" key={project.id}><div className="project-thumbnail" style={{ background: `linear-gradient(135deg,${template?.accent ?? "#64748b"}22,${template?.accent ?? "#64748b"}55)` }}><span>{template?.layout ?? "Custom page"}</span><strong>{project.name}</strong></div><div className="project-card-body"><div className="row between"><StatusBadge status={project.status} /><small>v{project.versions[0]?.version ?? 0}</small></div><h2>{project.name}</h2><p>{template?.name ?? project.templateId}</p><dl><div><dt>Updated</dt><dd>{new Date(project.updatedAt).toLocaleDateString()}</dd></div><div><dt>Visibility</dt><dd>{project.deployments[0] ? project.deployments[0].status : "Draft only"}</dd></div></dl>{project.deployments[0] && <a href={`https://${project.deployments[0].hostname}`} target="_blank" rel="noopener noreferrer">{project.deployments[0].hostname} ↗</a>}<div className="row"><Link className="button button-sm" href={`/admin/html-projects/${project.id}`}>Edit visually</Link><button className="secondary button-sm" onClick={() => void duplicate(project)}>Duplicate</button></div></div></article>;
    })}</div>}</section>
    <Modal open={createOpen} title="Choose a page design" onClose={() => setCreateOpen(false)}>
      <div className="template-gallery">
        <div className="template-categories">{categories.map((item) => <button className={item === category ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
        <div className="template-grid">{templates.map((template) => <article className="template-card" key={template.id}><TemplateThumbnail templateId={template.id} /><div><span className="badge">{template.category}</span><h3>{template.name}</h3><p>{template.description}</p><small>{template.layout}</small><div className="row"><button className="secondary button-sm" onClick={() => setPreviewId(template.id)}>Preview</button><button className="button-sm" onClick={() => { const form = document.getElementById(`create-${template.id}`) as HTMLFormElement; form.requestSubmit(); }}>Use template</button></div><form id={`create-${template.id}`} onSubmit={create}><input type="hidden" name="template" value={template.id} /><label>Page name<input name="name" required defaultValue={template.name} /></label></form></div></article>)}</div>
      </div>
    </Modal>
    <Modal open={Boolean(previewId)} title={visualTemplates.find((item) => item.id === previewId)?.name ?? "Template preview"} onClose={() => setPreviewId(null)}>{previewId && <div className="template-full-preview"><TemplatePreview templateId={previewId} /></div>}</Modal>
  </>;
}

function TemplateThumbnail({ templateId }: { templateId: string }) {
  const template = visualTemplates.find((item) => item.id === templateId)!;
  const rendered = renderPageDocument(template.document);
  return <div className="template-thumbnail" style={{ borderTopColor: template.accent }}><iframe title={`${template.name} thumbnail`} sandbox="" srcDoc={`<style>${rendered.css}body{margin:0;transform:scale(.24);transform-origin:top left;width:416%;height:416%;overflow:hidden}</style>${rendered.html}`} tabIndex={-1} /></div>;
}
function TemplatePreview({ templateId }: { templateId: string }) {
  const rendered = renderPageDocument(visualTemplates.find((item) => item.id === templateId)!.document);
  return <iframe title="Template preview" sandbox="" srcDoc={`<style>${rendered.css}</style>${rendered.html}`} />;
}
