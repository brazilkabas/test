import { z } from "zod";

export const nodeTypes = [
  "section", "header", "footer", "columns", "card", "heading", "text", "button",
  "image", "logo", "providerLogo", "deviceCode", "status", "steps", "resourceCard",
  "divider", "badge", "callout", "navigation",
] as const;
export type PageNodeType = (typeof nodeTypes)[number];

export type NodeStyle = {
  background?: string;
  backgroundImage?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: "left" | "center" | "right";
  padding?: string;
  margin?: string;
  width?: string;
  maxWidth?: string;
  minHeight?: string;
  border?: string;
  borderRadius?: string;
  boxShadow?: string;
  gap?: string;
  alignItems?: string;
  justifyContent?: string;
  gridTemplateColumns?: string;
  backdropFilter?: string;
};

export type PageNode = {
  id: string;
  type: PageNodeType;
  name: string;
  content?: string;
  href?: string;
  action?: "open-url" | "open-microsoft" | "copy-device-code" | "restart-authorization" | "copy-text" | "download" | "internal-route";
  provider?: "microsoft365" | "sharepoint" | "onedrive" | "adobe" | "docusign" | "document" | "cloud" | "company";
  assetId?: string;
  src?: string;
  alt?: string;
  icon?: string;
  targetBlank?: boolean;
  statusKind?: "waiting" | "connected" | "expired" | "failed" | "success" | "processing";
  items?: string[];
  style?: NodeStyle;
  hoverStyle?: NodeStyle;
  hidden?: boolean;
  hideDesktop?: boolean;
  hideMobile?: boolean;
  locked?: boolean;
  children?: PageNode[];
};

export type PageDocument = {
  schemaVersion: 1;
  settings: {
    title: string;
    seoTitle: string;
    description: string;
    background: string;
    backgroundImage?: string;
    fontFamily: string;
    color: string;
    maxWidth: string;
    faviconAssetId?: string;
    visibility: "public" | "private" | "access-code";
    expiresAt?: string;
    builder?: BuilderConfiguration;
  };
  nodes: PageNode[];
};

export type BuilderConfiguration = {
  layoutId: "compact-card" | "split-screen" | "document-view" | "centered-enterprise" | "full-hero" | "two-column-instructions" | "resource-portal" | "modern-glass" | "dark-professional" | "mobile-first-stack";
  provider: "microsoft365" | "sharepoint" | "onedrive" | "adobe" | "docusign" | "company" | "custom";
  customProviderName?: string;
  title: string;
  description: string;
  steps: [string, string, string];
  continueButtonText: string;
  footer: string;
  primaryColor: string;
  background: string;
  documentName: string;
  logoMode: "provider" | "company" | "both" | "none";
  logoSize: "small" | "medium" | "large";
  logoAlignment: "left" | "center" | "right";
  logoSpacing: number;
  companyLogoAssetId?: string;
  redirectUrl?: string;
  redirectDelay: "immediate" | "1" | "3" | "5" | "10" | "never";
};

const styleSchema = z.object({
  background: z.string().max(200).optional(),
  backgroundImage: z.string().max(2000).optional(),
  color: z.string().max(100).optional(),
  fontFamily: z.string().max(200).optional(),
  fontSize: z.string().max(50).optional(),
  fontWeight: z.string().max(30).optional(),
  fontStyle: z.string().max(30).optional(),
  textDecoration: z.string().max(60).optional(),
  lineHeight: z.string().max(30).optional(),
  letterSpacing: z.string().max(30).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  padding: z.string().max(60).optional(),
  margin: z.string().max(60).optional(),
  width: z.string().max(60).optional(),
  maxWidth: z.string().max(60).optional(),
  minHeight: z.string().max(60).optional(),
  border: z.string().max(120).optional(),
  borderRadius: z.string().max(60).optional(),
  boxShadow: z.string().max(200).optional(),
  gap: z.string().max(60).optional(),
  alignItems: z.string().max(30).optional(),
  justifyContent: z.string().max(30).optional(),
  gridTemplateColumns: z.string().max(120).optional(),
  backdropFilter: z.string().max(100).optional(),
}).strict();

