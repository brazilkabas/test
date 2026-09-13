import type { BuilderConfiguration } from "@/lib/page-document";

export type ProviderPreset = {
  id: BuilderConfiguration["provider"];
  name: string;
  logoSrc?: string;
  logoAlt: string;
  assetPolicy: string;
  accent: string;
  fontFamily: string;
  spacing: "fluent" | "editorial" | "agreement" | "neutral";
  surface: string;
  elevatedSurface: string;
  border: string;
  radius: string;
  shadow: string;
  defaultLayout: BuilderConfiguration["layoutId"];
  recommendedLayouts: BuilderConfiguration["layoutId"][];
  defaultFile: { name: string; title: string; type: string; size: string; pages: string; status: string; sender: string };
};

const microsoftFamily = {
  logoSrc: "https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_mssymbol_19.svg",
  fontFamily: '"Segoe UI", "Segoe UI Variable", Arial, sans-serif',
  spacing: "fluent" as const,
  surface: "#f5f5f5",
  elevatedSurface: "#ffffff",
  border: "#e1e1e1",
  radius: "6px",
  shadow: "0 2px 8px #0000000f",
  assetPolicy: "Official Microsoft identity symbol from Microsoft identity-platform guidance; product name is textual.",
};

export const providerAssets: Record<BuilderConfiguration["provider"], ProviderPreset> = {
  microsoft365: {
    id: "microsoft365", name: "Microsoft 365", logoAlt: "Microsoft", accent: "#0f6cbd",
    defaultLayout: "compact-card", recommendedLayouts: ["compact-card", "split-screen", "centered-enterprise", "two-column-instructions"],
    defaultFile: { name: "Project Documents.pdf", title: "Project Documents", type: "PDF", size: "2.4 MB", pages: "12 pages", status: "Verification required", sender: "Operations Team" },
    ...microsoftFamily,
  },
  sharepoint: {
    id: "sharepoint", name: "SharePoint", logoAlt: "Microsoft", accent: "#03787c",
    defaultLayout: "resource-portal", recommendedLayouts: ["resource-portal", "document-view", "centered-enterprise", "split-screen"],
    defaultFile: { name: "Quarterly Report.pdf", title: "Project Workspace", type: "PDF", size: "3.1 MB", pages: "18 pages", status: "Workspace verification required", sender: "Finance Team" },
    ...microsoftFamily,
  },
  onedrive: {
    id: "onedrive", name: "OneDrive", logoAlt: "Microsoft", accent: "#0078d4",
    defaultLayout: "full-hero", recommendedLayouts: ["full-hero", "document-view", "split-screen", "compact-card"],
    defaultFile: { name: "Board_Presentation.pdf", title: "Board Presentation", type: "PDF", size: "3.2 MB", pages: "24 pages", status: "Shared file · verification required", sender: "Executive Office" },
    ...microsoftFamily,
  },
  adobe: {
    id: "adobe", name: "Adobe Acrobat Sign", logoAlt: "Adobe Acrobat Sign", accent: "#d31510",
    fontFamily: '"Source Sans 3", "Helvetica Neue", Arial, sans-serif', spacing: "editorial", surface: "#f7f7f7", elevatedSurface: "#ffffff", border: "#dcdcdc", radius: "8px", shadow: "0 3px 12px #00000012",
    assetPolicy: "Textual trademark reference only; Adobe product logos require written permission and are not fabricated.",
    defaultLayout: "document-view", recommendedLayouts: ["document-view", "modern-glass", "split-screen", "mobile-first-stack"],
    defaultFile: { name: "Agreement.pdf", title: "Agreement", type: "PDF", size: "1.8 MB", pages: "6 pages", status: "Signature verification required", sender: "Contracts Team" },
  },
  docusign: {
    id: "docusign", name: "Docusign", logoSrc: "https://cdn.prod.website-files.com/67d160f23e7ffa1df49339fc/67dcd2505ea595bc4b5d0bf3_logo-full-color.svg", logoAlt: "Docusign", accent: "#4c00ff",
    fontFamily: 'Arial, "Helvetica Neue", sans-serif', spacing: "agreement", surface: "#f8f7f4", elevatedSurface: "#ffffff", border: "#d9d6cf", radius: "4px", shadow: "0 2px 10px #26065d12",
    assetPolicy: "Unmodified Nexus and Wordmark lockup from Docusign public brand assets.",
    defaultLayout: "mobile-first-stack", recommendedLayouts: ["mobile-first-stack", "split-screen", "document-view", "compact-card"],
    defaultFile: { name: "NDA Agreement.pdf", title: "NDA Agreement", type: "PDF", size: "860 KB", pages: "4 pages", status: "Recipient verification required", sender: "Legal Department" },
  },
  company: {
    id: "company", name: "Generic Company", logoAlt: "Company", accent: "#3158d4",
    fontFamily: "Geist, Inter, system-ui, sans-serif", spacing: "neutral", surface: "#f5f6f8", elevatedSurface: "#ffffff", border: "#dfe3e8", radius: "8px", shadow: "0 2px 10px #1720330d",
    assetPolicy: "No provider mark; optional administrator-managed company identity only.",
    defaultLayout: "centered-enterprise", recommendedLayouts: ["centered-enterprise", "mobile-first-stack", "split-screen", "compact-card"],
    defaultFile: { name: "Employee Resources.pdf", title: "Employee Resources", type: "PDF", size: "1.2 MB", pages: "8 pages", status: "Company access required", sender: "People Operations" },
  },
  custom: {
    id: "custom", name: "Generic Company", logoAlt: "Company", accent: "#3158d4",
    fontFamily: "Geist, Inter, system-ui, sans-serif", spacing: "neutral", surface: "#f5f6f8", elevatedSurface: "#ffffff", border: "#dfe3e8", radius: "8px", shadow: "0 2px 10px #1720330d",
    assetPolicy: "Legacy alias for Generic Company; no external provider mark.",
    defaultLayout: "centered-enterprise", recommendedLayouts: ["centered-enterprise", "mobile-first-stack", "split-screen", "compact-card"],
    defaultFile: { name: "Employee Resources.pdf", title: "Employee Resources", type: "PDF", size: "1.2 MB", pages: "8 pages", status: "Company access required", sender: "People Operations" },
  },
};
