"use client";
/* eslint-disable @next/next/no-img-element -- authenticated project assets and sandboxed previews */

import {
  Check, ChevronDown, Cloud, Code2, Copy, ExternalLink, History, ImageIcon,
  Laptop, Monitor, RefreshCw, Save, Send, Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/components/api";
import { Drawer, Skeleton, StatusBadge, useToast } from "@/components/design-system";
import { LogoLibrary, type BrandAsset, type LogoChoice } from "@/components/logo-library";
import { buildPageDesign, defaultBuilderConfiguration, pageDesigns, providerProfiles, type PreviewState } from "@/lib/builder-designs";
import { defaultProviderLogo, getBuiltinLogo } from "@/lib/logo-library";
import { isSafeRedirectUrl, renderPageDocument, type BuilderConfiguration, type PageDocument } from "@/lib/page-document";

type Version = { id: string; version: number; document: PageDocument | null; html: string; css: string | null; javascript: string | null; state: string; editorId: string | null; createdAt: string };
type Deployment = { id: string; hostname: string; status: string };
type Project = { id: string; name: string; slug: string; status: string; templateId: string; versions: Version[]; deployments: Deployment[] };
type Viewport = "desktop" | "tablet" | "mobile";
type CloudflareStatus = { configured: boolean; credentialsSaved: boolean; authType: "API_TOKEN" | "GLOBAL_API_KEY" | null; accountId: string | null; accountName: string | null; zoneId: string | null; zoneName: string | null; baseDomain: string | null; credential: string };
type Account = { id: string; name: string };
type Zone = { id: string; name: string; status: string; account: { id: string; name: string } };

const previewStates: Array<{ id: PreviewState; label: string }> = [
  { id: "initial", label: "Initial" }, { id: "waiting", label: "Waiting" },
  { id: "success", label: "Success" }, { id: "expired", label: "Expired" },
  { id: "error", label: "Error" }, { id: "ready", label: "Ready" },
  { id: "reviewing", label: "Reviewing" }, { id: "completed", label: "Completed" },
];

export function HtmlEditor({ projectId }: { projectId: string }) {
  const { notify } = useToast();
  const searchParams = useSearchParams();
  const loaded = useRef(false);
  const [project, setProject] = useState<Project | null>(null);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [configuration, setConfiguration] = useState<BuilderConfiguration>(defaultBuilderConfiguration());
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [previewState, setPreviewState] = useState<PreviewState>("waiting");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logoLibrarySlot, setLogoLibrarySlot] = useState<"provider" | "company" | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customHtml, setCustomHtml] = useState("");
  const [customCss, setCustomCss] = useState("");

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
        setConfiguration({ ...defaults, ...saved, companyLogoAssetId: saved?.companyLogoAssetId ?? defaultCompany?.id, logoMode: saved?.logoMode ?? (defaultCompany ? "both" : "provider") });
        setCustomHtml(latest && !latest.document ? latest.html : "");
        setCustomCss(latest?.document ? "" : latest?.css ?? "");
        loaded.current = true;
      }
    } catch (error) {
      notify({ title: "Builder unavailable", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
  }, [notify, projectId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (searchParams.get("publish") === "true") setPublishOpen(true); }, [searchParams]);

  const previewDocument = useMemo(() => buildPageDesign(configuration, previewState), [configuration, previewState]);
  const rendered = useMemo(() => renderPageDocument(previewDocument, { deviceCode: "XXXX-XXXX", verificationUri: "https://microsoft.com/devicelogin", status: previewState, assetUrl: (id) => `/api/v1/brand-assets/${id}/content` }), [previewDocument, previewState]);

  function change(patch: Partial<BuilderConfiguration>) {
    setConfiguration((current) => ({ ...current, ...patch }));
    setDirty(true);
  }
  function changeProvider(provider: BuilderConfiguration["provider"]) {
    const oldProfile = providerProfiles[configuration.provider];
    const nextProfile = providerProfiles[provider];
    change({
      provider,
      primaryColor: nextProfile.color,
      providerLogoId: defaultProviderLogo(provider, configuration.layoutId === "dark-professional"),
      title: configuration.title === oldProfile.title ? nextProfile.title : configuration.title,
      description: configuration.description === oldProfile.description ? nextProfile.description : configuration.description,
    });
  }
  function changeLayout(layoutId: BuilderConfiguration["layoutId"]) {
    const design = pageDesigns.find((item) => item.id === layoutId)!;
    const dark = layoutId === "dark-professional";
    change({ layoutId, primaryColor: design.accent, background: dark ? "#08131f" : "#f5f6f8", providerLogoId: defaultProviderLogo(configuration.provider, dark) });
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
      await api(`/html-projects/${projectId}/versions`, { method: "POST", body: JSON.stringify({ document, customHtml, customCss, state }) });
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
  }, [configuration, customCss, customHtml, dirty, saving]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectLogo(choice: LogoChoice) {
    if (choice.kind === "custom") {
      change({ companyLogoAssetId: choice.asset.id, logoMode: configuration.logoMode === "provider" ? "both" : "company" });
      return;
    }
    if (logoLibrarySlot === "company") {
      change({ companyBuiltinLogoId: choice.logo.id, companyLogoAssetId: undefined, logoMode: configuration.logoMode === "provider" ? "both" : "company" });
      return;
    }
    if (logoLibrarySlot === "provider") changeProvider(choice.logo.provider);
    change({ providerLogoId: choice.logo.id, logoMode: configuration.logoMode === "company" ? "both" : "provider" });
  }

  if (!project) return <section className="panel panel-body"><Skeleton lines={12} /></section>;
  return <div className="focused-builder">
    <header className="focused-builder-topbar">
      <div className="builder-project-title"><Link href="/admin/html-projects">HTML Pages</Link><span>/</span><strong>{project.name}</strong><StatusBadge status={saving ? "Saving" : dirty ? "Unsaved" : "Saved"} /></div>
      <div className="builder-top-actions"><button className="secondary" onClick={() => setHistoryOpen(true)}><History size={15} />History</button><button className="secondary" disabled={saving} onClick={() => void save()}><Save size={15} />{saving ? "Saving…" : "Save"}</button><button onClick={() => setPublishOpen(true)}><Send size={15} />Publish</button></div>
    </header>
    <div className="focused-builder-grid">
      <aside className="builder-controls">
        <section className="builder-control-section"><div className="control-heading"><strong>Design</strong><small>Updates the live page immediately</small></div><label>Provider<select value={configuration.provider} onChange={(event) => changeProvider(event.target.value as BuilderConfiguration["provider"])}>{Object.entries(providerProfiles).map(([id, provider]) => <option value={id} key={id}>{provider.name}</option>)}</select></label><div className="inline-design-grid">{pageDesigns.map((design) => <button className={configuration.layoutId === design.id ? "selected" : ""} onClick={() => changeLayout(design.id)} key={design.id}><DesignThumbnail configuration={{ ...configuration, layoutId: design.id }} /><span>{design.name}</span></button>)}</div></section>
        <details open><summary>Branding <ChevronDown size={14} /></summary><div>
          <label>Logo display<select value={configuration.logoMode} onChange={(event) => change({ logoMode: event.target.value as BuilderConfiguration["logoMode"] })}><option value="both">Both</option><option value="provider">Provider only</option><option value="company">Company only</option><option value="none">None</option></select></label>
          <div className="selected-logo-row"><button onClick={() => setLogoLibrarySlot("provider")}><SelectedProviderLogo id={configuration.providerLogoId} /><span><small>Provider logo</small><strong>Browse logos</strong></span></button><button onClick={() => setLogoLibrarySlot("company")}><SelectedCompanyLogo asset={brandAssets.find((asset) => asset.id === configuration.companyLogoAssetId)} builtinId={configuration.companyBuiltinLogoId} /><span><small>Company logo</small><strong>{configuration.companyLogoAssetId ? "Change logo" : "Choose logo"}</strong></span></button></div>
          <Link className="brand-library-link" href="/admin/settings/brand-assets">Manage company brand library</Link>
          <div className="compact-control-grid"><label>Size<select value={configuration.logoSize} onChange={(event) => change({ logoSize: event.target.value as BuilderConfiguration["logoSize"] })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><label>Position<select value={configuration.logoAlignment} onChange={(event) => change({ logoAlignment: event.target.value as BuilderConfiguration["logoAlignment"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
          <label>Logo width · {configuration.logoWidth}px<input type="range" min="80" max="280" value={configuration.logoWidth} onChange={(event) => change({ logoWidth: Number(event.target.value) })} /></label>
          <label className="toggle-row"><input type="checkbox" checked={configuration.showProviderName ?? true} onChange={(event) => change({ showProviderName: event.target.checked })} />Show provider name</label>
          <div className="theme-color-control"><label>Theme color<div><input type="color" value={configuration.primaryColor} onChange={(event) => change({ primaryColor: event.target.value })} /><output>{configuration.primaryColor.toUpperCase()}</output></div><input aria-label="Theme hue" className="hue-dragger" type="range" min="0" max="359" value={hexHue(configuration.primaryColor)} onChange={(event) => change({ primaryColor: hueHex(Number(event.target.value)) })} /></label><button className="secondary button-sm" onClick={() => change({ primaryColor: pageDesigns.find((design) => design.id === configuration.layoutId)!.accent })}><RefreshCw size={13} />Reset color</button></div>
        </div></details>
        <details open><summary>Content <ChevronDown size={14} /></summary><div>
          <label>Title<input value={configuration.title} maxLength={200} onChange={(event) => change({ title: event.target.value })} /></label>
          <label>Description<textarea rows={3} value={configuration.description} onChange={(event) => change({ description: event.target.value })} /></label>
          {configuration.steps.map((step, index) => <label key={index}>Step {index + 1}<input value={step} onChange={(event) => { const steps = [...configuration.steps] as BuilderConfiguration["steps"]; steps[index] = event.target.value; change({ steps }); }} /></label>)}
          <label>Continue button<input value={configuration.continueButtonText} onChange={(event) => change({ continueButtonText: event.target.value })} /></label>
          <label>Footer<input value={configuration.footer} onChange={(event) => change({ footer: event.target.value })} /></label>
          <label>Success message<textarea rows={2} value={configuration.successMessage} onChange={(event) => change({ successMessage: event.target.value })} /></label>
        </div></details>
        <details><summary>Document details <ChevronDown size={14} /></summary><div>
          <label>Filename<input value={configuration.documentName} onChange={(event) => change({ documentName: event.target.value })} /></label><label>Document title<input value={configuration.documentTitle} onChange={(event) => change({ documentTitle: event.target.value })} /></label>
          <div className="compact-control-grid"><label>File type<input value={configuration.fileType} onChange={(event) => change({ fileType: event.target.value })} /></label><label>Page count<input value={configuration.pageCount} onChange={(event) => change({ pageCount: event.target.value })} /></label><label>File size<input value={configuration.fileSize} onChange={(event) => change({ fileSize: event.target.value })} /></label><label>Status<input value={configuration.documentStatus} onChange={(event) => change({ documentStatus: event.target.value })} /></label></div>
          <label>Sender<input value={configuration.sender} onChange={(event) => change({ sender: event.target.value })} /></label><label>Company<input value={configuration.companyName} onChange={(event) => change({ companyName: event.target.value })} /></label><label>Department<input value={configuration.department} onChange={(event) => change({ department: event.target.value })} /></label>
        </div></details>
        <details open><summary>Behavior <ChevronDown size={14} /></summary><div><label>Redirect URL<input type="url" placeholder="https://company.example/complete" value={configuration.redirectUrl ?? ""} onChange={(event) => change({ redirectUrl: event.target.value })} /></label><label>Redirect label<input value={configuration.redirectText} onChange={(event) => change({ redirectText: event.target.value })} /></label><label>Redirect delay<select value={configuration.redirectDelay} onChange={(event) => change({ redirectDelay: event.target.value as BuilderConfiguration["redirectDelay"] })}><option value="immediate">Immediately</option><option value="1">1 second</option><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="never">Do not redirect</option></select></label></div></details>
        <details><summary>Deployment & advanced <ChevronDown size={14} /></summary><div><button onClick={() => setPublishOpen(true)}><Cloud size={14} />Cloudflare publish settings</button><button className="secondary" onClick={() => setAdvancedOpen(true)}><Code2 size={14} />Advanced code</button></div></details>
      </aside>
      <main className="preview-stage">
        <div className="preview-stage-toolbar"><span><i />Live preview · every change is immediate</span><div className="builder-device-switcher"><button className={viewport === "desktop" ? "active" : ""} onClick={() => setViewport("desktop")} title="Desktop"><Monitor size={16} /></button><button className={viewport === "tablet" ? "active" : ""} onClick={() => setViewport("tablet")} title="Tablet"><Laptop size={16} /></button><button className={viewport === "mobile" ? "active" : ""} onClick={() => setViewport("mobile")} title="Mobile"><Smartphone size={16} /></button></div><label className="preview-state-control">State<select value={previewState} onChange={(event) => setPreviewState(event.target.value as PreviewState)}>{previewStates.slice(0, 5).map((state) => <option value={state.id} key={state.id}>{state.label}</option>)}</select></label><span>{viewport === "desktop" ? "1440" : viewport === "tablet" ? "768" : "390"} px</span></div>
        <div className={`focused-preview preview-${viewport}`}><style>{rendered.css}</style><div className="direct-page-preview" onClick={(event) => event.preventDefault()} dangerouslySetInnerHTML={{ __html: rendered.html }} /></div>
      </main>
    </div>
    <LogoLibrary open={Boolean(logoLibrarySlot)} slot={logoLibrarySlot ?? "provider"} assets={brandAssets} onAssetsChange={setBrandAssets} onClose={() => setLogoLibrarySlot(null)} onSelect={selectLogo} />
    <Drawer open={advancedOpen} title="Advanced code" onClose={() => setAdvancedOpen(false)}><div className="stack"><div className="security-warning"><strong>Advanced users only.</strong> Custom JavaScript is intentionally unavailable in published pages.</div><label>Additional HTML<textarea rows={12} value={customHtml} onChange={(event) => { setCustomHtml(event.target.value); setDirty(true); }} /></label><label>Additional CSS<textarea rows={14} value={customCss} onChange={(event) => { setCustomCss(event.target.value); setDirty(true); }} /></label></div></Drawer>
    <Drawer open={historyOpen} title="Version history" onClose={() => setHistoryOpen(false)}><div className="version-history">{project.versions.map((version) => <article key={version.id}><div><strong>Version {version.version}</strong><StatusBadge status={version.state} /><p>{new Date(version.createdAt).toLocaleString()}</p></div>{version.document?.settings.builder && <button className="secondary button-sm" onClick={() => { setConfiguration(version.document!.settings.builder!); setDirty(true); setHistoryOpen(false); }}>Restore</button>}</article>)}</div></Drawer>
    <PublishDrawer open={publishOpen} project={project} configuration={configuration} onClose={() => setPublishOpen(false)} onSave={() => save(true, "PUBLISHED")} />
  </div>;
}

function SelectedProviderLogo({ id }: { id?: string }) { const logo = getBuiltinLogo(id); return logo ? <img src={logo.src} alt="" /> : <ImageIcon size={24} />; }
function SelectedCompanyLogo({ asset, builtinId }: { asset?: BrandAsset; builtinId?: string }) { const logo = getBuiltinLogo(builtinId); return asset ? <img src={asset.url} alt="" /> : logo ? <img src={logo.src} alt="" /> : <ImageIcon size={24} />; }

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
    const popup = window.open("", "_blank");
    try {
      const response = await api<{ connectUrl: string; publishedConnectUrl?: string; bridgeError?: string }>("/microsoft/device/start", { method: "POST", body: JSON.stringify({ pageProjectId: project.id, deploymentId: result?.id }) });
      const destination = response.publishedConnectUrl ?? response.connectUrl;
      if (popup) popup.location.href = destination;
      else window.location.href = destination;
      if (response.bridgeError) notify({ title: "Opened secure local connection page", message: response.bridgeError, tone: "info" });
    } catch (error) {
      popup?.close();
      notify({ title: "Microsoft session could not start", message: error instanceof Error ? error.message : undefined, tone: "error" });
    }
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
