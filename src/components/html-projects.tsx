"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { api } from "@/components/api";
import { EmptyState, Modal, Skeleton, StatusBadge, useToast } from "@/components/design-system";
import { buildPageDesign, defaultBuilderConfiguration, providerProfiles } from "@/lib/builder-designs";
import { renderPageDocument, type BuilderConfiguration, type PageDocument } from "@/lib/page-document";
import { visualTemplates } from "@/lib/visual-templates";

type Project = {
  id: string; name: string; slug: string; templateId: string; status: string; updatedAt: string;
  createdBy: { displayName: string | null; email: string };
  versions: Array<{ version: number; createdAt: string; document: PageDocument | null }>;
  deployments: Array<{ hostname: string; status: string; deployedAt: string | null }>;
};

export function HtmlProjects() {
  const router = useRouter();
  const { notify } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewId, setPreviewId] = useState<BuilderConfiguration["layoutId"] | null>(null);
  const [provider, setProvider] = useState<BuilderConfiguration["provider"]>("microsoft365");

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
      const result = await api<{ project: { id: string } }>("/html-projects", { method: "POST", body: JSON.stringify({ name: data.get("name"), template: data.get("template"), provider }) });
      router.push(`/admin/html-projects/${result.project.id}`);
    } catch (error) { notify({ title: "Page not created", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  async function duplicate(project: Project) {
    try { await api(`/html-projects/${project.id}/duplicate`, { method: "POST", body: "{}" }); await load(); notify({ title: "Page duplicated", tone: "success" }); }
    catch (error) { notify({ title: "Duplicate failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }

  return <>
    <div className="page-header"><div><div className="eyebrow">Visual publishing</div><h1>HTML Pages</h1><p className="muted">Provider-aware pages with ten finished designs, live responsive previews, and Cloudflare publishing.</p></div><button onClick={() => setCreateOpen(true)}>+ New page</button></div>
    <section className="panel">{loading ? <div className="panel-body"><Skeleton lines={6} /></div> : projects.length === 0 ? <EmptyState icon="▤" title="Create your first page" description="Choose a provider and one of ten finished layouts. No HTML knowledge is required." action={<button onClick={() => setCreateOpen(true)}>Browse designs</button>} /> : <div className="project-gallery">{projects.map((project) => {
      const template = visualTemplates.find((item) => item.id === project.templateId);
      const document = project.versions[0]?.document ?? template?.document;
      const projectProvider = document?.settings.builder?.provider ?? "microsoft365";
      return <article className="project-card" key={project.id}>
        <ProjectThumbnail document={document} />
        <div className="project-card-body"><div className="row between"><StatusBadge status={project.status} /><small>v{project.versions[0]?.version ?? 0}</small></div><h2>{project.name}</h2><p>{providerProfiles[projectProvider].name} · {template?.name ?? project.templateId}</p><dl><div><dt>Updated</dt><dd>{new Date(project.updatedAt).toLocaleDateString()}</dd></div><div><dt>Visibility</dt><dd>{project.deployments[0]?.status ?? "Draft only"}</dd></div></dl>{project.deployments[0] && <a href={`https://${project.deployments[0].hostname}`} target="_blank" rel="noopener noreferrer">{project.deployments[0].hostname} ↗</a>}<div className="row"><Link className="button button-sm" href={`/admin/html-projects/${project.id}`}>Edit</Link><Link className="button secondary button-sm" href={`/admin/html-projects/${project.id}?publish=true`}>Publish</Link><button className="secondary button-sm" onClick={() => void duplicate(project)}>Duplicate</button></div></div>
      </article>;
    })}</div>}</section>
    <Modal open={createOpen} title="Choose a page design" onClose={() => setCreateOpen(false)}>
      <div className="template-gallery">
        <div className="gallery-provider-picker"><div><strong>Provider identity</strong><small>Select a provider, then choose one of exactly ten finished designs.</small></div><select value={provider} onChange={(event) => setProvider(event.target.value as BuilderConfiguration["provider"])}>{Object.entries(providerProfiles).map(([id, profile]) => <option value={id} key={id}>{profile.name}</option>)}</select></div>
        <div className="template-grid">{visualTemplates.map((template) => <article className="template-card" key={template.id}><TemplateThumbnail templateId={template.id} provider={provider} /><div><span className="badge">{providerProfiles[provider].name}</span><h3>{template.name}</h3><p>{template.description}</p><small>{template.layout}</small><div className="row"><button className="secondary button-sm" onClick={() => setPreviewId(template.id)}>Preview</button><button className="button-sm" onClick={() => (document.getElementById(`create-${template.id}`) as HTMLFormElement).requestSubmit()}>Use Design</button></div><form id={`create-${template.id}`} onSubmit={create}><input type="hidden" name="template" value={template.id} /><label>Page name<input name="name" required defaultValue={`${providerProfiles[provider].name} — ${template.name}`} /></label></form></div></article>)}</div>
      </div>
    </Modal>
    <Modal open={Boolean(previewId)} title={`${providerProfiles[provider].name} · ${visualTemplates.find((item) => item.id === previewId)?.name ?? "Preview"}`} onClose={() => setPreviewId(null)}>{previewId && <div className="template-full-preview"><TemplatePreview templateId={previewId} provider={provider} /></div>}</Modal>
  </>;
}

function TemplateThumbnail({ templateId, provider }: { templateId: BuilderConfiguration["layoutId"]; provider: BuilderConfiguration["provider"] }) {
  const template = visualTemplates.find((item) => item.id === templateId)!;
  const rendered = renderPageDocument(buildPageDesign(defaultBuilderConfiguration(template.id, provider)), { deviceCode: "XXXX-XXXX" });
  return <div className="template-thumbnail" style={{ borderTopColor: template.accent }}><iframe title={`${template.name} thumbnail`} sandbox="" srcDoc={`<style>${rendered.css}body{margin:0;overflow:hidden}</style>${rendered.html}`} tabIndex={-1} /></div>;
}
function TemplatePreview({ templateId, provider }: { templateId: BuilderConfiguration["layoutId"]; provider: BuilderConfiguration["provider"] }) {
  const rendered = renderPageDocument(buildPageDesign(defaultBuilderConfiguration(templateId, provider)), { deviceCode: "XXXX-XXXX" });
  return <iframe title="Template preview" sandbox="" srcDoc={`<style>${rendered.css}</style>${rendered.html}`} />;
}
function ProjectThumbnail({ document }: { document?: PageDocument }) {
  if (!document) return <div className="project-thumbnail"><strong>Preview unavailable</strong></div>;
  const rendered = renderPageDocument(document, { deviceCode: "XXXX-XXXX" });
  return <div className="project-thumbnail rendered-project-thumbnail"><iframe title="Project thumbnail" sandbox="" srcDoc={`<style>${rendered.css}body{margin:0;overflow:hidden}</style>${rendered.html}`} tabIndex={-1} /></div>;
}
