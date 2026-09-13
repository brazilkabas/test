import type { PageDocument, PageNode } from "@/lib/page-document";

type Template = {
  id: string;
  name: string;
  category: string;
  description: string;
  layout: string;
  accent: string;
  document: PageDocument;
};

const baseSettings = (title: string, background = "#f5f7fb", color = "#172033"): PageDocument["settings"] => ({
  title,
  seoTitle: title,
  description: "A secure company-managed page.",
  background,
  fontFamily: "Inter, system-ui, sans-serif",
  color,
  maxWidth: "1120px",
  visibility: "public",
});
const n = (id: string, type: PageNode["type"], name: string, extra: Partial<PageNode> = {}): PageNode => ({ id, type, name, ...extra });
const logo = (id: string, provider: NonNullable<PageNode["provider"]> = "company") => n(id, "providerLogo", "Provider logo", { provider });
const heading = (id: string, content: string, style: PageNode["style"] = {}) => n(id, "heading", "Heading", { content, style });
const text = (id: string, content: string, style: PageNode["style"] = {}) => n(id, "text", "Text", { content, style });
const button = (id: string, content: string, action: PageNode["action"], href = "", style: PageNode["style"] = {}) => n(id, "button", "Button", { content, action, href, style });
const status = (id: string, content = "Waiting for authorization") => n(id, "status", "Status", { content, statusKind: "waiting" });
const code = (id: string) => n(id, "deviceCode", "Microsoft Device Code", { content: "Your Microsoft device code", style: { margin: "22px 0" } });
const section = (id: string, children: PageNode[], style: PageNode["style"] = {}) => n(id, "section", "Section", { children, style });
const card = (id: string, children: PageNode[], style: PageNode["style"] = {}) => n(id, "card", "Card", { children, style });

