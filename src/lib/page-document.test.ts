import { describe, expect, it } from "vitest";

import { buildPageDesign, defaultBuilderConfiguration, pageDesigns, providerProfiles } from "@/lib/builder-designs";
import { isSafeRedirectUrl, pageDocumentSchema, renderPageDocument, type PageNode } from "@/lib/page-document";
import { visualTemplates } from "@/lib/visual-templates";

describe("focused visual page designs", () => {
  it("ships exactly ten structurally distinct, valid designs", () => {
    expect(pageDesigns).toHaveLength(10);
    expect(visualTemplates).toHaveLength(10);
    expect(new Set(pageDesigns.map((design) => design.id)).size).toBe(10);
    expect(new Set(pageDesigns.map((design) => design.structure)).size).toBe(10);
    for (const template of visualTemplates) {
      expect(pageDocumentSchema.safeParse(template.document).success, template.name).toBe(true);
      const types = flatten(template.document.nodes).map((node) => node.type);
      expect(types).toContain("deviceCode");
      expect(types.filter((type) => type === "button").length).toBeGreaterThanOrEqual(2);
      expect(types).toContain("steps");
      expect(types).toContain("status");
    }
  });

  it("renders every provider in every layout without changing the layout selection", () => {
    for (const design of pageDesigns) {
      for (const provider of Object.keys(providerProfiles) as Array<keyof typeof providerProfiles>) {
        const configuration = defaultBuilderConfiguration(design.id, provider);
        const document = buildPageDesign(configuration);
        expect(document.settings.builder?.layoutId).toBe(design.id);
        expect(document.settings.builder?.provider).toBe(provider);
        expect(renderPageDocument(document).html).toContain(["company", "custom"].includes(provider) ? "Your Company" : providerProfiles[provider].name);
      }
    }
  });

  it("never renders authored content as the Microsoft device-code value", () => {
    const document = buildPageDesign(defaultBuilderConfiguration("compact-card"));
    const deviceCode = flatten(document.nodes).find((node) => node.type === "deviceCode")!;
    deviceCode.content = "ATTACKER-CONTROLLED-VALUE";
    const preview = renderPageDocument(document);
    expect(preview.html).toContain("XXXX-XXXX");
    expect(preview.html).not.toContain("ATTACKER-CONTROLLED-VALUE</strong>");
    const live = renderPageDocument(document, { deviceCode: "ABCD-EFGH" });
    expect(live.html).toContain("ABCD-EFGH");
    expect(live.html).not.toContain("XXXX-XXXX");
  });

  it("validates post-authorization redirects without accepting active schemes", () => {
    expect(isSafeRedirectUrl("https://company.example/complete")).toBe(true);
    expect(isSafeRedirectUrl("http://localhost:3000/complete")).toBe(true);
    expect(isSafeRedirectUrl("http://company.example/complete")).toBe(false);
    expect(isSafeRedirectUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirectUrl("data:text/html,test")).toBe(false);
    expect(isSafeRedirectUrl("file:///tmp/test")).toBe(false);
  });

  it("does not expose manual code-generation controls in authorization previews", () => {
    const document = buildPageDesign(defaultBuilderConfiguration("compact-card"));
    const waiting = renderPageDocument(document, { status: "waiting" }).html;
    const expired = renderPageDocument(document, { status: "expired" }).html;
    expect(waiting).not.toContain('data-action="restart-authorization"');
    expect(expired).not.toContain('data-action="restart-authorization"');
  });

  it("keeps the normal workflow visible and never renders a success screen", () => {
    const configuration = { ...defaultBuilderConfiguration("compact-card"), redirectUrl: "https://company.example/complete" };
    const document = buildPageDesign(configuration, "success");
    const success = renderPageDocument(document, { status: "success" }).html;
    expect(success).not.toContain("Authorization Complete");
    expect(success).not.toContain("Authorization complete");
    expect(success).toContain("XXXX-XXXX");
    expect(success).toContain('data-action="copy-device-code"');
    expect(success).toContain('data-action="open-microsoft"');
    expect(success).toContain("Redirecting…");
  });

  it("keeps the official Microsoft device action and deliberate provider identity in every design", () => {
    for (const design of pageDesigns) {
      const configuration = defaultBuilderConfiguration(design.id, "sharepoint");
      expect(configuration.continueButtonText).toBe("Continue to Microsoft");
      const nodes = flatten(buildPageDesign(configuration).nodes);
      expect(nodes.some((node) => node.type === "providerLogo" || node.type === "logo"), design.name).toBe(true);
      expect(renderPageDocument(buildPageDesign(configuration)).html).toContain("Continue to Microsoft");
    }
  });

  it("uses local immutable provider assets and keeps split document responsive", () => {
    for (const provider of ["microsoft365", "sharepoint", "onedrive", "adobe", "docusign"] as const) {
      const html = renderPageDocument(buildPageDesign(defaultBuilderConfiguration("split-screen", provider))).html;
      expect(html).toContain(`/providers/${provider}/`);
      expect(html).not.toContain("https://cdn.");
    }
    const rendered = renderPageDocument(buildPageDesign(defaultBuilderConfiguration("split-screen")));
    expect(rendered.html).toContain("minmax(0,1.6fr) minmax(320px,1fr)");
    expect(rendered.css).toContain("@container (max-width:620px)");
    expect(rendered.css).toContain("[data-node-id=split-document]{grid-template-columns:1fr!important}");
  });

  it("never exposes expiration management in the visitor document", () => {
    const rendered = renderPageDocument(buildPageDesign(defaultBuilderConfiguration("document-view"), "expired"), { status: "expired" });
    expect(rendered.html).not.toMatch(/expires in|code expired|refresh code|authorization expired/i);
    expect(rendered.html).toContain("Preparing a new Microsoft code");
    expect(rendered.html).toContain("Copy Code");
    expect(rendered.html).toContain("Continue to Microsoft");
  });
});

function flatten(nodes: PageNode[]): PageNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}
