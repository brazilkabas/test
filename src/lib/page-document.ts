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
  height?: string;
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
  overflow?: string;
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
  visibleWhen?: string[];
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
  successMessage?: string;
  redirectText?: string;
  primaryColor: string;
  background: string;
  documentName: string;
  documentTitle?: string;
  fileType?: string;
  pageCount?: string;
  fileSize?: string;
  sender?: string;
  companyName?: string;
  department?: string;
  documentStatus?: string;
  logoMode: "provider" | "company" | "both" | "none";
  logoSize: "small" | "medium" | "large";
  logoAlignment: "left" | "center" | "right";
  logoSpacing: number;
  logoWidth?: number;
  logoMaxHeight?: number;
  logoBackground?: "none" | "white" | "dark";
  showProviderName?: boolean;
  providerLogoId?: string;
  companyBuiltinLogoId?: string;
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
  height: z.string().max(60).optional(),
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
  overflow: z.enum(["hidden", "auto", "visible"]).optional(),
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
  visibleWhen: z.array(z.string().max(30)).max(12).optional(),
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
      successMessage: z.string().max(500).optional(),
      redirectText: z.string().max(200).optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      background: z.string().max(500),
      documentName: z.string().max(200),
      documentTitle: z.string().max(200).optional(),
      fileType: z.string().max(80).optional(),
      pageCount: z.string().max(80).optional(),
      fileSize: z.string().max(80).optional(),
      sender: z.string().max(120).optional(),
      companyName: z.string().max(120).optional(),
      department: z.string().max(120).optional(),
      documentStatus: z.string().max(120).optional(),
      logoMode: z.enum(["provider", "company", "both", "none"]),
      logoSize: z.enum(["small", "medium", "large"]),
      logoAlignment: z.enum(["left", "center", "right"]),
      logoSpacing: z.number().int().min(0).max(80),
      logoWidth: z.number().int().min(40).max(480).optional(),
      logoMaxHeight: z.number().int().min(24).max(200).optional(),
      logoBackground: z.enum(["none", "white", "dark"]).optional(),
      showProviderName: z.boolean().optional(),
      providerLogoId: z.string().max(100).optional(),
      companyBuiltinLogoId: z.string().max(100).optional(),
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
  options: RenderOptions = {},
) {
  const bodyStyle = [
    `background:${safeCss(document.settings.background)}`,
    document.settings.backgroundImage ? `background-image:url("${safeUrl(document.settings.backgroundImage)}")` : "",
    `color:${safeCss(document.settings.color)}`,
    `font-family:${safeCss(document.settings.fontFamily)}`,
    document.settings.builder?.primaryColor ? `--theme-color:${safeCss(document.settings.builder.primaryColor)}` : "",
    document.settings.builder?.primaryColor ? `--theme-foreground:${contrastColor(document.settings.builder.primaryColor)}` : "",
  ].filter(Boolean).join(";");
  const html = document.nodes.filter((node) => !node.hidden && (options.dynamicStates || visibleForStatus(node, options.status))).map((node) => renderNode(node, options)).join("");
  return {
    html: `<main class="visual-page" style="${escapeAttribute(bodyStyle)}">${html}</main>`,
    css: baseDocumentCss(document.settings.maxWidth),
  };
}

type RenderOptions = { deviceCode?: string; verificationUri?: string; status?: string; assetUrl?: (id: string) => string; dynamicStates?: boolean };