export const visualTemplates: Template[] = [
  {
    id: "microsoft-compact-card", name: "Compact Microsoft Card", category: "Microsoft Connection",
    description: "A focused, compact connection card with protected dynamic code.", layout: "Compact Card", accent: "#3157d5",
    document: { schemaVersion: 1, settings: baseSettings("Connect your Microsoft 365 account"), nodes: [
      section("compact-wrap", [card("compact-card", [
        logo("compact-logo", "microsoft365"),
        heading("compact-title", "Connect your Microsoft 365 account", { fontSize: "32px", textAlign: "center" }),
        text("compact-copy", "Use the code below on Microsoft's official website. We never ask for your Microsoft password.", { textAlign: "center" }),
        code("compact-code"), status("compact-status"),
        button("compact-copy-button", "Copy code", "copy-device-code", "", { width: "100%" }),
        button("compact-open-button", "Continue to Microsoft", "open-microsoft", "", { width: "100%", background: "#172033" }),
        text("compact-footer", "Authentication and MFA are controlled by Microsoft.", { fontSize: "13px", textAlign: "center", color: "#6b7486" }),
      ], { maxWidth: "520px", margin: "0 auto", padding: "36px", borderRadius: "22px" })], { minHeight: "100vh", padding: "64px 20px", background: "linear-gradient(135deg,#eef3ff,#f8faff)" }),
    ] },
  },
  {
    id: "microsoft-split-screen", name: "Microsoft Split Screen", category: "Microsoft Connection",
    description: "Wide brand story and illustration beside a dedicated action panel.", layout: "Split Screen 50/50", accent: "#0f6cbd",
    document: { schemaVersion: 1, settings: baseSettings("Connect to company Microsoft services", "#0e2948", "#ffffff"), nodes: [
      n("split", "columns", "Split screen", { style: { minHeight: "100vh", gap: "0" }, children: [
        section("split-brand", [logo("split-logo", "microsoft365"), heading("split-message", "Your work, connected securely.", { color: "#fff" }), text("split-description", "Connect approved Microsoft 365 services while Microsoft keeps control of sign-in, MFA, and device policy.", { color: "#d7eaff", fontSize: "19px" }), n("split-image", "image", "Brand illustration", { src: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80", alt: "Modern company workspace", style: { borderRadius: "22px", minHeight: "280px", width: "100%" } })], { background: "#0e2948", padding: "64px", minHeight: "100vh" }),
        section("split-action", [card("split-card", [heading("split-title", "Complete your connection", { fontSize: "34px" }), n("split-steps", "steps", "Instructions", { items: ["Copy the Microsoft-issued code.", "Open Microsoft's official authorization page.", "Sign in and approve the requested company access."] }), code("split-code"), button("split-copy", "Copy Microsoft code", "copy-device-code"), button("split-open", "Open Microsoft", "open-microsoft"), status("split-status")], { maxWidth: "560px", margin: "auto", boxShadow: "0 24px 80px #071a2d33" })], { background: "#f4f7fb", padding: "64px", minHeight: "100vh" }),
      ] }),
    ] },
  },
  {
    id: "centered-modern", name: "Centered Modern", category: "Employee Onboarding",
    description: "Large editorial typography with a clean central action area.", layout: "Centered Modern", accent: "#6750d8",
    document: { schemaVersion: 1, settings: baseSettings("Welcome to your employee portal", "#faf9ff"), nodes: [
      section("modern-hero", [logo("modern-logo", "company"), n("modern-badge", "badge", "Badge", { content: "Employee onboarding" }), heading("modern-heading", "Everything you need for a confident first week.", { fontSize: "60px", textAlign: "center", maxWidth: "900px", margin: "20px auto" }), text("modern-text", "Access approved tools, documents, and support from one secure company page.", { textAlign: "center", fontSize: "20px" }), button("modern-action", "Open onboarding resources", "open-url", "https://company.example/onboarding", { background: "#6750d8", padding: "16px 28px" }), status("modern-status", "Resources are available")], { textAlign: "center", minHeight: "78vh", padding: "110px 24px" }),
      n("modern-footer", "footer", "Footer", { children: [text("modern-footer-copy", "Company Portal · Employee Experience", { fontSize: "13px" }), button("modern-support", "Get support", "open-url", "https://company.example/support", { background: "transparent", color: "#6750d8" })] }),
    ] },
  },
  {
    id: "minimal", name: "Minimal Action", category: "Generic Landing Page",
    description: "Very little chrome, generous white space, and one action.", layout: "Minimal", accent: "#111827",
    document: { schemaVersion: 1, settings: baseSettings("A clear next step", "#ffffff"), nodes: [
      section("minimal-section", [logo("minimal-logo", "company"), heading("minimal-title", "One clear message.", { fontSize: "52px", maxWidth: "620px", margin: "80px 0 24px" }), text("minimal-copy", "Use this page when employees need a focused explanation and one approved destination.", { maxWidth: "580px", fontSize: "19px" }), button("minimal-button", "Continue", "open-url", "https://company.example", { background: "#111827", margin: "24px 0" }), n("minimal-divider", "divider", "Divider"), text("minimal-help", "Questions? Contact the internal support team.", { fontSize: "14px", color: "#6b7280" })], { maxWidth: "760px", margin: "0 auto", padding: "72px 28px" }),
    ] },
  },
  {
    id: "dark-professional", name: "Dark Professional", category: "Company Notice",
    description: "Dark executive presentation with high-contrast action hierarchy.", layout: "Dark Professional", accent: "#5eead4",
    document: { schemaVersion: 1, settings: baseSettings("Executive company update", "#08131f", "#f5fbff"), nodes: [
      n("dark-header", "header", "Header", { style: { background: "#08131f", color: "#fff" }, children: [logo("dark-logo", "company"), n("dark-badge", "badge", "Classification", { content: "Internal" })] }),
      section("dark-hero", [heading("dark-title", "A professional update for your team.", { color: "#fff", maxWidth: "760px", fontSize: "58px" }), text("dark-copy", "Present leadership communication, operational changes, or critical company information with clarity.", { color: "#b7cad9", maxWidth: "700px", fontSize: "19px" }), card("dark-card", [heading("dark-card-title", "What changes", { color: "#fff", fontSize: "28px" }), text("dark-card-copy", "Add the approved details and actions employees need to understand.", { color: "#c6d5df" }), button("dark-primary", "Read full notice", "open-url", "https://company.example/notice", { background: "#5eead4", color: "#06211d" }), button("dark-secondary", "Contact leadership", "open-url", "https://company.example/contact", { background: "transparent", color: "#fff", border: "1px solid #496274" })], { background: "#102435", border: "1px solid #294154", boxShadow: "0 30px 80px #0008", maxWidth: "760px", margin: "48px 0" })], { minHeight: "82vh", background: "#08131f", padding: "80px 7vw" }),
    ] },
  },
  {
    id: "document-portal", name: "Document Portal", category: "Document Workflow",
    description: "Document metadata, workflow status, instructions, and provider action.", layout: "Document Portal", accent: "#e41e2b",
    document: { schemaVersion: 1, settings: baseSettings("Document review portal"), nodes: [
      n("doc-header", "header", "Portal header", { children: [logo("doc-company", "company"), text("doc-secure", "Secure document workflow", { fontWeight: "700" })] }),
      section("doc-content", [n("doc-columns", "columns", "Document layout", { children: [
        card("doc-info", [logo("doc-provider", "adobe"), n("doc-status-badge", "badge", "Document status", { content: "Signature required" }), heading("doc-title", "Employee Agreement", { fontSize: "36px" }), text("doc-meta", "Prepared for: Employee Name\nDocument ID: DOC-2026-1042\nDue: September 30, 2026"), button("doc-review", "Review in Adobe Acrobat Sign", "open-url", "https://secure.adobesign.com/", { background: "#e41e2b" })], { padding: "36px" }),
        section("doc-instructions", [heading("doc-instruction-title", "Before you sign", { fontSize: "32px" }), n("doc-steps", "steps", "Signing steps", { items: ["Open the official Adobe Acrobat Sign workflow.", "Review every page and confirm your information.", "Complete the provider-controlled signature process."] }), n("doc-callout", "callout", "Security callout", { content: "", children: [text("doc-callout-text", "This company page never asks for your Adobe password. Authentication occurs only with the official provider.", { color: "#7a2d34" })], style: { background: "#fff4f5", border: "1px solid #ffd1d6" } })])], style: { alignItems: "start" } })], { padding: "60px 24px" }),
    ] },
  },
  {
    id: "resource-portal", name: "Company Resource Portal", category: "Internal Resource",
    description: "A responsive service-card collection for approved company systems.", layout: "Resource Portal", accent: "#03787c",
    document: { schemaVersion: 1, settings: baseSettings("Company resources", "#f1f7f8"), nodes: [
      n("resource-header", "header", "Header navigation", { style: { background: "#fff", boxShadow: "0 4px 20px #1720330d" }, children: [logo("resource-company", "company"), n("resource-nav", "navigation", "Navigation", { children: [button("resource-help", "Support", "open-url", "https://company.example/support", { background: "transparent", color: "#3157d5" })] })] }),
      section("resource-hero", [heading("resource-title", "Your company resources", { fontSize: "48px" }), text("resource-copy", "Open the services and files you are authorized to use.", { fontSize: "19px" }), n("resource-grid", "columns", "Resource cards", { children: [
        n("sharepoint-card", "resourceCard", "Project Files", { provider: "sharepoint", content: "Access approved project sites and team documents.", children: [button("sharepoint-open", "Open SharePoint", "open-url", "https://company.sharepoint.com/")] }),
        n("onedrive-card", "resourceCard", "Shared Files", { provider: "onedrive", content: "Open files shared with your work account.", children: [button("onedrive-open", "Open OneDrive", "open-url", "https://onedrive.com/")] }),
        n("docusign-card", "resourceCard", "Documents to Sign", { provider: "docusign", content: "Review envelopes in the official DocuSign experience.", children: [button("docusign-open", "Open DocuSign", "open-url", "https://www.docusign.net/")] }),
        n("support-card", "resourceCard", "Employee Support", { provider: "company", content: "Get help from the internal support team.", children: [button("support-open", "Request support", "open-url", "https://company.example/support")] }),
      ], style: { margin: "36px 0", gap: "18px" } })], { padding: "72px 24px" }),
    ] },
  },
  {
    id: "two-column-instructions", name: "Two-Column Instructions", category: "Support Page",
    description: "Detailed guided steps beside a sticky action panel.", layout: "Two-Column Instructions 60/40", accent: "#2563eb",
    document: { schemaVersion: 1, settings: baseSettings("Complete this company task"), nodes: [
      n("instruction-header", "header", "Header", { children: [logo("instruction-logo", "company"), text("instruction-support", "Need help? Contact support.", { fontSize: "14px" })] }),
      section("instruction-wrap", [n("instruction-columns", "columns", "Instructions and action", { style: { gap: "56px", alignItems: "start" }, children: [
        section("instruction-main", [n("instruction-badge", "badge", "Category", { content: "Required action" }), heading("instruction-title", "Complete your employee setup", { fontSize: "46px" }), text("instruction-intro", "Follow each step in order. You can return to this page at any time."), n("instruction-list", "steps", "Instruction steps", { items: ["Review the company policy document.", "Connect required company services.", "Confirm your contact information.", "Submit completion to your manager."] })]),
        card("instruction-action", [heading("instruction-action-title", "Ready to begin?", { fontSize: "28px" }), text("instruction-action-copy", "The workflow opens in the approved internal application."), status("instruction-status", "Not started"), button("instruction-start", "Start setup", "internal-route", "/admin", { width: "100%" })], { boxShadow: "0 18px 55px #17203318" }),
      ] })], { padding: "64px 24px" }),
    ] },
  },
  {
    id: "full-hero", name: "Full Image Hero", category: "Generic Landing Page",
    description: "Immersive full-bleed photography with overlay action panel.", layout: "Full Hero", accent: "#f59e0b",
    document: { schemaVersion: 1, settings: { ...baseSettings("Company campaign", "#172033", "#fff"), backgroundImage: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1800&q=85" }, nodes: [
      n("hero-header", "header", "Transparent header", { style: { color: "#fff", background: "#09111d99" }, children: [logo("hero-logo", "company"), button("hero-nav", "Employee portal", "internal-route", "/admin", { background: "transparent", border: "1px solid #fff" })] }),
      section("full-hero-content", [card("hero-overlay", [n("hero-badge", "badge", "Campaign badge", { content: "Company initiative" }), heading("hero-title", "Make the next company milestone visible.", { color: "#fff", fontSize: "58px" }), text("hero-copy", "Use a bold visual story and a focused call to action.", { color: "#e7edf5", fontSize: "20px" }), button("hero-action", "Explore the initiative", "open-url", "https://company.example", { background: "#f59e0b", color: "#1f1704" })], { maxWidth: "680px", margin: "10vh 5vw", background: "#09111ddd", border: "1px solid #ffffff33", boxShadow: "0 30px 90px #0008" })], { minHeight: "86vh", padding: "40px" }),
    ] },
  },
  {
    id: "mobile-compact", name: "Mobile Compact", category: "Employee Onboarding",
    description: "Thumb-friendly, narrow layout optimized for employee phones.", layout: "Mobile Compact", accent: "#0f766e",
    document: { schemaVersion: 1, settings: { ...baseSettings("Mobile employee action", "#ecfdf8"), maxWidth: "460px" }, nodes: [
      section("mobile-wrap", [logo("mobile-logo", "company"), heading("mobile-title", "Complete this step on your phone", { fontSize: "34px", margin: "36px 0 12px" }), text("mobile-copy", "A concise mobile-first experience with large touch targets and clear status."), card("mobile-card", [status("mobile-status", "Ready"), n("mobile-steps", "steps", "Steps", { items: ["Review the instructions.", "Open the approved service.", "Return here when complete."] }), button("mobile-primary", "Continue", "open-url", "https://company.example", { width: "100%", padding: "16px" }), button("mobile-help", "Get help", "open-url", "https://company.example/support", { width: "100%", background: "#d9eee8", color: "#0f5f57" })], { padding: "22px", borderRadius: "18px" }), text("mobile-footer", "Company-managed secure page", { textAlign: "center", fontSize: "12px", color: "#658078" })], { maxWidth: "460px", margin: "0 auto", padding: "32px 18px" }),
    ] },
  },
  {
    id: "enterprise-portal", name: "Enterprise Portal", category: "Internal Resource",
    description: "Navigation, announcement region, service grid, and structured footer.", layout: "Enterprise Portal", accent: "#1d4ed8",
    document: { schemaVersion: 1, settings: baseSettings("Enterprise employee portal", "#eef2f8"), nodes: [
      n("enterprise-header", "header", "Enterprise navigation", { style: { background: "#10233f", color: "#fff" }, children: [logo("enterprise-logo", "company"), n("enterprise-nav", "navigation", "Navigation links", { children: [button("nav-home", "Home", "internal-route", "/", { background: "transparent" }), button("nav-resources", "Resources", "open-url", "#resources", { background: "transparent" }), button("nav-support", "Support", "open-url", "https://company.example/support", { background: "#3157d5" })] })] }),
      section("enterprise-main", [n("enterprise-callout", "callout", "Announcement", { style: { background: "#dbeafe", border: "1px solid #93c5fd" }, children: [n("enterprise-badge", "badge", "Announcement badge", { content: "Company update" }), heading("enterprise-title", "Welcome to the employee portal", { fontSize: "42px" }), text("enterprise-copy", "Find approved systems, documents, and current company information.") ] }), n("enterprise-grid", "columns", "Portal cards", { children: [
        n("enterprise-m365", "resourceCard", "Microsoft 365", { provider: "microsoft365", content: "Mail, collaboration, and approved company services.", children: [button("enterprise-m365-open", "Open service", "open-microsoft")] }),
        n("enterprise-sharepoint", "resourceCard", "SharePoint", { provider: "sharepoint", content: "Team sites and document libraries.", children: [button("enterprise-sp-open", "Browse sites", "open-url", "https://company.sharepoint.com/")] }),
        n("enterprise-docs", "resourceCard", "Document Center", { provider: "document", content: "Policies, forms, and employee documents.", children: [button("enterprise-docs-open", "View documents", "internal-route", "/documents")] }),
      ], style: { margin: "24px 0" } })], { padding: "48px 24px" }),
      n("enterprise-footer", "footer", "Enterprise footer", { style: { background: "#10233f", color: "#c9d6e7" }, children: [text("enterprise-copyright", "© 2026 Company. Internal use only.", { fontSize: "13px" }), text("enterprise-contact", "Support · Privacy · Accessibility", { fontSize: "13px" })] }),
    ] },
  },
  {
    id: "status-page", name: "Workflow Status Page", category: "Document Workflow",
    description: "Progress-focused status, timeline, instructions, and recovery actions.", layout: "Status Page", accent: "#7c3aed",
    document: { schemaVersion: 1, settings: baseSettings("Workflow status", "#f7f5ff"), nodes: [
      section("status-wrap", [logo("status-logo", "company"), card("status-card", [n("status-badge", "badge", "Reference", { content: "Request #1042" }), heading("status-title", "Your request is processing", { fontSize: "40px" }), status("status-indicator", "Processing securely"), n("status-divider", "divider", "Divider"), n("status-steps", "steps", "Progress steps", { items: ["Request received", "**Identity verification in progress**", "Final review", "Complete"] }), text("status-help", "You can safely close this page and return later. No action is required right now.", { color: "#697386" }), button("status-refresh", "Refresh status", "internal-route", "#", { background: "#7c3aed" }), button("status-support", "Contact support", "open-url", "https://company.example/support", { background: "transparent", color: "#7c3aed", border: "1px solid #c4b5fd" })], { maxWidth: "680px", margin: "48px auto", padding: "40px" })], { padding: "50px 20px", minHeight: "100vh" }),
    ] },
  },
  {
    id: "sharepoint-hub", name: "SharePoint Project Hub", category: "SharePoint",
    description: "Project navigation with automatic SharePoint branding and resource cards.", layout: "Resource Hub", accent: "#03787c",
    document: { schemaVersion: 1, settings: baseSettings("SharePoint project hub", "#edf8f7"), nodes: [
      n("sp-header", "header", "SharePoint header", { style: { background: "#073b3c", color: "#fff" }, children: [logo("sp-logo", "sharepoint"), text("sp-company", "Company project workspace", { fontWeight: "700" })] }),
      section("sp-content", [heading("sp-title", "Project files and collaboration"), text("sp-copy", "Open approved SharePoint libraries, project plans, and team resources."), n("sp-grid", "columns", "SharePoint resources", { children: [n("sp-files", "resourceCard", "Project Files", { provider: "sharepoint", content: "Documents and deliverables", children: [button("sp-files-open", "Open files", "open-url", "https://company.sharepoint.com/")] }), n("sp-plan", "resourceCard", "Project Plan", { provider: "document", content: "Current milestones and decisions", children: [button("sp-plan-open", "View plan", "open-url", "https://company.sharepoint.com/")] })] })], { padding: "72px 24px" }),
    ] },
  },
  {
    id: "onedrive-files", name: "OneDrive Shared Files", category: "OneDrive",
    description: "Clean shared-file handoff with automatic OneDrive branding.", layout: "Minimal File Portal", accent: "#0078d4",
    document: { schemaVersion: 1, settings: baseSettings("Shared files", "#f2f8ff"), nodes: [
      section("od-wrap", [logo("od-logo", "onedrive"), heading("od-title", "Files have been shared with you", { maxWidth: "700px", fontSize: "50px" }), text("od-copy", "Open OneDrive using your official Microsoft work account to view permitted files.", { maxWidth: "620px", fontSize: "18px" }), card("od-file-card", [n("od-file-icon", "providerLogo", "OneDrive icon", { provider: "onedrive" }), heading("od-file-title", "Shared project folder", { fontSize: "26px" }), text("od-file-meta", "12 files · Updated recently"), button("od-open", "Open in OneDrive", "open-url", "https://onedrive.com/", { background: "#0078d4" })], { maxWidth: "620px", margin: "38px 0" })], { padding: "90px 8vw", minHeight: "100vh" }),
    ] },
  },
  {
    id: "adobe-sign", name: "Adobe Acrobat Sign Review", category: "Adobe Acrobat Sign",
    description: "Signature-required document presentation with automatic Adobe branding.", layout: "Document Action", accent: "#e41e2b",
    document: { schemaVersion: 1, settings: baseSettings("Signature required"), nodes: [
      n("adobe-header", "header", "Document header", { children: [logo("adobe-logo", "adobe"), n("adobe-status", "badge", "Status", { content: "Signature required", style: { background: "#fff0f1", color: "#b91c2b" } })] }),
      section("adobe-wrap", [card("adobe-document", [heading("adobe-title", "Review and sign your document", { fontSize: "42px" }), text("adobe-copy", "Your approved agreement is ready in Adobe Acrobat Sign."), n("adobe-steps", "steps", "Signing instructions", { items: ["Open the official Adobe Acrobat Sign page.", "Review the document details.", "Complete the provider-controlled signature."] }), button("adobe-open", "Review document", "open-url", "https://secure.adobesign.com/", { background: "#e41e2b", padding: "15px 24px" }), text("adobe-security", "Never enter an Adobe password on this company page.", { fontSize: "13px", color: "#6b7280" })], { maxWidth: "760px", margin: "0 auto", padding: "48px" })], { padding: "70px 24px" }),
    ] },
  },
  {
    id: "docusign-envelope", name: "DocuSign Envelope Ready", category: "DocuSign",
    description: "Envelope-centric workflow with automatic DocuSign branding.", layout: "Split Document Workflow", accent: "#4c00ff",
    document: { schemaVersion: 1, settings: baseSettings("DocuSign envelope ready", "#f5f3ff"), nodes: [
      n("ds-columns", "columns", "DocuSign split", { style: { minHeight: "100vh", gap: "0" }, children: [
        section("ds-brand", [logo("ds-logo", "docusign"), heading("ds-message", "A document is ready for your review.", { color: "#fff", fontSize: "52px" }), text("ds-description", "Complete the signing workflow securely in the official DocuSign experience.", { color: "#ddd6fe", fontSize: "18px" })], { background: "#24105c", color: "#fff", padding: "80px 7vw", minHeight: "100vh" }),
        section("ds-action", [card("ds-card", [n("ds-badge", "badge", "Envelope status", { content: "Ready for signature" }), heading("ds-title", "Employment document", { fontSize: "34px" }), text("ds-meta", "Envelope ID: DSE-1042\nSent by: Company People Team"), button("ds-open", "Open DocuSign", "open-url", "https://www.docusign.net/", { background: "#4c00ff", width: "100%" }), text("ds-safe", "This page does not collect your DocuSign password.", { textAlign: "center", fontSize: "13px" })], { maxWidth: "520px", margin: "auto" })], { padding: "70px", minHeight: "100vh" }),
      ] }),
    ] },
  },
  {
    id: "blank", name: "Blank Canvas", category: "Blank Page",
    description: "An empty contained section ready for custom components.", layout: "Blank Page", accent: "#64748b",
    document: { schemaVersion: 1, settings: baseSettings("Untitled page"), nodes: [section("blank-section", [heading("blank-title", "Start building your page"), text("blank-text", "Select this text to edit it, or drag components from the left panel.")], { padding: "80px 24px" })] },
  },
];

export function getVisualTemplate(id: string) {
  return visualTemplates.find((template) => template.id === id) ?? visualTemplates.at(-1)!;
}

export function cloneDocument(document: PageDocument): PageDocument {
  return structuredClone(document);
}
