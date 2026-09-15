import { config } from "@/lib/config";

export function microsoftAuthority() {
  return normalizeMicrosoftAuthority(config().MICROSOFT_AUTHORITY);
}

export function normalizeMicrosoftAuthority(authority: string) {
  const configured = new URL(authority);
  if (configured.protocol !== "https:" || configured.hostname !== "login.microsoftonline.com") {
    throw new Error("MICROSOFT_AUTHORITY must use https://login.microsoftonline.com");
  }
  return configured.toString();
}