function renderNode(node: PageNode, options: RenderOptions): string {
  const classes = [`pb-${node.type}`, node.hideDesktop ? "pb-hide-desktop" : "", node.hideMobile ? "pb-hide-mobile" : ""].filter(Boolean).join(" ");
  const style = styleText(node.style);
  const children = node.children?.filter((child) => !child.hidden && (options.dynamicStates || visibleForStatus(child, options.status))).map((child) => renderNode(child, options)).join("") ?? "";
  const stateHidden = options.dynamicStates && !visibleForStatus(node, options.status) ? " hidden" : "";
  const attrs = `class="${classes}" style="${escapeAttribute(style)}" data-node-id="${escapeAttribute(node.id)}"${stateHidden}`;
  switch (node.type) {
    case "section": case "header": case "footer": case "card":
      return `<${node.type === "section" ? "section" : node.type === "header" ? "header" : node.type === "footer" ? "footer" : "div"} ${attrs}>${children}</${node.type === "section" ? "section" : node.type === "header" ? "header" : node.type === "footer" ? "footer" : "div"}>`;
    case "callout": return `<div ${attrs}>${node.content ? safeRichText(node.content) : ""}${children}</div>`;
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
      const source = node.assetId && options.assetUrl ? options.assetUrl(node.assetId) : node.src ?? "";
      return `<div ${attrs}>${source ? `<span class="provider-logo"><img src="${escapeAttribute(safeUrl(source))}" alt="${escapeAttribute(node.alt ?? "Provider logo")}">${node.content ? `<span>${escapeHtml(node.content)}</span>` : ""}</span>` : node.content ? `<span class="provider-logo provider-text">${escapeHtml(node.content)}</span>` : providerLogo(node.provider ?? "company")}</div>`;
    }
    case "deviceCode": return `<div ${attrs}><span>${escapeHtml(node.content ?? "Microsoft device code")}</span><strong data-dynamic="microsoft-device-code">${escapeHtml(options.deviceCode ?? "XXXX-XXXX")}</strong></div>`;
    case "status": {
      const kind = options.status?.toLowerCase() ?? node.statusKind ?? "waiting";
      return `<div ${attrs} data-status="${escapeAttribute(kind)}"><span class="pb-status-dot"></span>${escapeHtml(options.status ? statusLabel(kind) : node.content ?? statusLabel(kind))}</div>`;
    }
    case "steps": return `<ol ${attrs}>${(node.items ?? []).map((item) => `<li>${safeRichText(item)}</li>`).join("")}</ol>`;
    case "resourceCard": return `<article ${attrs}><span class="pb-resource-icon" aria-hidden="true">${escapeHtml(node.icon ?? "▤")}</span><div><h3>${escapeHtml(node.name)}</h3><p>${safeRichText(node.content ?? "")}</p>${children}</div></article>`;
    case "divider": return `<hr ${attrs}>`;
    case "badge": return `<span ${attrs}>${escapeHtml(node.content ?? "Badge")}</span>`;
    case "navigation": return `<nav ${attrs}>${children}</nav>`;
  }
}

function visibleForStatus(node: PageNode, status?: string) {
  if (!node.visibleWhen?.length) return true;
  const normalized = (status ?? "waiting").toLowerCase();
  const state = normalized === "connected" || normalized === "authorized" ? "success" : normalized === "failed" ? "error" : normalized === "pending" ? "waiting" : normalized;
  return node.visibleWhen.includes(normalized) || node.visibleWhen.includes(state);
}

function styleText(style: NodeStyle = {}) {
  const map: Record<keyof NodeStyle, string> = {
    background: "background", backgroundImage: "background-image", color: "color",
    fontFamily: "font-family", fontSize: "font-size", fontWeight: "font-weight", fontStyle: "font-style", textDecoration: "text-decoration",
    lineHeight: "line-height", letterSpacing: "letter-spacing", textAlign: "text-align",
    padding: "padding", margin: "margin", width: "width", height: "height", maxWidth: "max-width",
    minHeight: "min-height", border: "border", borderRadius: "border-radius",
    boxShadow: "box-shadow", gap: "gap", alignItems: "align-items", justifyContent: "justify-content", gridTemplateColumns: "grid-template-columns", backdropFilter: "backdrop-filter", overflow: "overflow",
  };
  return Object.entries(style).map(([key, value]) => {
    if (!value) return "";
    const safe = key === "backgroundImage" ? `url("${safeUrl(value)}")` : safeCss(value);
    return `${map[key as keyof NodeStyle]}:${safe}`;
  }).filter(Boolean).join(";");
}

function providerLogo(provider: NonNullable<PageNode["provider"]>) {
  const brands = {
    microsoft365: "Microsoft 365",
    sharepoint: "SharePoint",
    onedrive: "OneDrive",
    adobe: "Adobe Acrobat Sign",
    docusign: "Docusign",
    document: "Document",
    cloud: "Cloud storage",
    company: "Company",
  } as const;
  return `<span class="provider-logo provider-text">${brands[provider]}</span>`;
}

function statusLabel(kind: string) {
  return ({ initial: "Waiting for Microsoft…", pending: "Waiting for Microsoft…", waiting: "Waiting for Microsoft…", connected: "Redirecting…", authorized: "Redirecting…", expired: "Preparing a new Microsoft code…", cancelled: "Reconnecting…", error: "Reconnecting…", failed: "Reconnecting…", success: "Redirecting…", processing: "Waiting for Microsoft…", ready: "Waiting for Microsoft…", reviewing: "Waiting for Microsoft…", completed: "Redirecting…" } as Record<string, string>)[kind] ?? kind;
}