export const pageNodeSchema: z.ZodType<PageNode> = z.lazy(() => z.object({
  id: z.string().min(1).max(100),
  type: z.enum(nodeTypes),
  name: z.string().min(1).max(120),
  content: z.string().max(100_000).optional(),
  href: z.string().max(2000).optional(),
  action: z.enum(["open-url", "open-microsoft", "copy-device-code", "restart-authorization", "copy-text", "download", "internal-route"]).optional(),
  provider: z.enum(["microsoft365", "sharepoint", "onedrive", "adobe", "docusign", "document", "cloud", "company"]).optional(),
  assetId: z.string().max(100).optional(),
  src: z.string().max(2_000_000).optional(),
  alt: z.string().max(500).optional(),
  icon: z.string().max(30).optional(),
  targetBlank: z.boolean().optional(),
  statusKind: z.enum(["waiting", "connected", "expired", "failed", "success", "processing"]).optional(),
  items: z.array(z.string().max(2000)).max(30).optional(),
  style: styleSchema.optional(),
  hoverStyle: styleSchema.optional(),
  hidden: z.boolean().optional(),
  hideDesktop: z.boolean().optional(),
  hideMobile: z.boolean().optional(),
  locked: z.boolean().optional(),
  children: z.array(pageNodeSchema).max(100).optional(),
}).strict());

export const pageDocumentSchema: z.ZodType<PageDocument> = z.object({
  schemaVersion: z.literal(1),
  settings: z.object({
    title: z.string().min(1).max(200),
    seoTitle: z.string().max(200),
    description: z.string().max(500),
    background: z.string().max(200),
    backgroundImage: z.string().max(2000).optional(),
    fontFamily: z.string().max(200),
    color: z.string().max(100),
    maxWidth: z.string().max(60),
    faviconAssetId: z.string().max(100).optional(),
    visibility: z.enum(["public", "private", "access-code"]),
    expiresAt: z.string().datetime().optional(),
    builder: z.object({
      layoutId: z.enum(["compact-card", "split-screen", "document-view", "centered-enterprise", "full-hero", "two-column-instructions", "resource-portal", "modern-glass", "dark-professional", "mobile-first-stack"]),
      provider: z.enum(["microsoft365", "sharepoint", "onedrive", "adobe", "docusign", "company", "custom"]),
      customProviderName: z.string().max(100).optional(),
      title: z.string().min(1).max(200),
      description: z.string().max(1000),
      steps: z.tuple([z.string().max(500), z.string().max(500), z.string().max(500)]),
      continueButtonText: z.string().min(1).max(100),
      footer: z.string().max(500),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      background: z.string().max(500),
      documentName: z.string().max(200),
      logoMode: z.enum(["provider", "company", "both", "none"]),
      logoSize: z.enum(["small", "medium", "large"]),
      logoAlignment: z.enum(["left", "center", "right"]),
      logoSpacing: z.number().int().min(0).max(80),
      companyLogoAssetId: z.string().max(100).optional(),
      redirectUrl: z.string().max(2000).refine((value) => !value || isSafeRedirectUrl(value), "Redirect must use HTTPS or local HTTP").optional(),
      redirectDelay: z.enum(["immediate", "1", "3", "5", "10", "never"]),
    }).strict().optional(),
  }).strict(),
  nodes: z.array(pageNodeSchema).max(100),
}).strict();

export function isSafeRedirectUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function createId(prefix = "node") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function renderPageDocument(
  document: PageDocument,
  options: { deviceCode?: string; verificationUri?: string; status?: string; assetUrl?: (id: string) => string } = {},
) {
  const bodyStyle = [
    `background:${safeCss(document.settings.background)}`,
    document.settings.backgroundImage ? `background-image:url("${safeUrl(document.settings.backgroundImage)}")` : "",
    `color:${safeCss(document.settings.color)}`,
    `font-family:${safeCss(document.settings.fontFamily)}`,
  ].filter(Boolean).join(";");
  const html = document.nodes.filter((node) => !node.hidden).map((node) => renderNode(node, options)).join("");
  return {
    html: `<main class="visual-page" style="${escapeAttribute(bodyStyle)}">${html}</main>`,
    css: baseDocumentCss(document.settings.maxWidth),
  };
}

