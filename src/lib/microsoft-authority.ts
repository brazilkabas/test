import { config } from "@/lib/config";

export function microsoftAuthority() {
  const configured = new URL(config().MICROSOFT_AUTHORITY);
  if (configured.protocol !== "https:" || configured.hostname !== "login.microsoftonline.com") {
    throw new Error("MICROSOFT_AUTHORITY must use https://login.microsoftonline.com");
  }
  return configured.toString();
}
