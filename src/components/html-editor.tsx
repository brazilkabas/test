"use client";
/* eslint-disable @next/next/no-img-element -- builder previews user-selected and authenticated project assets */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/components/api";
import { ConfirmDialog, Drawer, Modal, Skeleton, StatusBadge, useToast } from "@/components/design-system";
import { createId, type NodeStyle, type PageDocument, type PageNode, renderPageDocument } from "@/lib/page-document";
import { cloneDocument, getVisualTemplate } from "@/lib/visual-templates";

type Version = { id: string; version: number; document: PageDocument | null; html: string; css: string | null; javascript: string | null; state: string; editorId: string | null; createdAt: string };
type Asset = { id: string; name: string; contentType: string; size: number; kind: string; variant: string | null; createdAt: string };
type Project = { id: string; name: string; slug: string; status: string; templateId: string; versions: Version[]; deployments: Array<{ id: string; hostname: string; status: string }> };
type Viewport = "desktop" | "laptop" | "tablet" | "mobile";

const componentGroups = [
  { name: "Structure", items: [["section", "Section"], ["columns", "Columns"], ["card", "Card"], ["header", "Header"], ["footer", "Footer"], ["navigation", "Navigation"]] },
  { name: "Content", items: [["heading", "Heading"], ["text", "Paragraph"], ["button", "Button"], ["image", "Image"], ["divider", "Divider"], ["badge", "Badge"], ["callout", "Callout"], ["steps", "Instruction steps"]] },
  { name: "Integrations", items: [["providerLogo", "Provider logo"], ["resourceCard", "Provider resource card"], ["deviceCode", "Microsoft device code"], ["status", "Status"]] },
] as const;

