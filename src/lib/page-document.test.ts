import { describe, expect, it } from "vitest";

import { pageDocumentSchema, renderPageDocument } from "@/lib/page-document";
import { getVisualTemplate, visualTemplates } from "@/lib/visual-templates";

describe("visual page documents", () => {
  it("ships differentiated templates in all required categories", () => {
    const categories = new Set(visualTemplates.map((template) => template.category));
    for (const category of ["Microsoft Connection", "SharePoint", "OneDrive", "Adobe Acrobat Sign", "DocuSign", "Document Workflow", "Internal Resource", "Employee Onboarding", "Company Notice", "Support Page", "Generic Landing Page", "Blank Page"]) {
      expect(categories.has(category), `missing ${category}`).toBe(true);
    }
    expect(new Set(visualTemplates.map((template) => template.layout)).size).toBeGreaterThanOrEqual(10);
    for (const template of visualTemplates) expect(pageDocumentSchema.safeParse(template.document).success).toBe(true);
  });

  it("never renders administrator-authored content as the Microsoft device code", () => {
    const document = structuredClone(getVisualTemplate("microsoft-compact-card").document);
    const deviceCode = document.nodes[0].children?.[0].children?.find((node) => node.type === "deviceCode");
    expect(deviceCode).toBeDefined();
    deviceCode!.content = "ATTACKER-CONTROLLED-VALUE";

    const preview = renderPageDocument(document);
    expect(preview.html).toContain("XXXX-XXXX");
    expect(preview.html).not.toContain("ATTACKER-CONTROLLED-VALUE</strong>");

    const live = renderPageDocument(document, { deviceCode: "ABCD-EFGH" });
    expect(live.html).toContain("ABCD-EFGH");
    expect(live.html).not.toContain("XXXX-XXXX");
  });

  it("includes automatic provider marks in rendered pages", () => {
    const rendered = renderPageDocument(getVisualTemplate("resource-portal").document);
    expect(rendered.html).toContain("SharePoint");
    expect(rendered.html).toContain("OneDrive");
    expect(rendered.html).toContain("DocuSign");
  });
});
