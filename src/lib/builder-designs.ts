import type { BuilderConfiguration, PageDocument, PageNode } from "@/lib/page-document";

export type PreviewState = "initial" | "waiting" | "success" | "expired" | "error" | "ready" | "reviewing" | "completed";
export type PageDesign = {
  id: BuilderConfiguration["layoutId"];
  name: string;
  description: string;
  structure: string;
  accent: string;
};

export const pageDesigns: PageDesign[] = [
  { id: "compact-card", name: "Compact Card", description: "Focused authorization card with numbered guidance.", structure: "Centered card", accent: "#3158d4" },
  { id: "split-screen", name: "Split Screen", description: "Brand story and imagery beside a dedicated action panel.", structure: "50 / 50 split", accent: "#0f6cbd" },
  { id: "document-view", name: "PDF / Document View", description: "Document preview, metadata, status, and authorization.", structure: "Document workspace", accent: "#d92d20" },
  { id: "centered-enterprise", name: "Centered Enterprise", description: "Corporate header with calm, centered verification.", structure: "Enterprise center", accent: "#274690" },
  { id: "full-hero", name: "Full Hero", description: "Large branded hero with an overlaid action module.", structure: "Hero overlay", accent: "#7c3aed" },
  { id: "two-column-instructions", name: "Two-Column Instructions", description: "Detailed numbered steps beside verification.", structure: "60 / 40 instructions", accent: "#2563eb" },
  { id: "resource-portal", name: "Resource Portal", description: "Workspace resources with a primary authorization module.", structure: "Resource grid", accent: "#03787c" },
  { id: "modern-glass", name: "Modern Glass", description: "Subtle layered surfaces with crisp readable content.", structure: "Layered glass", accent: "#6366f1" },
  { id: "dark-professional", name: "Dark Professional", description: "High-contrast enterprise presentation for dark brands.", structure: "Dark enterprise", accent: "#5eead4" },
  { id: "mobile-first-stack", name: "Mobile-First Stack", description: "Large touch targets and a simple vertical sequence.", structure: "Mobile stack", accent: "#0f766e" },
];

export const providerProfiles: Record<BuilderConfiguration["provider"], {
  name: string;
  nodeProvider: NonNullable<PageNode["provider"]>;
  title: string;
  description: string;
  color: string;
}> = {
  microsoft365: { name: "Microsoft 365", nodeProvider: "microsoft365", title: "Connect your Microsoft 365 account", description: "Complete secure authorization on Microsoft’s official website to connect approved company services.", color: "#3158d4" },
  sharepoint: { name: "SharePoint", nodeProvider: "sharepoint", title: "Access your SharePoint workspace", description: "Authorize your Microsoft work account to open approved SharePoint resources and project files.", color: "#03787c" },
  onedrive: { name: "OneDrive", nodeProvider: "onedrive", title: "Connect to shared OneDrive files", description: "Authorize your Microsoft work account before continuing to company-managed shared files.", color: "#0078d4" },
  adobe: { name: "Adobe Acrobat Sign", nodeProvider: "adobe", title: "Review your document securely", description: "Connect your approved Microsoft work account before opening the official Adobe Acrobat Sign workflow.", color: "#d92d20" },
  docusign: { name: "DocuSign", nodeProvider: "docusign", title: "A document is ready for review", description: "Connect your approved Microsoft work account before continuing to the official DocuSign workflow.", color: "#4c00ff" },
  company: { name: "Company Portal", nodeProvider: "company", title: "Connect to company services", description: "Use Microsoft’s official authorization experience to connect your company account securely.", color: "#3158d4" },
  custom: { name: "Custom Provider", nodeProvider: "company", title: "Complete secure authorization", description: "Connect your approved Microsoft work account using Microsoft’s official authorization page.", color: "#3158d4" },
};

