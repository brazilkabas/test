import { buildPageDesign, defaultBuilderConfiguration, pageDesigns } from "@/lib/builder-designs";
import type { PageDocument } from "@/lib/page-document";

export const visualTemplates = pageDesigns.map((design) => ({
  id: design.id,
  name: design.name,
  category: "Microsoft Connection",
  description: design.description,
  layout: design.structure,
  accent: design.accent,
  document: buildPageDesign(defaultBuilderConfiguration(design.id)),
}));

export function getVisualTemplate(id: string) {
  return visualTemplates.find((template) => template.id === id) ?? visualTemplates[0];
}

export function cloneDocument(document: PageDocument): PageDocument {
  return structuredClone(document);
}
