import { AuthenticatedShell } from "@/components/authenticated-shell";
import { HtmlEditor } from "@/components/html-editor";

export const dynamic = "force-dynamic";

export default async function HtmlEditorPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <AuthenticatedShell><HtmlEditor projectId={projectId} /></AuthenticatedShell>;
}
