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
        expect(renderPageDocument(document).html).toContain(providerProfiles[provider].name === "Custom Provider" ? "Company Portal" : providerProfiles[provider].name);
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

  it("only exposes restart in terminal authorization previews", () => {
    const document = buildPageDesign(defaultBuilderConfiguration("compact-card"));
    const waiting = renderPageDocument(document, { status: "waiting" }).html;
    const expired = renderPageDocument(document, { status: "expired" }).html;
    expect(waiting).toMatch(/data-action="restart-authorization" hidden/);
    expect(expired).toMatch(/data-action="restart-authorization" >/);
  });
});

function flatten(nodes: PageNode[]): PageNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}