export function HtmlEditor({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [document, setDocument] = useState<PageDocument | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"components" | "assets" | "layers">("components");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [preview, setPreview] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [customHtml, setCustomHtml] = useState("");
  const [customCss, setCustomCss] = useState("");
  const [javascript, setJavascript] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const [projectData, assetData] = await Promise.all([
        api<{ project: Project }>(`/html-projects/${projectId}`),
        api<{ assets: Asset[] }>(`/html-projects/${projectId}/assets`),
      ]);
      setProject(projectData.project);
      setAssets(assetData.assets);
      if (!loaded.current) {
        const latest = projectData.project.versions[0];
        setDocument(latest?.document ?? cloneDocument(getVisualTemplate(projectData.project.templateId).document));
        setCustomCss(latest?.css?.includes(".visual-page") ? "" : latest?.css ?? "");
        setJavascript(latest?.javascript ?? "");
        loaded.current = true;
      }
    } catch (error) {
      notify({ title: "Builder unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }, [notify, projectId]);
  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (quiet = false, state: "DRAFT" | "PUBLISHED" = "DRAFT") => {
    if (!document || saving) return;
    setSaving(true);
    try {
      await api(`/html-projects/${projectId}/versions`, { method: "POST", body: JSON.stringify({ document, customHtml, customCss, javascript: javascript || undefined, state }) });
      setDirty(false);
      await load();
      if (!quiet) notify({ title: state === "PUBLISHED" ? "Published version saved" : "Draft version saved", tone: "success" });
    } catch (error) {
      notify({ title: "Version was not saved", message: error instanceof Error ? error.message : undefined, tone: "error" });
    } finally { setSaving(false); }
  }, [customCss, customHtml, document, javascript, load, notify, projectId, saving]);

  useEffect(() => {
    if (!dirty || !document) return;
    const timer = window.setTimeout(() => void save(true), 5000);
    return () => window.clearTimeout(timer);
  }, [dirty, document, save]);

  const selected = document && selectedId ? findNode(document.nodes, selectedId) : null;
  function change(next: PageDocument) { setDocument(next); setDirty(true); }
  function updateSelected(patch: Partial<PageNode>) {
    if (!document || !selectedId) return;
    change({ ...document, nodes: mapNodes(document.nodes, selectedId, (node) => ({ ...node, ...patch })) });
  }
  function updateStyle(patch: Partial<NodeStyle>) {
    if (!selected) return;
    updateSelected({ style: { ...selected.style, ...patch } });
  }
  function add(type: PageNode["type"]) {
    if (!document) return;
    const node = defaultNode(type);
    const canContain = selected && ["section", "columns", "card", "header", "footer", "navigation", "callout", "resourceCard"].includes(selected.type);
    const nodes = canContain && selectedId
      ? mapNodes(document.nodes, selectedId, (target) => ({ ...target, children: [...(target.children ?? []), node] }))
      : [...document.nodes, node];
    change({ ...document, nodes });
    setSelectedId(node.id);
  }
  function removeSelected() {
    if (!document || !selectedId || selected?.locked) return;
    change({ ...document, nodes: removeNode(document.nodes, selectedId) });
    setSelectedId(null);
  }
  function duplicateSelected() {
    if (!document || !selected) return;
    const copy = cloneNode(selected);
    change({ ...document, nodes: insertAfter(document.nodes, selected.id, copy) });
    setSelectedId(copy.id);
  }
  function moveSelected(direction: -1 | 1) {
    if (!document || !selectedId) return;
    change({ ...document, nodes: moveNode(document.nodes, selectedId, direction) });
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    try {
      const result = await api<{ asset: Asset }>(`/html-projects/${projectId}/assets`, { method: "POST", body: JSON.stringify({ name: file.name, contentType: file.type, contentBytes: await fileBase64(file), kind: data.get("kind"), variant: data.get("variant") }) });
      setAssets((items) => [result.asset, ...items.filter((item) => item.id !== result.asset.id)]);
      form.reset();
      notify({ title: "Asset uploaded safely", tone: "success" });
    } catch (error) { notify({ title: "Upload failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
  }
  async function archive() {
    await api(`/html-projects/${projectId}`, { method: "DELETE" });
    router.push("/admin/html-projects");
  }
  function restore(version: Version) {
    if (!version.document) return;
    setDocument(structuredClone(version.document)); setDirty(true); setHistoryOpen(false); notify({ title: `Version ${version.version} loaded`, message: "Save to create a new restored version.", tone: "success" });
  }
  function exportHtml() {
    if (!document) return;
    const rendered = renderPageDocument(document, { assetUrl: (id) => `/api/v1/html-projects/${projectId}/assets/${id}` });
    download(`${project?.slug ?? "page"}.html`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${rendered.css}\n${customCss}</style></head><body>${rendered.html}${customHtml}</body></html>`, "text/html");
  }

  if (!project || !document) return <section className="panel panel-body"><Skeleton lines={12} /></section>;
  return <div className={`visual-builder ${preview ? "is-preview" : ""}`}>
    <header className="visual-builder-header">
      <div><Link href="/admin/html-projects">← Projects</Link><div className="row"><h1>{project.name}</h1><StatusBadge status={dirty ? "Unsaved changes" : project.status} /></div></div>
      <div className="viewport-switcher" aria-label="Preview width">{(["desktop", "laptop", "tablet", "mobile"] as Viewport[]).map((item) => <button className={viewport === item ? "active" : ""} onClick={() => setViewport(item)} key={item}>{viewportIcon(item)}<span>{item}</span></button>)}</div>
      <div className="page-actions"><button className="secondary" onClick={() => setHistoryOpen(true)}>History</button><button className="secondary" onClick={() => setPreview(!preview)}>{preview ? "Exit preview" : "Full preview"}</button><button className="secondary" onClick={() => void save(false)}>Save</button><button onClick={() => setPublishOpen(true)}>Publish</button></div>
    </header>
    <div className="visual-builder-grid">
      <aside className="builder-left">
        <nav className="mini-tabs"><button className={leftTab === "components" ? "active" : ""} onClick={() => setLeftTab("components")}>Components</button><button className={leftTab === "assets" ? "active" : ""} onClick={() => setLeftTab("assets")}>Assets</button><button className={leftTab === "layers" ? "active" : ""} onClick={() => setLeftTab("layers")}>Layers</button></nav>
        {leftTab === "components" && <div className="component-library">{componentGroups.map((group) => <section key={group.name}><h3>{group.name}</h3><div>{group.items.map(([type, label]) => <button draggable onDragStart={(event) => event.dataTransfer.setData("application/x-page-node", type)} onClick={() => add(type)} key={type}><span>{componentIcon(type)}</span>{label}</button>)}</div></section>)}</div>}
        {leftTab === "assets" && <AssetLibrary assets={assets} projectId={projectId} onUpload={upload} onChoose={(asset) => { if (selected?.type === "image") updateSelected({ assetId: asset.id, src: `/api/v1/html-projects/${projectId}/assets/${asset.id}`, alt: asset.name }); else { const image = defaultNode("image"); image.assetId = asset.id; image.src = `/api/v1/html-projects/${projectId}/assets/${asset.id}`; image.alt = asset.name; change({ ...document, nodes: [...document.nodes, image] }); setSelectedId(image.id); } }} />}
        {leftTab === "layers" && <LayerTree nodes={document.nodes} selectedId={selectedId} onSelect={setSelectedId} />}
        <button className="advanced-toggle" onClick={() => setAdvancedOpen(true)}>Advanced → Code</button>
      </aside>
      <main className="builder-stage" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const type = event.dataTransfer.getData("application/x-page-node") as PageNode["type"]; if (type) add(type); }}>
        <div className={`canvas-viewport canvas-${viewport}`} style={{ background: document.settings.background, color: document.settings.color, fontFamily: document.settings.fontFamily }}>
          {document.nodes.map((node) => <CanvasNode key={node.id} node={node} selectedId={selectedId} projectId={projectId} onSelect={setSelectedId} onText={(id, content) => { change({ ...document, nodes: mapNodes(document.nodes, id, (item) => ({ ...item, content })) }); }} />)}
        </div>
      </main>
      <aside className="builder-right">
        {selected ? <PropertiesPanel node={selected} assets={assets} projectId={projectId} onUpdate={updateSelected} onStyle={updateStyle} onDelete={removeSelected} onDuplicate={duplicateSelected} onMove={moveSelected} /> : <PageSettings document={document} onChange={change} project={project} onArchive={() => setArchiveOpen(true)} onExport={exportHtml} />}
      </aside>
    </div>
    <Drawer open={advancedOpen} title="Advanced code" onClose={() => setAdvancedOpen(false)}><div className="stack"><div className="security-warning"><strong>Advanced only.</strong> Normal editing does not require code. Custom JavaScript is stored but not executed in the visual preview or default Cloudflare Worker.</div><label>Additional HTML<textarea rows={10} value={customHtml} onChange={(event) => { setCustomHtml(event.target.value); setDirty(true); }} /></label><label>Additional CSS<textarea className="code-editor-small" rows={14} value={customCss} onChange={(event) => { setCustomCss(event.target.value); setDirty(true); }} /></label><label>Restricted JavaScript<textarea className="code-editor-small" rows={10} value={javascript} onChange={(event) => { setJavascript(event.target.value); setDirty(true); }} /></label></div></Drawer>
    <Drawer open={historyOpen} title="Version history" onClose={() => setHistoryOpen(false)}><div className="version-history">{project.versions.map((version) => <article key={version.id}><div><strong>Version {version.version}</strong><StatusBadge status={version.state} /><p>{new Date(version.createdAt).toLocaleString()}</p><small>Editor: {version.editorId ?? "Legacy version"}</small></div><div className="row"><button className="secondary button-sm" disabled={!version.document} onClick={() => restore(version)}>Restore</button><button className="secondary button-sm" disabled={!version.document} onClick={() => { if (version.document) setDocument(structuredClone(version.document)); setPreview(true); setHistoryOpen(false); }}>Preview</button></div></article>)}</div></Drawer>
    <PublishDialog open={publishOpen} project={project} document={document} onClose={() => setPublishOpen(false)} onSave={() => save(false, "PUBLISHED")} />
    <ConfirmDialog open={archiveOpen} title="Archive project?" description="The project will leave active lists. Published deployments must be disabled separately." confirmLabel="Archive" destructive onClose={() => setArchiveOpen(false)} onConfirm={() => void archive()} />
  </div>;
}

function CanvasNode({ node, selectedId, projectId, onSelect, onText }: { node: PageNode; selectedId: string | null; projectId: string; onSelect: (id: string) => void; onText: (id: string, value: string) => void }) {
  if (node.hidden) return null;
  const selected = node.id === selectedId;
  const common = { className: `canvas-node canvas-${node.type} ${selected ? "selected" : ""} ${node.locked ? "locked" : ""}`, style: node.style as React.CSSProperties, onClick: (event: React.MouseEvent) => { event.stopPropagation(); onSelect(node.id); }, "data-node-id": node.id };
  const children = node.children?.map((child) => <CanvasNode key={child.id} node={child} selectedId={selectedId} projectId={projectId} onSelect={onSelect} onText={onText} />);
  if (["section", "header", "footer", "card", "callout", "navigation", "columns"].includes(node.type)) return <div {...common}>{children?.length ? children : <span className="canvas-placeholder">Drop components here</span>}</div>;
  if (node.type === "heading") return <h2 {...common} contentEditable={!node.locked} suppressContentEditableWarning onBlur={(event) => onText(node.id, event.currentTarget.textContent ?? "")}>{node.content}</h2>;
  if (node.type === "text") return <p {...common} contentEditable={!node.locked} suppressContentEditableWarning onBlur={(event) => onText(node.id, event.currentTarget.textContent ?? "")}>{node.content}</p>;
  if (node.type === "button") return <button {...common} type="button" contentEditable={!node.locked} suppressContentEditableWarning onBlur={(event) => onText(node.id, event.currentTarget.textContent ?? "")}>{node.icon} {node.content}</button>;
  if (node.type === "image") return <div {...common}><img src={node.assetId ? `/api/v1/html-projects/${projectId}/assets/${node.assetId}` : node.src} alt={node.alt ?? ""} /></div>;
  if (node.type === "providerLogo") return <div {...common}><ProviderLogo provider={node.provider ?? "company"} /></div>;
  if (node.type === "deviceCode") return <div {...common}><small contentEditable={!node.locked} suppressContentEditableWarning onBlur={(event) => onText(node.id, event.currentTarget.textContent ?? "")}>{node.content}</small><strong>XXXX-XXXX</strong><span title="Protected dynamic value">🔒 Microsoft-generated value</span></div>;
  if (node.type === "status") return <div {...common}><span className="status-dot" /> <span contentEditable={!node.locked} suppressContentEditableWarning onBlur={(event) => onText(node.id, event.currentTarget.textContent ?? "")}>{node.content}</span></div>;
  if (node.type === "steps") return <ol {...common}>{node.items?.map((item, index) => <li key={index}>{item}</li>)}</ol>;
  if (node.type === "resourceCard") return <article {...common}><ProviderLogo provider={node.provider ?? "document"} /><div><h3>{node.name}</h3><p>{node.content}</p>{children}</div></article>;
  if (node.type === "divider") return <hr {...common} />;
  if (node.type === "badge") return <span {...common} contentEditable={!node.locked} suppressContentEditableWarning onBlur={(event) => onText(node.id, event.currentTarget.textContent ?? "")}>{node.content}</span>;
  return null;
}

function PropertiesPanel({ node, assets, projectId, onUpdate, onStyle, onDelete, onDuplicate, onMove }: { node: PageNode; assets: Asset[]; projectId: string; onUpdate: (patch: Partial<PageNode>) => void; onStyle: (patch: Partial<NodeStyle>) => void; onDelete: () => void; onDuplicate: () => void; onMove: (direction: -1 | 1) => void }) {
  const textNode = ["heading", "text", "button", "badge", "status", "deviceCode"].includes(node.type);
  const container = ["section", "header", "footer", "card", "callout", "columns", "navigation", "resourceCard"].includes(node.type);
  const field = (label: string, key: keyof NodeStyle, placeholder = "") => <label>{label}<input value={node.style?.[key] ?? ""} placeholder={placeholder} onChange={(event) => onStyle({ [key]: event.target.value })} /></label>;
  return <div className="properties-panel"><header><div><small>{node.type}</small><h2>{node.name}</h2></div><button className="icon-button" onClick={() => onUpdate({ locked: !node.locked })} title={node.locked ? "Unlock" : "Lock"}>{node.locked ? "🔒" : "🔓"}</button></header>
    {node.type === "deviceCode" && <div className="protected-notice"><strong>Protected dynamic value</strong><p>The preview code is fixed. The live value always comes from Microsoft and cannot be edited.</p></div>}
    {textNode && <section><h3>Content</h3>{node.type !== "deviceCode" && <label>Text<textarea rows={4} value={node.content ?? ""} onChange={(event) => onUpdate({ content: event.target.value })} /></label>}{node.type === "deviceCode" && <label>Label above code<input value={node.content ?? ""} onChange={(event) => onUpdate({ content: event.target.value })} /></label>}{node.type === "button" && <><label>Action<select value={node.action ?? "open-url"} onChange={(event) => onUpdate({ action: event.target.value as PageNode["action"] })}><option value="open-url">Open URL</option><option value="open-microsoft">Open Microsoft authorization</option><option value="copy-device-code">Copy Microsoft device code</option><option value="internal-route">Open internal route</option><option value="download">Download file</option><option value="copy-text">Copy text</option></select></label>{!["copy-device-code", "open-microsoft"].includes(node.action ?? "") && <label>Destination<input value={node.href ?? ""} onChange={(event) => onUpdate({ href: event.target.value })} /></label>}<label>Icon<input value={node.icon ?? ""} onChange={(event) => onUpdate({ icon: event.target.value })} /></label></>}</section>}
    {(node.type === "providerLogo" || node.type === "resourceCard") && <section><h3>Provider</h3><label>Automatic provider logo<select value={node.provider ?? "company"} onChange={(event) => onUpdate({ provider: event.target.value as PageNode["provider"] })}>{["microsoft365", "sharepoint", "onedrive", "adobe", "docusign", "document", "cloud", "company"].map((provider) => <option key={provider} value={provider}>{providerName(provider)}</option>)}</select></label><p className="muted">The selected provider icon is included automatically in previews and published pages.</p></section>}
    {node.type === "image" && <section><h3>Image</h3><label>Existing asset<select value={node.assetId ?? ""} onChange={(event) => onUpdate({ assetId: event.target.value, src: `/api/v1/html-projects/${projectId}/assets/${event.target.value}` })}><option value="">External URL</option>{assets.filter((asset) => asset.contentType.startsWith("image/")).map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label><label>Image URL<input value={node.src ?? ""} onChange={(event) => onUpdate({ src: event.target.value, assetId: undefined })} /></label><label>Alt text<input value={node.alt ?? ""} onChange={(event) => onUpdate({ alt: event.target.value })} /></label>{field("Width", "width", "100%")}{field("Height / minimum height", "minHeight", "280px")}{field("Radius", "borderRadius", "16px")}</section>}
    {node.type === "steps" && <section><h3>Instruction steps</h3>{(node.items ?? []).map((item, index) => <div className="property-list-row" key={index}><textarea value={item} onChange={(event) => onUpdate({ items: node.items?.map((value, itemIndex) => itemIndex === index ? event.target.value : value) })} /><button className="icon-button" onClick={() => onUpdate({ items: node.items?.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}<button className="secondary" onClick={() => onUpdate({ items: [...(node.items ?? []), "New instruction step"] })}>+ Add step</button></section>}
    <section><h3>Appearance</h3><div className="property-grid"><label>Background<input type="color" value={colorValue(node.style?.background, "#ffffff")} onChange={(event) => onStyle({ background: event.target.value })} /></label><label>Text color<input type="color" value={colorValue(node.style?.color, "#172033")} onChange={(event) => onStyle({ color: event.target.value })} /></label></div>{textNode && <>{field("Font size", "fontSize", "18px")}<label>Weight<select value={node.style?.fontWeight ?? ""} onChange={(event) => onStyle({ fontWeight: event.target.value })}><option value="">Default</option><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></label><label>Alignment<select value={node.style?.textAlign ?? "left"} onChange={(event) => onStyle({ textAlign: event.target.value as NodeStyle["textAlign"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>{field("Line height", "lineHeight", "1.6")}{field("Letter spacing", "letterSpacing", "0px")}</>}{field("Padding", "padding", "24px")}{field("Margin", "margin", "0 auto")}{field("Border", "border", "1px solid #dce3ef")}{field("Border radius", "borderRadius", "16px")}{field("Shadow", "boxShadow", "0 12px 40px #0002")}{container && <>{field("Width", "width", "100%")}{field("Maximum width", "maxWidth", "1120px")}{field("Minimum height", "minHeight", "auto")}{field("Gap", "gap", "24px")}</>}</section>
    <section><h3>Visibility and controls</h3><label className="check-row"><input type="checkbox" checked={node.hidden ?? false} onChange={(event) => onUpdate({ hidden: event.target.checked })} />Hidden</label><label className="check-row"><input type="checkbox" checked={node.hideDesktop ?? false} onChange={(event) => onUpdate({ hideDesktop: event.target.checked })} />Hide on desktop</label><label className="check-row"><input type="checkbox" checked={node.hideMobile ?? false} onChange={(event) => onUpdate({ hideMobile: event.target.checked })} />Hide on mobile</label></section>
    <footer><button className="secondary button-sm" onClick={() => onMove(-1)}>↑ Up</button><button className="secondary button-sm" onClick={() => onMove(1)}>↓ Down</button><button className="secondary button-sm" onClick={onDuplicate}>Duplicate</button><button className="secondary button-sm error" disabled={node.locked} onClick={onDelete}>Delete</button></footer>
  </div>;
}

function PageSettings({ document, onChange, project, onArchive, onExport }: { document: PageDocument; onChange: (document: PageDocument) => void; project: Project; onArchive: () => void; onExport: () => void }) {
  const settings = document.settings;
  const update = (patch: Partial<PageDocument["settings"]>) => onChange({ ...document, settings: { ...settings, ...patch } });
  return <div className="properties-panel"><header><div><small>Page</small><h2>Page settings</h2></div></header><section><label>Page name<input value={settings.title} onChange={(event) => update({ title: event.target.value })} /></label><label>SEO title<input value={settings.seoTitle} onChange={(event) => update({ seoTitle: event.target.value })} /></label><label>Description<textarea value={settings.description} onChange={(event) => update({ description: event.target.value })} /></label><label>Default font<select value={settings.fontFamily} onChange={(event) => update({ fontFamily: event.target.value })}><option value="Inter, system-ui, sans-serif">Inter / System</option><option value="Georgia, serif">Georgia</option><option value="'Segoe UI', sans-serif">Segoe UI</option><option value="'Helvetica Neue', sans-serif">Helvetica Neue</option><option value="ui-monospace, monospace">Monospace</option></select></label><div className="property-grid"><label>Background<input type="color" value={colorValue(settings.background, "#ffffff")} onChange={(event) => update({ background: event.target.value })} /></label><label>Text color<input type="color" value={colorValue(settings.color, "#172033")} onChange={(event) => update({ color: event.target.value })} /></label></div><label>Background image URL<input value={settings.backgroundImage ?? ""} onChange={(event) => update({ backgroundImage: event.target.value })} /></label><label>Maximum content width<input value={settings.maxWidth} onChange={(event) => update({ maxWidth: event.target.value })} /></label><label>Default visibility<select value={settings.visibility} onChange={(event) => update({ visibility: event.target.value as PageDocument["settings"]["visibility"] })}><option value="public">Public</option><option value="private">Private</option><option value="access-code">Access-code protected</option></select></label><label>Expiration<input type="datetime-local" value={settings.expiresAt?.slice(0, 16) ?? ""} onChange={(event) => update({ expiresAt: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></label></section><section><h3>Project</h3><p className="muted">{project.slug}<br />Template: {project.templateId}</p><button className="secondary" onClick={onExport}>Export HTML</button><button className="secondary error" onClick={onArchive}>Archive project</button></section></div>;
}

function AssetLibrary({ assets, projectId, onUpload, onChoose }: { assets: Asset[]; projectId: string; onUpload: (event: FormEvent<HTMLFormElement>) => void; onChoose: (asset: Asset) => void }) {
  return <div className="asset-library"><form className="stack" onSubmit={onUpload}><label>Asset type<select name="kind"><option value="logo">Logo</option><option value="image">Image</option><option value="document">PDF</option><option value="css">CSS asset</option></select></label><label>Logo variant<select name="variant"><option value="default">Default</option><option value="light">Light mode</option><option value="dark">Dark mode</option></select></label><label className="upload-drop">Upload PNG, JPG, WEBP, SVG, PDF or CSS<input type="file" name="file" required accept=".png,.jpg,.jpeg,.webp,.svg,.pdf,.css" /></label><button>Upload asset</button></form><div className="asset-grid">{assets.map((asset) => <button key={asset.id} onClick={() => onChoose(asset)}>{asset.contentType.startsWith("image/") ? <img src={`/api/v1/html-projects/${projectId}/assets/${asset.id}`} alt={asset.name} /> : <span>FILE</span>}<small>{asset.name}</small><em>{asset.variant}</em></button>)}</div></div>;
}

function LayerTree({ nodes, selectedId, onSelect, depth = 0 }: { nodes: PageNode[]; selectedId: string | null; onSelect: (id: string) => void; depth?: number }) {
  return <div className="layer-tree">{nodes.map((node) => <div key={node.id}><button className={node.id === selectedId ? "active" : ""} style={{ paddingLeft: `${12 + depth * 14}px` }} onClick={() => onSelect(node.id)}><span>{node.locked ? "🔒" : componentIcon(node.type)}</span>{node.name}{node.hidden && <small>hidden</small>}</button>{node.children && <LayerTree nodes={node.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />}</div>)}</div>;
}

function PublishDialog({ open, project, document, onClose, onSave }: { open: boolean; project: Project; document: PageDocument; onClose: () => void; onSave: () => Promise<void> }) {
  const { notify } = useToast();
  const [hostname, setHostname] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) void api<{ hostname: string }>("/cloudflare/hostname").then((value) => setHostname(value.hostname)).catch(() => setHostname("Cloudflare configuration required")); }, [open]);
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await onSave();
      const result = await api<{ accessCode?: string; deployment: { hostname: string } }>("/cloudflare", { method: "POST", body: JSON.stringify({ projectId: project.id, policy: data.get("policy"), expiresAt: data.get("expiresAt") || document.settings.expiresAt || undefined, proposedHostname: hostname }) });
      setAccessCode(result.accessCode ?? "");
      notify({ title: "Page published to Cloudflare", message: `https://${result.deployment.hostname}`, tone: "success" });
      if (!result.accessCode) onClose();
    } catch (error) { notify({ title: "Publish failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
    finally { setBusy(false); }
  }
  return <Modal open={open} title="Publish page" onClose={onClose}>{accessCode ? <div className="stack"><p className="muted">Copy this private deployment code now. It cannot be displayed again.</p><div className="device-code" style={{ fontSize: "1.5rem" }}>{accessCode}</div><button onClick={() => void navigator.clipboard.writeText(accessCode)}>Copy access code</button><button className="secondary" onClick={onClose}>Done</button></div> : <form className="stack" onSubmit={publish}><label>Visibility<select name="policy" defaultValue={document.settings.visibility === "access-code" ? "ACCESS_CODE" : "PUBLIC"}><option value="PUBLIC">Public</option><option value="ACCESS_CODE">Access-code protected</option></select></label><label>Expiration<input name="expiresAt" type="datetime-local" defaultValue={document.settings.expiresAt?.slice(0, 16)} /></label><label>Cloudflare hostname<div className="input-action"><input value={hostname} onChange={(event) => setHostname(event.target.value)} /><button type="button" className="secondary" onClick={() => void api<{ hostname: string }>("/cloudflare/hostname").then((value) => setHostname(value.hostname))}>Generate new</button></div></label><p className="muted">The current draft is saved as a published version before deployment. Cloudflare credentials remain encrypted server-side.</p><div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="secondary" onClick={onClose}>Cancel</button><button disabled={busy}>{busy ? "Publishing…" : "Confirm publish"}</button></div></form>}</Modal>;
}

function defaultNode(type: PageNode["type"]): PageNode {
  const base = { id: createId(type), type, name: type.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()) } as PageNode;
  const defaults: Partial<Record<PageNode["type"], Partial<PageNode>>> = {
    section: { children: [], style: { padding: "64px 24px", minHeight: "240px" } },
    header: { children: [], style: { padding: "20px 32px" } }, footer: { children: [], style: { padding: "28px 32px" } },
    columns: { children: [], style: { gap: "28px" } }, card: { children: [], style: { padding: "28px", background: "#ffffff", borderRadius: "18px", border: "1px solid #dce3ef" } },
    callout: { children: [], style: { padding: "20px", background: "#edf3ff", border: "1px solid #bfd0ff", borderRadius: "12px" } }, navigation: { children: [], style: { gap: "16px" } },
    heading: { content: "Your new heading", style: { fontSize: "42px", fontWeight: "700" } }, text: { content: "Click this text and start typing.", style: { fontSize: "17px", lineHeight: "1.7" } },
    button: { content: "Button label", action: "open-url", href: "https://company.example", style: { background: "#3157d5", color: "#ffffff", padding: "13px 20px", borderRadius: "10px" } },
    image: { src: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80", alt: "Company image", style: { width: "100%", borderRadius: "16px" } },
    providerLogo: { provider: "company" }, resourceCard: { provider: "sharepoint", content: "Access approved company resources.", children: [defaultNode("button")] },
    deviceCode: { content: "Microsoft device code", style: { padding: "20px", background: "#eef3ff", borderRadius: "14px", textAlign: "center" } },
    status: { content: "Waiting for authorization", statusKind: "waiting" }, steps: { items: ["First instruction", "Second instruction", "Final instruction"] },
    divider: { style: { margin: "24px 0" } }, badge: { content: "Badge" },
  };
  return { ...base, ...defaults[type] };
}

function findNode(nodes: PageNode[], id: string): PageNode | null { for (const node of nodes) { if (node.id === id) return node; const found = node.children && findNode(node.children, id); if (found) return found; } return null; }
function mapNodes(nodes: PageNode[], id: string, transform: (node: PageNode) => PageNode): PageNode[] { return nodes.map((node) => node.id === id ? transform(node) : node.children ? { ...node, children: mapNodes(node.children, id, transform) } : node); }
function removeNode(nodes: PageNode[], id: string): PageNode[] { return nodes.filter((node) => node.id !== id).map((node) => node.children ? { ...node, children: removeNode(node.children, id) } : node); }
function insertAfter(nodes: PageNode[], id: string, copy: PageNode): PageNode[] { const output: PageNode[] = []; for (const node of nodes) { output.push(node.children ? { ...node, children: insertAfter(node.children, id, copy) } : node); if (node.id === id) output.push(copy); } return output; }
function moveNode(nodes: PageNode[], id: string, direction: -1 | 1): PageNode[] { const index = nodes.findIndex((node) => node.id === id); if (index >= 0) { const next = [...nodes]; const target = Math.max(0, Math.min(nodes.length - 1, index + direction)); [next[index], next[target]] = [next[target], next[index]]; return next; } return nodes.map((node) => node.children ? { ...node, children: moveNode(node.children, id, direction) } : node); }
function cloneNode(node: PageNode): PageNode { const copy = structuredClone(node); const renew = (item: PageNode): PageNode => ({ ...item, id: createId(item.type), children: item.children?.map(renew) }); return renew(copy); }
function colorValue(value: string | undefined, fallback: string) { return value?.match(/^#[0-9a-f]{6}$/i) ? value : fallback; }
function viewportIcon(viewport: Viewport) { return viewport === "desktop" ? "▱" : viewport === "laptop" ? "▰" : viewport === "tablet" ? "▯" : "▯"; }
function componentIcon(type: string) { return ({ section: "▭", columns: "▥", card: "▢", header: "▔", footer: "▁", navigation: "☷", heading: "H", text: "¶", button: "▣", image: "▧", divider: "—", badge: "◉", callout: "!", steps: "123", providerLogo: "◎", resourceCard: "◫", deviceCode: "••", status: "●" } as Record<string, string>)[type] ?? "◇"; }
function providerName(value: string) { return ({ microsoft365: "Microsoft 365", sharepoint: "SharePoint", onedrive: "OneDrive", adobe: "Adobe Acrobat Sign", docusign: "DocuSign", document: "Generic document", cloud: "Cloud storage", company: "Company Portal" } as Record<string, string>)[value]; }
function ProviderLogo({ provider }: { provider: NonNullable<PageNode["provider"]> }) { const color = ({ microsoft365: "#2563eb", sharepoint: "#03787c", onedrive: "#0078d4", adobe: "#e41e2b", docusign: "#4c00ff", document: "#52627a", cloud: "#2782c5", company: "#3157d5" } as const)[provider]; return <span className="provider-logo" style={{ "--provider-color": color } as React.CSSProperties}><b>{provider === "microsoft365" ? "▦" : provider === "sharepoint" ? "S" : provider === "onedrive" || provider === "cloud" ? "☁" : provider === "adobe" ? "A" : provider === "docusign" ? "✓" : provider === "document" ? "▤" : "C"}</b><span>{providerName(provider)}</span></span>; }
function fileBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
function download(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