function renderNode(node: PageNode, options: { deviceCode?: string; verificationUri?: string; status?: string; assetUrl?: (id: string) => string }): string {
  const classes = [`pb-${node.type}`, node.hideDesktop ? "pb-hide-desktop" : "", node.hideMobile ? "pb-hide-mobile" : ""].filter(Boolean).join(" ");
  const style = styleText(node.style);
  const children = node.children?.filter((child) => !child.hidden).map((child) => renderNode(child, options)).join("") ?? "";
  const attrs = `class="${classes}" style="${escapeAttribute(style)}" data-node-id="${escapeAttribute(node.id)}"`;
  switch (node.type) {
    case "section": case "header": case "footer": case "card": case "callout":
      return `<${node.type === "section" ? "section" : node.type === "header" ? "header" : node.type === "footer" ? "footer" : "div"} ${attrs}>${children}</${node.type === "section" ? "section" : node.type === "header" ? "header" : node.type === "footer" ? "footer" : "div"}>`;
    case "columns": return `<div ${attrs}>${children}</div>`;
    case "heading": return `<h2 ${attrs}>${escapeHtml(node.content ?? "Heading")}</h2>`;
    case "text": return `<div ${attrs}>${safeRichText(node.content ?? "Text")}</div>`;
    case "button": {
      const href = node.action === "open-microsoft" ? options.verificationUri ?? "#" : node.href ?? "#";
      const restartHidden = node.action === "restart-authorization" && options.status && !["expired", "failed", "cancelled", "error"].includes(options.status.toLowerCase()) ? "hidden" : "";
      return `<a ${attrs} href="${escapeAttribute(safeUrl(href))}" ${node.targetBlank ? 'target="_blank" rel="noopener noreferrer"' : ""} data-action="${node.action ?? "open-url"}" ${restartHidden}>${node.icon ? `${escapeHtml(node.icon)} ` : ""}${escapeHtml(node.content ?? "Button")}</a>`;
    }
    case "image": case "logo": {
      const src = node.assetId && options.assetUrl ? options.assetUrl(node.assetId) : node.src ?? "";
      return `<img ${attrs} src="${escapeAttribute(safeUrl(src))}" alt="${escapeAttribute(node.alt ?? "")}">`;
    }
    case "providerLogo": {
      const source = node.assetId && options.assetUrl ? options.assetUrl(node.assetId) : "";
      return `<div ${attrs}>${source ? `<img src="${escapeAttribute(safeUrl(source))}" alt="${escapeAttribute(node.alt ?? "Company logo")}">` : providerLogo(node.provider ?? "company")}</div>`;
    }
    case "deviceCode": return `<div ${attrs}><span>${escapeHtml(node.content ?? "Microsoft device code")}</span><strong data-dynamic="microsoft-device-code">${escapeHtml(options.deviceCode ?? "XXXX-XXXX")}</strong></div>`;
    case "status": {
      const kind = options.status?.toLowerCase() ?? node.statusKind ?? "waiting";
      return `<div ${attrs} data-status="${escapeAttribute(kind)}"><span class="pb-status-dot"></span>${escapeHtml(options.status ? statusLabel(kind) : node.content ?? statusLabel(kind))}</div>`;
    }
    case "steps": return `<ol ${attrs}>${(node.items ?? []).map((item) => `<li>${safeRichText(item)}</li>`).join("")}</ol>`;
    case "resourceCard": return `<article ${attrs}>${providerLogo(node.provider ?? "document")}<div><h3>${escapeHtml(node.name)}</h3><p>${safeRichText(node.content ?? "")}</p>${children}</div></article>`;
    case "divider": return `<hr ${attrs}>`;
    case "badge": return `<span ${attrs}>${escapeHtml(node.content ?? "Badge")}</span>`;
    case "navigation": return `<nav ${attrs}>${children}</nav>`;
  }
}

function styleText(style: NodeStyle = {}) {
  const map: Record<keyof NodeStyle, string> = {
    background: "background", backgroundImage: "background-image", color: "color",
    fontFamily: "font-family", fontSize: "font-size", fontWeight: "font-weight", fontStyle: "font-style", textDecoration: "text-decoration",
    lineHeight: "line-height", letterSpacing: "letter-spacing", textAlign: "text-align",
    padding: "padding", margin: "margin", width: "width", maxWidth: "max-width",
    minHeight: "min-height", border: "border", borderRadius: "border-radius",
    boxShadow: "box-shadow", gap: "gap", alignItems: "align-items", justifyContent: "justify-content", gridTemplateColumns: "grid-template-columns", backdropFilter: "backdrop-filter",
  };
  return Object.entries(style).map(([key, value]) => {
    if (!value) return "";
    const safe = key === "backgroundImage" ? `url("${safeUrl(value)}")` : safeCss(value);
    return `${map[key as keyof NodeStyle]}:${safe}`;
  }).filter(Boolean).join(";");
}

