import type { BuilderConfiguration, PageDocument, PageNode } from "@/lib/page-document";
import { providerAssets } from "@/lib/provider-assets";

export type PreviewState = "initial" | "waiting" | "success" | "expired" | "error" | "ready" | "reviewing" | "completed";
export type PageDesign = { id: BuilderConfiguration["layoutId"]; name: string; description: string; structure: string; accent: string };

export const pageDesigns: PageDesign[] = [
  { id: "compact-card", name: "Compact File Access", description: "A narrow object-first file workflow.", structure: "Compact file stack", accent: "#0f6cbd" },
  { id: "split-screen", name: "Split Document", description: "Document identity beside authorization.", structure: "Document rail + authorization", accent: "#0f6cbd" },
  { id: "document-view", name: "PDF Review", description: "Dominant document preview with a precise access panel.", structure: "PDF preview + access", accent: "#d31510" },
  { id: "dark-professional", name: "Minimal Verification", description: "Only identity, object, code, and action.", structure: "Minimal verification", accent: "#0f6cbd" },
  { id: "centered-enterprise", name: "Organization Document", description: "Restrained company identity around one document.", structure: "Organization + document", accent: "#3158d4" },
  { id: "resource-portal", name: "Resource Workspace", description: "Resource cards drive a workspace-style composition.", structure: "Workspace + authorization", accent: "#03787c" },
  { id: "two-column-instructions", name: "Side Instructions", description: "Instructions emphasized beside a compact action panel.", structure: "Instructions + action", accent: "#0f6cbd" },
  { id: "modern-glass", name: "Document Hero", description: "The resource visual dominates; authorization stays secondary.", structure: "Document hero + floating action", accent: "#7c3aed" },
  { id: "mobile-first-stack", name: "Agreement Review", description: "Agreement context beside a focused access task.", structure: "Agreement summary + access", accent: "#3158d4" },
  { id: "full-hero", name: "Mobile File Access", description: "A touch-first stacked file workflow.", structure: "Mobile file stack", accent: "#0f6cbd" },
];

export const providerProfiles: Record<BuilderConfiguration["provider"], { name: string; nodeProvider: NonNullable<PageNode["provider"]>; title: string; description: string; color: string }> = {
  microsoft365: { name: "Microsoft 365", nodeProvider: "microsoft365", title: "Verification required", description: "Use your work or school account to continue.", color: providerAssets.microsoft365.accent },
  sharepoint: { name: "SharePoint", nodeProvider: "sharepoint", title: "Workspace verification required", description: "Verify access to this workspace.", color: providerAssets.sharepoint.accent },
  onedrive: { name: "OneDrive", nodeProvider: "onedrive", title: "File verification required", description: "Verify access to this shared file.", color: providerAssets.onedrive.accent },
  adobe: { name: "Adobe Acrobat Sign", nodeProvider: "adobe", title: "Signature verification required", description: "Verify access to review this agreement.", color: providerAssets.adobe.accent },
  docusign: { name: "Docusign", nodeProvider: "docusign", title: "Recipient verification required", description: "Verify access to review this agreement.", color: providerAssets.docusign.accent },
  company: { name: "Generic Company", nodeProvider: "company", title: "Company access required", description: "Verify access to this resource.", color: providerAssets.company.accent },
  custom: { name: "Generic Company", nodeProvider: "company", title: "Company access required", description: "Verify access to this resource.", color: providerAssets.company.accent },
};