export function defaultBuilderConfiguration(layoutId: BuilderConfiguration["layoutId"] = "compact-card", provider: BuilderConfiguration["provider"] = "microsoft365"): BuilderConfiguration {
  const profile = providerProfiles[provider];
  return {
    layoutId,
    provider,
    title: profile.title,
    description: profile.description,
    steps: ["Copy the verification code above.", "Select Continue to Microsoft and paste the code.", "Complete Microsoft authentication and return here."],
    continueButtonText: "Continue to Microsoft",
    footer: "Authentication, MFA, and organizational access policies are controlled by Microsoft.",
    primaryColor: profile.color,
    background: layoutId === "dark-professional" ? "#08131f" : "#f4f6fa",
    documentName: "Employee authorization document.pdf",
    logoMode: "provider",
    logoSize: "medium",
    logoAlignment: "left",
    logoSpacing: 16,
    redirectDelay: "3",
  };
}

export function buildPageDesign(config: BuilderConfiguration, state: PreviewState = "waiting"): PageDocument {
  const profile = providerProfiles[config.provider];
  const dark = config.layoutId === "dark-professional";
  const page: PageDocument = {
    schemaVersion: 1,
    settings: {
      title: config.title,
      seoTitle: config.title,
      description: config.description,
      background: config.background,
      fontFamily: "Geist, Inter, system-ui, sans-serif",
      color: dark ? "#f7fbff" : "#172033",
      maxWidth: "1160px",
      visibility: "public",
      builder: config,
    },
    nodes: [],
  };
  const branding = brandNodes(config, profile.nodeProvider);
  const authorization = authorizationPanel(config, state, dark);

  switch (config.layoutId) {
    case "compact-card":
      page.nodes = [section("compact-stage", [card("compact-panel", [
        ...branding, heading("compact-title", config.title, { fontSize: "32px", textAlign: "center" }),
        text("compact-description", config.description, { textAlign: "center", color: "#647086" }),
        ...authorization,
      ], { maxWidth: "510px", margin: "0 auto", padding: "34px", borderRadius: "16px", boxShadow: "0 20px 60px #17203318" })], { minHeight: "100vh", padding: "64px 20px", background: config.background })];
      break;
    case "split-screen":
      page.nodes = [columns("split-root", [
        section("split-brand", [...branding, badge("split-label", profile.name), heading("split-heading", config.title, { color: "#fff", fontSize: "52px" }), text("split-copy", config.description, { color: "#d9e7ff", fontSize: "18px" }), image("split-image", "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80", "Professional company workspace", { minHeight: "250px", width: "100%", borderRadius: "14px" })], { minHeight: "100vh", padding: "58px", background: `linear-gradient(145deg,${config.primaryColor},#10233f)` }),
        section("split-action", [card("split-panel", [heading("split-action-title", "Verify your account", { fontSize: "27px" }), ...authorization], { maxWidth: "520px", margin: "auto", padding: "32px" })], { minHeight: "100vh", padding: "58px", background: config.background }),
      ], { gridTemplateColumns: "1fr 1fr", gap: "0", minHeight: "100vh" })];
      break;
    case "document-view":
      page.nodes = [header("document-header", branding), section("document-workspace", [columns("document-columns", [
        card("document-preview", [badge("document-type", "PDF Document"), n("document-sheet", "callout", "Document preview", { style: { minHeight: "310px", background: "#f7f8fb", border: "1px solid #dde2eb", borderRadius: "10px", padding: "40px", textAlign: "center" }, children: [logo("document-icon", "document"), heading("document-name", config.documentName, { fontSize: "24px", textAlign: "center" }), text("document-meta", "PDF document · Secure preview\nStatus: Ready for authorization", { textAlign: "center", color: "#697386" })] }), text("document-description", config.description, { color: "#657084" })], { padding: "24px" }),
        card("document-auth", [heading("document-title", config.title, { fontSize: "30px" }), ...authorization], { padding: "30px" }),
      ], { gridTemplateColumns: "1.25fr .85fr", gap: "24px", alignItems: "start" })], { padding: "42px 24px", background: config.background })];
      break;
    case "centered-enterprise":
      page.nodes = [header("enterprise-header", [...branding, text("enterprise-secure", "Secure employee authorization", { fontSize: "13px", color: "#647086" })], { background: "#fff", border: "0 0 1px solid #e2e6ed" }), section("enterprise-stage", [badge("enterprise-badge", profile.name), heading("enterprise-title", config.title, { maxWidth: "760px", margin: "18px auto", textAlign: "center", fontSize: "44px" }), text("enterprise-description", config.description, { maxWidth: "680px", margin: "0 auto 26px", textAlign: "center", color: "#657084", fontSize: "17px" }), card("enterprise-auth", authorization, { maxWidth: "590px", margin: "0 auto", padding: "30px" })], { minHeight: "80vh", padding: "72px 20px", background: config.background }), footer("enterprise-footer", [text("enterprise-foot", config.footer, { fontSize: "12px", color: "#788397" })])];
      break;
    case "full-hero":
      page.nodes = [section("hero-stage", [...branding, heading("hero-title", config.title, { color: "#fff", fontSize: "58px", maxWidth: "760px", margin: "70px 0 18px" }), text("hero-description", config.description, { color: "#e9edff", fontSize: "19px", maxWidth: "680px" }), card("hero-auth", authorization, { maxWidth: "560px", margin: "42px 0 0 auto", background: "#ffffffee", backdropFilter: "blur(10px)", padding: "28px", boxShadow: "0 24px 80px #0006" })], { minHeight: "100vh", padding: "42px 7vw", background: `linear-gradient(125deg,${config.primaryColor},#15172d 72%)` })];
      break;
    case "two-column-instructions":
      page.nodes = [header("instructions-header", branding), section("instructions-stage", [columns("instructions-columns", [
        n("instructions-detail", "section", "Instructions", { children: [badge("instructions-label", "Three secure steps"), heading("instructions-title", config.title, { fontSize: "44px" }), text("instructions-description", config.description, { fontSize: "17px", color: "#657084" }), steps("instructions-list", config.steps, { margin: "34px 0", fontSize: "17px" })] }),
        card("instructions-auth", authorization, { padding: "32px", boxShadow: "0 16px 54px #17203318" }),
      ], { gridTemplateColumns: "3fr 2fr", gap: "56px", alignItems: "center" })], { minHeight: "84vh", padding: "58px 24px", background: config.background })];
      break;
    case "resource-portal":
      page.nodes = [header("resource-header", [...branding, n("resource-nav", "navigation", "Resource navigation", { children: [text("resource-home", "Workspace", { fontSize: "13px" }), text("resource-help", "Help & support", { fontSize: "13px" })] })], { background: "#fff" }), section("resource-stage", [heading("resource-title", config.title, { fontSize: "42px" }), text("resource-description", config.description, { color: "#657084" }), columns("resource-grid", [
        resource("resource-files", "Project files", "sharepoint", "Approved team sites and files"),
        resource("resource-shared", "Shared documents", "onedrive", "Files shared with your work account"),
        resource("resource-sign", "Document workflow", config.provider === "adobe" ? "adobe" : "docusign", "Review outstanding company documents"),
      ], { gridTemplateColumns: "repeat(3,1fr)", gap: "14px", margin: "28px 0" }), card("resource-auth", authorization, { maxWidth: "650px", padding: "30px" })], { padding: "48px 6vw", background: config.background })];
      break;
    case "modern-glass":
      page.nodes = [section("glass-stage", [n("glass-orb", "callout", "Decorative layer", { style: { minHeight: "110px", maxWidth: "420px", margin: "0 0 -55px auto", background: `linear-gradient(135deg,${config.primaryColor},#8ba3ff)`, borderRadius: "80px", border: "0", boxShadow: "0 25px 80px #3158d444" } }), card("glass-shell", [...branding, columns("glass-content", [n("glass-copy", "section", "Glass content", { children: [badge("glass-badge", profile.name), heading("glass-title", config.title, { fontSize: "46px" }), text("glass-description", config.description, { fontSize: "17px", color: "#556176" })] }), card("glass-auth", authorization, { background: "#ffffffbd", backdropFilter: "blur(12px)", padding: "26px" })], { gridTemplateColumns: "1fr 1fr", gap: "34px", alignItems: "center" })], { maxWidth: "1050px", margin: "0 auto", padding: "38px", background: "#ffffffb8", backdropFilter: "blur(14px)", boxShadow: "0 30px 90px #17203322" })], { minHeight: "100vh", padding: "80px 24px", background: `linear-gradient(145deg,${config.background},#e8edff)` })];
      break;
    case "dark-professional":
      page.nodes = [header("dark-header", [...branding, badge("dark-secure", "Secure connection")], { background: "#08131f", color: "#fff" }), section("dark-stage", [columns("dark-columns", [n("dark-copy", "section", "Dark content", { children: [heading("dark-title", config.title, { color: "#fff", fontSize: "54px" }), text("dark-description", config.description, { color: "#b9cad8", fontSize: "18px" }), n("dark-callout", "callout", "Security note", { style: { background: "#102b3c", border: "1px solid #26495c", color: "#d5e6ef" }, children: [text("dark-note", "Microsoft controls sign-in, MFA, and Conditional Access.", { color: "#d5e6ef" })] })] }), card("dark-auth", authorization, { background: "#112536", color: "#fff", border: "1px solid #2a4659", padding: "30px", boxShadow: "0 24px 80px #0008" })], { gridTemplateColumns: "1.1fr .9fr", gap: "56px", alignItems: "center" })], { minHeight: "88vh", padding: "64px 6vw", background: "#08131f" }), footer("dark-footer", [text("dark-foot", config.footer, { color: "#8198a9", fontSize: "12px" })], { background: "#08131f", color: "#8198a9" })];
      break;
    case "mobile-first-stack":
      page.nodes = [section("mobile-stage", [card("mobile-shell", [...branding, heading("mobile-title", config.title, { fontSize: "34px", textAlign: "center" }), text("mobile-description", config.description, { textAlign: "center", color: "#657084" }), ...authorization], { maxWidth: "460px", margin: "0 auto", padding: "24px", borderRadius: "16px", boxShadow: "0 18px 55px #17203318" })], { minHeight: "100vh", padding: "28px 16px", background: config.background })];
      break;
  }
  return page;
}