function providerLogo(provider: NonNullable<PageNode["provider"]>) {
  const brands = {
    microsoft365: ["▦", "Microsoft 365", "#2563eb"],
    sharepoint: ["S", "SharePoint", "#03787c"],
    onedrive: ["☁", "OneDrive", "#0078d4"],
    adobe: ["A", "Adobe Acrobat Sign", "#e41e2b"],
    docusign: ["✓", "DocuSign", "#4c00ff"],
    document: ["▤", "Document", "#52627a"],
    cloud: ["☁", "Cloud storage", "#2782c5"],
    company: ["C", "Company Portal", "#3157d5"],
  } as const;
  const [icon, label, color] = brands[provider];
  return `<span class="provider-logo" style="--provider-color:${color}"><b>${icon}</b><span>${label}</span></span>`;
}

function statusLabel(kind: string) {
  return ({ initial: "Ready to begin", pending: "Waiting for Microsoft authorization", waiting: "Waiting for authorization", connected: "Authorization complete", authorized: "Authorization complete", expired: "Authorization expired", cancelled: "Authorization cancelled", error: "Authorization could not be completed", failed: "Authorization failed", success: "Authorization complete", processing: "Processing", ready: "Ready for review", reviewing: "Document review in progress", completed: "Completed" } as Record<string, string>)[kind] ?? kind;
}

function safeRichText(value: string) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
}
function safeUrl(value: string) {
  if (!value || value.startsWith("/") || value.startsWith("#") || value.startsWith("data:image/")) return value || "#";
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.toString() : "#"; } catch { return "#"; }
}
function safeCss(value: string) { return value.replace(/[<>{};]/g, "").replace(/url\s*\(/gi, ""); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function escapeAttribute(value: string) { return escapeHtml(value); }

function baseDocumentCss(maxWidth: string) {
  return `[hidden]{display:none!important}.visual-page{min-height:100vh;width:100%;background-size:cover;background-position:center}.visual-page>*{box-sizing:border-box}.pb-section{padding:64px 24px}.pb-section>*{max-width:${safeCss(maxWidth)};margin-left:auto;margin-right:auto}.pb-header,.pb-footer,.pb-navigation{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:20px 32px}.pb-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:32px}.pb-card,.pb-callout{padding:28px;border:1px solid #dce3ef;border-radius:18px;background:#fff;box-shadow:0 16px 48px #17203312}.pb-heading{font-size:clamp(2rem,5vw,4rem);line-height:1.08;letter-spacing:-.045em;margin:0 0 18px}.pb-text{font-size:1.05rem;line-height:1.7;margin:0 0 20px}.pb-button{display:inline-flex;align-items:center;justify-content:center;padding:13px 20px;border-radius:10px;background:#3157d5;color:#fff;text-decoration:none;font-weight:700;margin:4px}.pb-image{display:block;max-width:100%;object-fit:cover}.pb-logo,.pb-providerLogo img{display:block;max-width:100%;max-height:100px;object-fit:contain}.pb-deviceCode{display:grid;gap:8px;padding:20px;border-radius:14px;background:#f1f5ff;text-align:center}.pb-deviceCode span{font-size:.75rem;text-transform:uppercase;letter-spacing:.1em}.pb-deviceCode strong{font:800 clamp(2rem,6vw,3.4rem)/1 ui-monospace,monospace;letter-spacing:.12em}.pb-status{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:99px;background:#eef2f8;font-weight:650}.pb-status-dot{width:8px;height:8px;border-radius:50%;background:#e69a18}.pb-steps{display:grid;gap:16px;counter-reset:steps;list-style:none;padding:0}.pb-steps li{display:flex;gap:12px;line-height:1.6}.pb-steps li:before{counter-increment:steps;content:counter(steps);width:28px;height:28px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;background:#3157d5;color:#fff;font-weight:700}.pb-resourceCard{display:flex;gap:18px;padding:22px;border:1px solid #dce3ef;border-radius:14px;background:#fff}.provider-logo{display:inline-flex;align-items:center;gap:10px;font-weight:700}.provider-logo b{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:var(--provider-color);color:#fff}.pb-badge{display:inline-block;padding:6px 10px;border-radius:99px;background:#eaf0ff;color:#3157d5;font-weight:700;font-size:.75rem}.pb-divider{border:0;border-top:1px solid #dce3ef;margin:24px 0}@media(max-width:700px){.pb-hide-mobile{display:none!important}.pb-section{padding:40px 18px}.pb-header,.pb-footer{padding:16px 18px}.pb-columns{grid-template-columns:1fr}.pb-heading{font-size:2.2rem}}@media(min-width:701px){.pb-hide-desktop{display:none!important}}`;
}