export function defaultBuilderConfiguration(layoutId: BuilderConfiguration["layoutId"] = "compact-card", provider: BuilderConfiguration["provider"] = "microsoft365"): BuilderConfiguration {
  const profile = providerProfiles[provider];
  const preset = providerAssets[provider];
  return {
    layoutId, provider,
    title: profile.title,
    description: profile.description,
    steps: ["Continue to Microsoft.", "Complete sign-in and any required MFA.", "Return automatically after authorization."],
    continueButtonText: "Continue to Microsoft",
    footer: "Authentication continues securely on Microsoft’s website.",
    successMessage: "",
    redirectText: "Redirecting to",
    primaryColor: preset.accent,
    background: preset.surface,
    documentName: preset.defaultFile.name,
    documentTitle: preset.defaultFile.title,
    fileType: preset.defaultFile.type,
    pageCount: preset.defaultFile.pages,
    fileSize: preset.defaultFile.size,
    sender: preset.defaultFile.sender,
    companyName: "Your Company",
    department: "Employee Operations",
    documentStatus: preset.defaultFile.status,
    logoMode: "provider",
    logoSize: "medium",
    logoAlignment: layoutId === "compact-card" || layoutId === "full-hero" ? "center" : "left",
    logoSpacing: 16,
    logoWidth: 168,
    logoMaxHeight: 48,
    logoBackground: "none",
    showProviderName: true,
    redirectDelay: "immediate",
  };
}