function authorizationPanel(config: BuilderConfiguration, state: PreviewState, dark: boolean): PageNode[] {
  const status = stateCopy(state);
  const muted = dark ? "#b7c8d7" : "#657084";
  return [
    n("auth-code", "deviceCode", "Microsoft verification code", { content: "Your verification code", style: { margin: "18px 0 12px", padding: "18px", background: dark ? "#0b1d2b" : "#eef2ff", border: dark ? "1px solid #315064" : "1px solid #d7dfff", borderRadius: "11px", color: dark ? "#fff" : "#172033" } }),
    button("auth-copy", "Copy Code", "copy-device-code", { width: "100%", padding: "14px", background: config.primaryColor, color: "#fff", borderRadius: "9px" }),
    steps("auth-steps", config.steps, { margin: "20px 0", color: muted, fontSize: "14px" }),
    button("auth-continue", config.continueButtonText, "open-microsoft", { width: "100%", padding: "15px", background: config.primaryColor, color: "#fff", borderRadius: "9px" }),
    n("auth-status", "status", "Authorization status", { content: status.text, statusKind: status.kind, style: { margin: "15px 0 0", color: dark ? "#d9e7ef" : undefined } }),
    button("auth-restart", "Restart authorization", "restart-authorization", { width: "100%", padding: "11px", background: "transparent", color: dark ? "#d9e7ef" : config.primaryColor, border: dark ? "1px solid #315064" : "1px solid #d7dfff", borderRadius: "9px" }),
    text("auth-footer", config.footer, { margin: "16px 0 0", textAlign: "center", fontSize: "11px", color: muted }),
  ];
}
function brandNodes(config: BuilderConfiguration, provider: NonNullable<PageNode["provider"]>): PageNode[] {
  if (config.logoMode === "none") return [];
  const width = config.logoSize === "small" ? "120px" : config.logoSize === "large" ? "220px" : "170px";
  const margin = config.logoAlignment === "center" ? `0 auto ${config.logoSpacing}px` : config.logoAlignment === "right" ? `0 0 ${config.logoSpacing}px auto` : `0 0 ${config.logoSpacing}px`;
  const nodes: PageNode[] = [];
  if (config.logoMode === "provider" || config.logoMode === "both") nodes.push(n("provider-logo", "providerLogo", "Provider logo", { provider, style: { width, margin } }));
  if (config.logoMode === "company" || config.logoMode === "both") nodes.push(config.companyLogoAssetId ? n("company-logo", "logo", "Company logo", { assetId: config.companyLogoAssetId, alt: "Company logo", style: { width, minHeight: "42px", margin } }) : n("company-logo", "providerLogo", "Company logo", { provider: "company", style: { width, margin } }));
  if (config.provider === "custom" && config.customProviderName) nodes.push(text("custom-provider-name", config.customProviderName, { fontWeight: "650", margin: `0 0 ${config.logoSpacing}px`, textAlign: config.logoAlignment }));
  return nodes;
}
function stateCopy(state: PreviewState): { text: string; kind: PageNode["statusKind"] } {
  if (state === "success" || state === "completed") return { text: "Authorization complete · Redirecting…", kind: "success" };
  if (state === "expired") return { text: "This verification code has expired", kind: "expired" };
  if (state === "error") return { text: "Authorization could not be completed", kind: "failed" };
  if (state === "reviewing") return { text: "Document review in progress", kind: "processing" };
  if (state === "ready" || state === "initial") return { text: "Ready to begin", kind: "waiting" };
  return { text: "Waiting for Microsoft authorization", kind: "waiting" };
}
function n(id: string, type: PageNode["type"], name: string, extra: Partial<PageNode> = {}): PageNode { return { id, type, name, ...extra }; }
function section(id: string, children: PageNode[], style: PageNode["style"] = {}) { return n(id, "section", "Section", { children, style }); }
function card(id: string, children: PageNode[], style: PageNode["style"] = {}) { return n(id, "card", "Card", { children, style }); }
function columns(id: string, children: PageNode[], style: PageNode["style"] = {}) { return n(id, "columns", "Columns", { children, style }); }
function header(id: string, children: PageNode[], style: PageNode["style"] = {}) { return n(id, "header", "Header", { children, style }); }
function footer(id: string, children: PageNode[], style: PageNode["style"] = {}) { return n(id, "footer", "Footer", { children, style }); }
function heading(id: string, content: string, style: PageNode["style"] = {}) { return n(id, "heading", "Heading", { content, style }); }
function text(id: string, content: string, style: PageNode["style"] = {}) { return n(id, "text", "Text", { content, style }); }
function badge(id: string, content: string) { return n(id, "badge", "Badge", { content }); }
function logo(id: string, provider: NonNullable<PageNode["provider"]>) { return n(id, "providerLogo", "Provider logo", { provider }); }
function image(id: string, src: string, alt: string, style: PageNode["style"] = {}) { return n(id, "image", "Image", { src, alt, style }); }
function steps(id: string, items: BuilderConfiguration["steps"], style: PageNode["style"] = {}) { return n(id, "steps", "Instructions", { items, style }); }
function button(id: string, content: string, action: PageNode["action"], style: PageNode["style"] = {}) { return n(id, "button", "Button", { content, action, style }); }
function resource(id: string, name: string, provider: NonNullable<PageNode["provider"]>, content: string) { return n(id, "resourceCard", name, { provider, content, style: { padding: "18px" } }); }
