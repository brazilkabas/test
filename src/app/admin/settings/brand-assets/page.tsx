import { AuthenticatedShell } from "@/components/authenticated-shell";
import { BrandAssetManager } from "@/components/logo-library";

export default function BrandAssetsPage() {
  return <AuthenticatedShell><BrandAssetManager /></AuthenticatedShell>;
}