function safeRichText(value: string) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
}
function safeUrl(value: string) {
  if (!value || value.startsWith("/") || value.startsWith("#") || value.startsWith("data:image/")) return value || "#";
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.toString() : "#"; } catch { return "#"; }
}
function safeCss(value: string) { return value.replace(/[<>{};]/g, "").replace(/url\s*\(/gi, ""); }
function contrastColor(value: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return "#ffffff";
  const color = Number.parseInt(match[1], 16);
  const luminance = ((color >> 16) * 299 + ((color >> 8) & 255) * 587 + (color & 255) * 114) / 1000;
  return luminance > 160 ? "#172033" : "#ffffff";
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function escapeAttribute(value: string) { return escapeHtml(value); }

function baseDocumentCss(maxWidth: string) {
  return `[hidden]{display:none!important}.visual-page{min-height:100vh;width:100%;container-type:inline-size;background-size:cover;background-position:center;--theme-color:#3158d4;--theme-foreground:#fff}.visual-page,.visual-page *{box-sizing:border-box}.pb-section{padding:32px 20px}.pb-section>*{max-width:${safeCss(maxWidth)};margin-left:auto;margin-right:auto}.pb-header,.pb-footer,.pb-navigation{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px}.pb-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}.pb-card,.pb-callout{padding:24px;border:1px solid #e4e7ec;border-radius:14px;background:#fff;box-shadow:0 12px 36px #1720330d}.pb-heading{font-size:clamp(1.5rem,3vw,2rem);line-height:1.16;letter-spacing:-.035em;margin:0 0 12px}.pb-text{font-size:.94rem;line-height:1.6;margin:0 0 16px}.pb-button{display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:9px;background:var(--theme-color);color:var(--theme-foreground);text-decoration:none;font-weight:650;margin:4px;transition:filter .15s,transform .15s}.pb-button:hover{filter:brightness(.94);transform:translateY(-1px)}.pb-image{display:block;max-width:100%;object-fit:cover}.pb-logo,.pb-providerLogo img{display:block;max-width:100%;max-height:100px;object-fit:contain}.pb-deviceCode{display:grid;gap:7px;padding:16px;border-radius:10px;background:color-mix(in srgb,var(--theme-color) 8%,#fff);border:1px solid color-mix(in srgb,var(--theme-color) 20%,#e4e7ec);text-align:center}.pb-deviceCode span{font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:#667085}.pb-deviceCode strong{font:700 clamp(1.8rem,4vw,2.35rem)/1.1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.13em;color:var(--theme-color)}.pb-status{display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border-radius:99px;background:#f2f4f7;color:#667085;font-size:.78rem;font-weight:580}.pb-status-dot{width:7px;height:7px;border-radius:50%;background:#e69a18}.pb-steps{display:grid;gap:10px;counter-reset:steps;list-style:none;padding:0}.pb-steps li{display:flex;align-items:flex-start;gap:10px;line-height:1.48;font-size:.84rem}.pb-steps li:before{counter-increment:steps;content:counter(steps);width:22px;height:22px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;background:var(--theme-color);color:var(--theme-foreground);font-size:.7rem;font-weight:700}.pb-resourceCard{display:flex;gap:14px;padding:16px;border:1px solid #e4e7ec;border-radius:11px;background:#fff}.provider-logo{display:inline-flex;align-items:center;font-weight:650}.provider-logo img{width:auto;height:100%;max-width:100%;object-fit:contain}.pb-badge{display:inline-block;padding:5px 8px;border-radius:99px;background:color-mix(in srgb,var(--theme-color) 9%,#fff);color:var(--theme-color);font-weight:650;font-size:.68rem}.pb-divider{border:0;border-top:1px solid #e4e7ec;margin:20px 0}[data-node-id=auth-copy-feedback]{visibility:hidden}[data-node-id=auth-copy-feedback].is-visible{visibility:visible}[data-node-id=auth-popup-fallback]{display:none!important}[data-node-id=auth-popup-fallback].is-visible{display:inline-flex!important}[data-node-id=split-document]{grid-template-columns:minmax(0,1.6fr) minmax(320px,1fr)!important}@container (max-width:760px){[data-node-id=split-document]{grid-template-columns:minmax(0,1.2fr) minmax(280px,1fr)!important}[data-node-id=split-rail],[data-node-id=split-workflow]{padding:20px!important}}@container (max-width:620px){.pb-hide-mobile{display:none!important}.pb-section{padding:24px 16px}.pb-header,.pb-footer{padding:14px 16px}.pb-columns,[data-node-id=split-document]{grid-template-columns:1fr!important}.pb-heading{font-size:1.65rem}[data-node-id=split-rail],[data-node-id=split-workflow]{min-height:auto!important}}@media(max-width:620px){.pb-columns,[data-node-id=split-document]{grid-template-columns:1fr!important}}@media(min-width:621px){.pb-hide-desktop{display:none!important}}`;
}