export function buildPageDesign(config: BuilderConfiguration, state: PreviewState = "waiting"): PageDocument {
  const defaults = defaultBuilderConfiguration(config.layoutId, config.provider);
  const c = { ...defaults, ...config };
  const preset = providerAssets[c.provider];
  const dark = false;
  const page: PageDocument = {
    schemaVersion: 1,
    settings: {
      title: c.documentName, seoTitle: c.documentName, description: c.documentStatus ?? c.description,
      background: c.background,
      fontFamily: preset.fontFamily,
      color: "#172033",
      maxWidth: "1100px", visibility: "public", builder: c,
    },
    nodes: [],
  };
  const auth = authorization(c, state, dark);
  switch (c.layoutId) {
    case "compact-card":
      page.settings.maxWidth = "440px";
      page.nodes = [section("compact-stage", [card("compact-card", [
        brand(c, "left"), heading("compact-file", c.documentName, { fontSize: "22px", margin: "14px 0 4px" }), metadata(c),
        text("compact-status", c.documentStatus!, { color: "#667085", fontSize: "13px", margin: "12px 0" }),
        ...auth,
      ], providerCard(c, { maxWidth: "440px", margin: "0 auto", padding: "24px" }))], { minHeight: "100vh", padding: "28px 16px", background: preset.surface })];
      break;
    case "split-screen":
      page.nodes = [columns("split-document", [
        section("split-rail", [documentViewer(c, "split-viewer")], { minHeight: "100vh", padding: "24px", background: viewerSurface(c) }),
        section("split-workflow", [n("split-inner", "section", "Authorization", { style: { maxWidth: "420px", margin: "auto", padding: "20px 0" }, children: [brand(c, "left"), heading("split-name", c.documentName, { fontSize: "22px", margin: "18px 0 4px" }), metadata(c), text("split-sender", `From ${c.sender}`, { color: "#667085", fontSize: "12px", margin: "8px 0 18px" }), ...auth] })], { minHeight: "100vh", padding: "32px", background: preset.elevatedSurface, border: `1px solid ${preset.border}` }),
      ], { gridTemplateColumns: "minmax(0,1.6fr) minmax(320px,1fr)", gap: "0", minHeight: "100vh" })];
      break;
    case "document-view":
      page.nodes = [section("detail-stage", [columns("detail-columns", [
        n("detail-preview", "section", "Document preview", { style: { minHeight: "620px", padding: "20px", background: viewerSurface(c), border: `1px solid ${preset.border}`, borderRadius: preset.radius }, children: [documentViewer(c, "detail-viewer")] }),
        n("detail-panel", "section", "Document details", { style: { padding: "8px 0" }, children: [brand(c, "left"), heading("detail-name", c.documentName, { fontSize: "23px", margin: "12px 0 4px" }), metadata(c), text("detail-status", c.documentStatus!, { color: "#667085", fontSize: "13px", margin: "12px 0 4px" }), divider("detail-divider"), ...auth] }),
      ], { gridTemplateColumns: "1.35fr .65fr", gap: "28px", alignItems: "start" })], { minHeight: "100vh", padding: "24px", background: preset.surface })];
      break;
    case "centered-enterprise":
      page.nodes = [section("organization-stage", [
        n("organization-brand", "section", "Organization document", { style: { maxWidth: "620px", margin: "0 auto 16px", padding: "8px" }, children: [companyBrand(c, "left"), text("organization-company", c.companyName!, { fontSize: "13px", fontWeight: "600", color: "#667085" }), heading("organization-file", c.documentName, { fontSize: "24px", margin: "16px 0 4px" }), metadata(c)] }),
        card("organization-auth", [providerBrand(c, "left"), ...auth], providerCard(c, { maxWidth: "540px", margin: "0 auto", padding: "24px" })),
      ], { minHeight: "100vh", padding: "32px 20px", background: preset.surface })];
      break;
    case "full-hero":
      page.settings.maxWidth = "560px";
      page.nodes = [section("file-stage", [n("file-flow", "section", "File access", { style: { maxWidth: "560px", margin: "0 auto", textAlign: "center", padding: "20px" }, children: [
        brand(c, "center"), fileGlyph("file-icon", c.primaryColor), heading("file-name", c.documentName, { textAlign: "center", fontSize: "22px" }), metadata(c, true),
        text("file-status", c.documentStatus!, { textAlign: "center", color: "#667085", fontSize: "13px" }), ...auth,
      ] })], { minHeight: "100vh", padding: "24px 16px", background: preset.elevatedSurface })];
      break;
    case "two-column-instructions":
      page.nodes = [section("instruction-stage", [columns("instruction-columns", [
        n("instruction-copy", "section", "Instructions", { style: { padding: "24px" }, children: [brand(c, "left"), heading("instruction-file", c.documentName, { fontSize: "24px" }), metadata(c), steps("instruction-large", c.steps, { margin: "28px 0", fontSize: "15px", gap: "18px" })] }),
        card("instruction-action", [providerBrand(c, "left"), ...auth.filter((node) => node.id !== "auth-steps")], providerCard(c, { padding: "24px", margin: "auto 0" })),
      ], { gridTemplateColumns: "1.1fr .9fr", gap: "36px", alignItems: "center" })], { minHeight: "100vh", padding: "32px 5vw", background: preset.surface })];
      break;
    case "resource-portal":
      page.nodes = [header("workspace-header", brandPair(c), { background: "#fff", padding: "16px 28px" }), section("workspace-main", [
        heading("workspace-title", c.documentTitle!, { fontSize: "24px" }),
        columns("workspace-layout", [
          n("workspace-resources", "section", "Resources", { children: [
            columns("resource-grid", [resource("resource-project", "Quarterly Report.pdf", "document", "PDF · 3.1 MB"), resource("resource-shared", "Budget.xlsx", "document", "Spreadsheet · 840 KB"), resource("resource-document", "Meeting Notes.docx", "document", "Document · 420 KB")], { gridTemplateColumns: "repeat(2,1fr)", gap: "12px" }),
          ] }),
          card("workspace-auth", [text("workspace-status", c.documentStatus!, { fontSize: "13px", fontWeight: "600" }), ...auth], providerCard(c, { padding: "22px" })),
        ], { gridTemplateColumns: "1.2fr .8fr", gap: "26px", alignItems: "start" }),
      ], { minHeight: "calc(100vh - 64px)", padding: "24px 28px", background: preset.surface })];
      break;
    case "modern-glass":
      page.nodes = [section("hero-stage", [
        n("document-hero", "section", "Document hero", { style: { minHeight: "520px", maxWidth: "1050px", margin: "0 auto", padding: "32px", borderRadius: preset.radius, background: preset.elevatedSurface, border: `1px solid ${preset.border}`, boxShadow: preset.shadow }, children: [...brandPair(c), columns("hero-content", [
          n("hero-document", "section", "Document focus", { style: { padding: "8px 0" }, children: [documentViewer(c, "hero-viewer")] }),
          card("hero-action", auth, providerCard(c, { padding: "22px", margin: "28px 0 0" })),
        ], { gridTemplateColumns: "1.2fr .8fr", gap: "30px", alignItems: "center" })] }),
      ], { minHeight: "100vh", padding: "28px 22px", background: preset.surface })];
      break;
    case "dark-professional":
      page.settings.maxWidth = "420px";
      page.nodes = [section("minimal-stage", [n("minimal-flow", "section", "Minimal verification", { style: { maxWidth: "460px", margin: "0 auto", padding: "24px", textAlign: "center" }, children: [
        brand(c, "center"), heading("minimal-file", c.documentName, { textAlign: "center", fontSize: "22px", color: "#172033" }), metadata(c, true), ...auth,
      ] })], { minHeight: "100vh", padding: "36px 16px", background: "#ffffff" })];
      break;
    case "mobile-first-stack":
      page.nodes = [columns("corporate-split", [
        section("corporate-brand", [companyBrand(c, "left"), text("corporate-company-name", c.companyName!, { color: "#344054", fontSize: "13px", fontWeight: "600" }), text("corporate-department", c.department!, { color: "#667085", fontSize: "12px" }), heading("corporate-file", c.documentName, { fontSize: "26px", margin: "28px 0 6px" }), metadata(c), text("corporate-sender", `From ${c.sender}`, { color: "#667085", fontSize: "12px" })], { minHeight: "100vh", padding: "36px", background: softTint(c.primaryColor) }),
        section("corporate-action-area", [card("corporate-auth", [providerBrand(c, "left"), ...auth], providerCard(c, { maxWidth: "500px", margin: "auto", padding: "24px" }))], { minHeight: "100vh", padding: "32px", background: preset.surface }),
      ], { gridTemplateColumns: "42% 58%", gap: "0", minHeight: "100vh" })];
      break;
  }
  return page;
}

