"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/components/api";
import { ConfirmDialog, Skeleton, StatusBadge, useToast } from "@/components/design-system";

type Version = { id: string; version: number; html: string; css: string | null; javascript: string | null; createdAt: string };
type Project = { id: string; name: string; slug: string; status: string; versions: Version[] };
const blocks = [
  ["Heading", `<section class="card"><h2>Section heading</h2><p>Add supporting content here.</p></section>`],
  ["Text", `<section><p>Write clear, approved company information here.</p></section>`],
  ["Button", `<p><a class="button" href="https://company.example/">Open company resource</a></p>`],
  ["Image", `<figure class="card"><img src="https://images.example.com/approved-image.jpg" alt="Describe this image" style="max-width:100%"><figcaption>Image caption</figcaption></figure>`],
  ["Card", `<section class="card"><h2>Card title</h2><p>Card content</p></section>`],
  ["Table", `<table class="card" style="width:100%"><thead><tr><th>Item</th><th>Details</th></tr></thead><tbody><tr><td>Example</td><td>Approved information</td></tr></tbody></table>`],
  ["Divider", `<hr>`],
  ["Business form", `<form class="card"><label>Full name<input name="name" autocomplete="name"></label><label>Work email<input type="email" name="email" autocomplete="email"></label><label>Details<textarea name="details"></textarea></label><button>Submit</button></form>`],
] as const;

export function HtmlEditor({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [html, setHtml] = useState("");
  const [css, setCss] = useState("");
  const [javascript, setJavascript] = useState("");
  const [mode, setMode] = useState<"visual" | "html" | "css" | "javascript">("visual");
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  async function load() {
    try {
      const data = await api<{ project: Project }>(`/html-projects/${projectId}`);
      setProject(data.project);
      const latest = data.project.versions[0];
      setHtml(latest?.html ?? ""); setCss(latest?.css ?? ""); setJavascript(latest?.javascript ?? "");
    } catch (error) { notify({ title: "Editor unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const srcDoc = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; form-action 'none'; base-uri 'none'"><style>${css}</style></head><body>${html}</body></html>`, [css, html]);

  async function save() {
    setSaving(true);
    try { await api(`/html-projects/${projectId}/versions`, { method: "POST", body: JSON.stringify({ html, css, javascript: javascript || undefined }) }); await load(); notify({ title: "New version saved", tone: "success" }); }
    catch (error) { notify({ title: "Save failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
    finally { setSaving(false); }
  }
  async function publish() {
    try { await api(`/html-projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ status: project?.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" }) }); await load(); notify({ title: project?.status === "PUBLISHED" ? "Project returned to draft" : "Project marked published", message: "Cloudflare deployment is a separate explicit action.", tone: "success" }); }
    catch (error) { notify({ title: "Status update failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  function addBlock(snippet: string) { setHtml((value) => `${value}\n${snippet}`); notify({ title: "Block added", message: "Edit its content in the visual or HTML view.", tone: "success" }); }
  function exportHtml() {
    const output = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style></head><body>${html}${javascript ? `<script>${javascript}</script>` : ""}</body></html>`;
    const url = URL.createObjectURL(new Blob([output], { type: "text/html" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${project?.slug ?? "project"}.html`; anchor.click(); URL.revokeObjectURL(url);
  }
  async function archive() { await api(`/html-projects/${projectId}`, { method: "DELETE" }); router.push("/admin/html-projects"); }

  if (!project) return <section className="panel panel-body"><Skeleton lines={10} /></section>;
  return <>
    <div className="editor-header"><div><Link href="/admin/html-projects">← Projects</Link><div className="row"><h1>{project.name}</h1><StatusBadge status={project.status} /></div><small className="muted">Version {project.versions[0]?.version ?? 0} · {project.slug}</small></div><div className="page-actions"><button className="secondary" onClick={exportHtml}>Export HTML</button><button className="secondary" onClick={() => setArchiveOpen(true)}>Archive</button><button className="secondary" onClick={() => void publish()}>{project.status === "PUBLISHED" ? "Unpublish" : "Publish state"}</button><button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save new version"}</button></div></div>
    <div className="builder-shell">
      <aside className="block-palette"><h2>Content blocks</h2><p className="muted">Add and customize blocks</p>{blocks.map(([name, snippet]) => <button draggable onDragStart={(event) => event.dataTransfer.setData("text/html", snippet)} onClick={() => addBlock(snippet)} key={name}><span>＋</span>{name}</button>)}<h2>Version history</h2><div className="version-list">{project.versions.map((version) => <button key={version.id} onClick={() => { setHtml(version.html); setCss(version.css ?? ""); setJavascript(version.javascript ?? ""); }}><strong>v{version.version}</strong><small>{new Date(version.createdAt).toLocaleString()}</small></button>)}</div></aside>
      <section className="builder-editor">
        <nav className="tabs">{(["visual", "html", "css", "javascript"] as const).map((item) => <button className={mode === item ? "active" : ""} onClick={() => setMode(item)} key={item}>{item === "javascript" ? "JavaScript ⚠" : item.toUpperCase()}</button>)}</nav>
        {mode === "visual" && <div className="visual-editor" contentEditable suppressContentEditableWarning onInput={(event) => setHtml(event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: html }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addBlock(event.dataTransfer.getData("text/html")); }} />}
        {mode === "html" && <textarea className="code-editor" value={html} onChange={(event) => setHtml(event.target.value)} spellCheck={false} />}
        {mode === "css" && <textarea className="code-editor" value={css} onChange={(event) => setCss(event.target.value)} spellCheck={false} />}
        {mode === "javascript" && <div className="stack"><div className="security-warning"><strong>JavaScript is disabled in preview.</strong> Published scripts require an explicit security review and a deployment CSP that permits them. Never collect credentials or imitate third-party authentication.</div><textarea className="code-editor" value={javascript} onChange={(event) => setJavascript(event.target.value)} spellCheck={false} /></div>}
      </section>
      <aside className="preview-pane"><header><strong>Responsive preview</strong><div className="row">{(["desktop", "tablet", "mobile"] as const).map((item) => <button className={`icon-button ${viewport === item ? "active" : ""}`} title={item} onClick={() => setViewport(item)} key={item}>{item === "desktop" ? "▱" : item === "tablet" ? "▯" : "▯"}</button>)}</div></header><div className={`preview-frame preview-${viewport}`}><iframe title="Sandboxed project preview" sandbox="" srcDoc={srcDoc} /></div></aside>
    </div>
    <ConfirmDialog open={archiveOpen} title="Archive project?" description="The project remains in the audit trail but is removed from active editing lists." confirmLabel="Archive project" destructive onClose={() => setArchiveOpen(false)} onConfirm={() => void archive()} />
  </>;
}
