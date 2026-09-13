import type { BuilderConfiguration } from "@/lib/page-document";

export type BuiltinLogo = {
  id: string;
  name: string;
  category: "Microsoft" | "Microsoft 365" | "SharePoint" | "OneDrive" | "Adobe" | "DocuSign" | "Company Logos";
  provider: BuilderConfiguration["provider"];
  variant: "Light" | "Dark" | "Full Color" | "Monochrome" | "Icon" | "Wordmark";
  tags: string[];
  recommended?: boolean;
  src: string;
};

const mark = (_label: string, color: string, symbol: string, foreground = "#ffffff") => svg(`
  <rect x="8" y="8" width="72" height="72" rx="20" fill="${color}"/>
  <text x="44" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="${foreground}">${symbol}</text>
`);
const microsoft = (_label: string) => svg(`
  <path fill="#f25022" d="M8 8h33v33H8z"/><path fill="#7fba00" d="M47 8h33v33H47z"/>
  <path fill="#00a4ef" d="M8 47h33v33H8z"/><path fill="#ffb900" d="M47 47h33v33H47z"/>
`);

export const builtinLogos: BuiltinLogo[] = [
  { id: "microsoft-symbol", name: "Microsoft", category: "Microsoft", provider: "microsoft365", variant: "Full Color", tags: ["microsoft", "windows", "provider", "full color"], src: microsoft("Microsoft") },
  { id: "microsoft-365", name: "Microsoft 365", category: "Microsoft 365", provider: "microsoft365", variant: "Full Color", tags: ["microsoft", "365", "office", "recommended"], recommended: true, src: microsoft("Microsoft 365") },
  { id: "microsoft-365-light", name: "Microsoft 365 Light", category: "Microsoft 365", provider: "microsoft365", variant: "Light", tags: ["microsoft", "365", "dark background", "light"], src: microsoft("Microsoft 365") },
  { id: "sharepoint", name: "SharePoint", category: "SharePoint", provider: "sharepoint", variant: "Full Color", tags: ["microsoft", "sharepoint", "files", "recommended"], recommended: true, src: mark("SharePoint", "#038387", "S") },
  { id: "sharepoint-light", name: "SharePoint Light", category: "SharePoint", provider: "sharepoint", variant: "Light", tags: ["sharepoint", "dark background", "light"], src: mark("SharePoint", "#038387", "S", "#ffffff") },
  { id: "onedrive", name: "OneDrive", category: "OneDrive", provider: "onedrive", variant: "Full Color", tags: ["microsoft", "onedrive", "cloud", "files", "recommended"], recommended: true, src: mark("OneDrive", "#0078d4", "☁") },
  { id: "onedrive-light", name: "OneDrive Light", category: "OneDrive", provider: "onedrive", variant: "Light", tags: ["onedrive", "dark background", "light"], src: mark("OneDrive", "#0078d4", "☁", "#ffffff") },
  { id: "adobe-sign", name: "Adobe Acrobat Sign", category: "Adobe", provider: "adobe", variant: "Full Color", tags: ["adobe", "acrobat", "sign", "document", "recommended"], recommended: true, src: mark("Adobe Acrobat Sign", "#e41e2b", "A") },
  { id: "adobe-sign-light", name: "Adobe Acrobat Sign Light", category: "Adobe", provider: "adobe", variant: "Light", tags: ["adobe", "acrobat", "dark background", "light"], src: mark("Adobe Acrobat Sign", "#e41e2b", "A", "#ffffff") },
  { id: "docusign", name: "DocuSign", category: "DocuSign", provider: "docusign", variant: "Full Color", tags: ["docusign", "signature", "document", "recommended"], recommended: true, src: mark("DocuSign", "#4c00ff", "✓") },
  { id: "docusign-light", name: "DocuSign Light", category: "DocuSign", provider: "docusign", variant: "Light", tags: ["docusign", "dark background", "light"], src: mark("DocuSign", "#4c00ff", "✓", "#ffffff") },
  { id: "company-portal", name: "Company Portal", category: "Company Logos", provider: "company", variant: "Full Color", tags: ["company", "portal", "generic"], recommended: true, src: mark("Company Portal", "#3158d4", "C") },
  { id: "company-icon", name: "Company Icon", category: "Company Logos", provider: "company", variant: "Icon", tags: ["company", "icon", "generic"], src: svg('<rect x="8" y="8" width="72" height="72" rx="20" fill="#3158d4"/><text x="44" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" font-weight="700" fill="white">C</text>') },
];

export function defaultProviderLogo(provider: BuilderConfiguration["provider"], dark = false) {
  const matches = builtinLogos.filter((logo) => logo.provider === provider);
  return matches.find((logo) => dark && logo.variant === "Light")?.id ?? matches.find((logo) => logo.recommended)?.id ?? "company-portal";
}

export function getBuiltinLogo(id?: string) {
  return builtinLogos.find((logo) => logo.id === id);
}

function svg(content: string) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">${content}</svg>`)}`;
}