function authorization(c: BuilderConfiguration, state: PreviewState, dark: boolean): PageNode[] {
  const preset = providerAssets[c.provider];
  const muted = dark ? "#aebdca" : "#667085";
  return [
    n("auth-active", "section", "Authorization", { children: [
      text("auth-security", "Microsoft handles your credentials, MFA, Conditional Access, consent, and account selection.", { margin: "16px 0", color: muted }),
      steps("auth-steps", c.steps, { margin: "16px 0", color: muted }),
      button("auth-continue", c.continueButtonText, "open-microsoft", { width: "100%", padding: "13px", background: c.primaryColor, color: readable(c.primaryColor), borderRadius: preset.radius }),
    ] }),
    n("auth-status", "status", "Authorization status", { content: stateLabel(state), statusKind: "waiting", style: { margin: "14px 0 0", color: muted } }),
    text("auth-footer", c.footer, { margin: "14px 0 0", textAlign: "center", fontSize: "11px", color: muted }),
  ];
}

function brand(c: BuilderConfiguration, alignment: "left" | "center" | "right") {
  return n(`brand-${alignment}`, "section", "Brand identity", { style: { padding: "0", margin: "0 0 12px", textAlign: alignment }, children: logoNodes(c, alignment) });
}
function brandPair(c: BuilderConfiguration) {
  const nodes = logoNodes(c, "left");
  return nodes.length > 1 ? nodes : [brand(c, "left")];
}
function providerBrand(c: BuilderConfiguration, alignment: "left" | "center" | "right") {
  const logo = providerLogo(c, alignment);
  return n("provider-brand", "section", "Provider identity", { style: { padding: "0", margin: `0 0 ${c.logoSpacing}px`, textAlign: alignment }, children: logo ? [logo] : [] });
}
function companyBrand(c: BuilderConfiguration, alignment: "left" | "center" | "right") {
  const logo = companyLogo(c, alignment);
  return n("company-brand", "section", "Company identity", { style: { padding: "0", margin: `0 0 ${c.logoSpacing}px`, textAlign: alignment }, children: logo ? [logo] : [] });
}
function logoNodes(c: BuilderConfiguration, alignment: "left" | "center" | "right") {
  const nodes: PageNode[] = [];
  if (c.logoMode === "company" || c.logoMode === "both") { const logo = companyLogo(c, alignment); if (logo) nodes.push(logo); }
  const provider = providerLogo(c, alignment); if (provider) nodes.push(provider);
  return nodes;
}
function providerLogo(c: BuilderConfiguration, alignment: "left" | "center" | "right") {
  const preset = providerAssets[c.provider];
  const content = c.provider === "docusign" ? undefined : c.provider === "company" || c.provider === "custom" ? c.companyName : preset.name;
  return n("provider-logo", "providerLogo", "Provider identity", { provider: providerProfiles[c.provider].nodeProvider, src: preset.logoSrc, alt: preset.logoAlt, content, style: { width: c.provider === "docusign" ? "112px" : c.provider === "adobe" ? "190px" : "170px", height: c.provider === "adobe" ? "32px" : "36px", maxWidth: "190px", margin: alignment === "center" ? "0 auto" : alignment === "right" ? "0 0 0 auto" : "0", fontSize: "13px", fontWeight: "600", color: "#323130", gap: c.provider === "adobe" ? "32px" : "9px" } });
}
function companyLogo(c: BuilderConfiguration, alignment: "left" | "center" | "right") {
  if (c.logoMode === "provider" || c.logoMode === "none") return null;
  if (c.companyLogoAssetId) return n("company-logo", "logo", "Company logo", { assetId: c.companyLogoAssetId, alt: c.companyName || "Company logo", style: logoStyle(c, alignment) });
  return n("company-logo", "providerLogo", "Company name", { alt: "Company", content: c.companyName, style: { ...logoStyle(c, alignment), fontWeight: "650", fontSize: "14px" } });
}
function logoStyle(c: BuilderConfiguration, alignment: "left" | "center" | "right"): PageNode["style"] {
  const width = Math.min(c.logoWidth ?? (c.logoSize === "small" ? 120 : c.logoSize === "large" ? 180 : 150), 200);
  const height = Math.min(c.logoMaxHeight ?? 40, 48);
  return { width: `${width}px`, height: `${height}px`, maxWidth: "200px", padding: c.logoBackground === "white" || c.logoBackground === "dark" ? "6px 8px" : "0", background: c.logoBackground === "white" ? "#fff" : c.logoBackground === "dark" ? "#102333" : "transparent", borderRadius: "6px", margin: alignment === "center" ? "0 auto" : alignment === "right" ? "0 0 0 auto" : "0" };
}
function providerCard(c: BuilderConfiguration, extra: PageNode["style"] = {}): PageNode["style"] {
  const preset = providerAssets[c.provider];
  return { background: preset.elevatedSurface, border: `1px solid ${preset.border}`, borderRadius: preset.radius, boxShadow: preset.shadow, ...extra };
}
function documentViewer(c: BuilderConfiguration, id: string) {
  return n(id, "section", "Document viewer", { style: { padding: "0", border: `1px solid ${providerAssets[c.provider].border}`, borderRadius: providerAssets[c.provider].radius, background: providerAssets[c.provider].elevatedSurface, boxShadow: providerAssets[c.provider].shadow, overflow: "hidden" } as PageNode["style"], children: [
    n(`${id}-toolbar`, "section", "Document toolbar", { style: { padding: "12px 14px", boxShadow: `inset 0 -1px ${providerAssets[c.provider].border}`, background: providerAssets[c.provider].elevatedSurface }, children: [
      heading(`${id}-filename`, c.documentName, { fontSize: "13px", margin: "0 0 3px" }),
      text(`${id}-counter`, `${c.fileType} · ${c.fileSize} · ${c.pageCount}`, { color: "#667085", fontSize: "11px", margin: "0" }),
    ] }),
    n(`${id}-canvas`, "section", "Document canvas", { style: { minHeight: "510px", padding: "22px", background: viewerSurface(c) }, children: [documentSheet(c)] }),
  ] });
}
function documentSheet(c: BuilderConfiguration) { return n("document-sheet", "section", "Document sheet", { style: { width: "min(100%,390px)", minHeight: "505px", margin: "0 auto", padding: "42px 36px", background: "#fff", boxShadow: "0 8px 28px #1720331a", textAlign: "left" }, children: [text("sheet-kicker", c.department!, { color: c.primaryColor, fontSize: "10px", fontWeight: "700", letterSpacing: ".08em", margin: "0 0 20px" }), heading("sheet-title", c.documentTitle!, { fontSize: "22px", margin: "0 0 8px" }), text("sheet-name", c.documentName, { color: "#667085", fontSize: "12px" }), divider("sheet-rule"), heading("sheet-section", "Document summary", { fontSize: "13px", margin: "24px 0 10px" }), text("sheet-copy", "Prepared for review and secure access. The complete document becomes available after recipient verification.", { color: "#667085", fontSize: "11px", lineHeight: "1.7" }), n("sheet-lines", "section", "Document placeholder lines", { style: { minHeight: "150px", margin: "24px 0", background: "repeating-linear-gradient(to bottom,#e9edf2 0,#e9edf2 5px,transparent 5px,transparent 18px)" } }), text("sheet-signature", "Signature ____________________", { color: "#98a2b3", fontSize: "11px", margin: "34px 0 0" })] }); }
function metadata(c: BuilderConfiguration, centered = false) { return text(`metadata-${centered ? "center" : "left"}`, `${c.fileType} · ${c.pageCount} · ${c.fileSize}\n${c.documentStatus}`, { color: "#667085", fontSize: "12px", textAlign: centered ? "center" : "left", lineHeight: "1.6" }); }
function fileGlyph(id: string, color: string) { return n(id, "callout", "File icon", { content: "▤", style: { width: "54px", minHeight: "62px", margin: "0 auto 14px", padding: "14px", background: softTint(color), color, border: "0", borderRadius: "10px", boxShadow: "none", textAlign: "center", fontSize: "24px" } }); }
function n(id: string, type: PageNode["type"], name: string, extra: Partial<PageNode> = {}): PageNode { return { id, type, name, ...extra }; }
function section(id: string, children: PageNode[], style: PageNode["style"] = {}) { return n(id, "section", "Section", { children, style }); }
function card(id: string, children: PageNode[], style: PageNode["style"] = {}) { return n(id, "card", "Card", { children, style }); }
function columns(id: string, children: PageNode[], style: PageNode["style"] = {}) { return n(id, "columns", "Columns", { children, style }); }
function header(id: string, children: PageNode[], style: PageNode["style"] = {}) { return n(id, "header", "Header", { children, style }); }
function heading(id: string, content: string, style: PageNode["style"] = {}) { return n(id, "heading", "Heading", { content, style }); }
function text(id: string, content: string, style: PageNode["style"] = {}) { return n(id, "text", "Text", { content, style }); }
function divider(id: string) { return n(id, "divider", "Divider"); }
function steps(id: string, items: BuilderConfiguration["steps"], style: PageNode["style"] = {}) { return n(id, "steps", "Instructions", { items, style }); }
function button(id: string, content: string, action: PageNode["action"], style: PageNode["style"] = {}) { return n(id, "button", "Button", { content, action, style }); }
function resource(id: string, name: string, provider: NonNullable<PageNode["provider"]>, content: string) { return n(id, "resourceCard", name, { provider, content }); }
function softTint(color: string) { return `color-mix(in srgb,${color} 8%,#ffffff)`; }
function viewerSurface(c: BuilderConfiguration) {
  if (c.provider === "adobe") return "#ecebea";
  if (c.provider === "docusign") return "#f2f0eb";
  if (c.provider === "sharepoint") return "#eef5f4";
  if (c.provider === "onedrive") return "#f1f6fb";
  return "#f2f4f7";
}
function readable(color: string) { const value = Number.parseInt(color.slice(1), 16); return (((value >> 16) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000) > 160 ? "#172033" : "#ffffff"; }
function stateLabel(state: PreviewState) { return ({ initial: "Waiting for Microsoft…", waiting: "Waiting for Microsoft…", success: "Redirecting…", expired: "Waiting for Microsoft…", error: "Waiting for Microsoft…", ready: "Waiting for Microsoft…", reviewing: "Waiting for Microsoft…", completed: "Redirecting…" } as Record<PreviewState, string>)[state]; }
