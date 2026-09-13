import { AuthenticatedShell } from "@/components/authenticated-shell";
import { HtmlProjects } from "@/components/html-projects";

export const dynamic = "force-dynamic";

export default function HtmlProjectsPage() {
  return <AuthenticatedShell><HtmlProjects /></AuthenticatedShell>;
}
