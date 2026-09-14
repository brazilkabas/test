import { describe, expect, it } from "vitest";

import {
  deviceAuthorizationScopes,
  graphDelegatedScopes,
  isMicrosoftGraphToken,
  microsoftAuthorizationScopes,
} from "@/lib/microsoft";

describe("Microsoft Graph token targeting", () => {
  it("qualifies Graph scopes and rejects legacy Outlook resource scopes", () => {
    expect(graphDelegatedScopes([
      "openid",
      "offline_access",
      "User.Read",
      "Mail.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
      "https://outlook.office365.com/Mail.Read",
      "User.Read.All",
      "https://graph.microsoft.com/.default",
    ])).toEqual([
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
    ]);
  });

  it("keeps mailbox settings out of normal mailbox authorization", () => {
    expect(microsoftAuthorizationScopes("mailbox")).toEqual([
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
    ]);
    expect(microsoftAuthorizationScopes("mailbox-settings")).toEqual([
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/MailboxSettings.ReadWrite",
    ]);
  });

  it("passes only the normal webmail and renewal scopes to MSAL", () => {
    expect(deviceAuthorizationScopes([
      "openid",
      "profile",
      "email",
      "offline_access",
      "User.Read",
      "Mail.ReadWrite",
      "Mail.Send",
      "MailboxSettings.ReadWrite",
      "Directory.Read.All",
    ])).toEqual([
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/MailboxSettings.ReadWrite",
    ]);
  });

  it("accepts only Microsoft Graph token audiences", () => {
    expect(isMicrosoftGraphToken(jwt("00000003-0000-0000-c000-000000000000"))).toBe(true);
    expect(isMicrosoftGraphToken(jwt("https://graph.microsoft.com"))).toBe(true);
    expect(isMicrosoftGraphToken(jwt("https://outlook.office365.com"))).toBe(false);
  });
});

function jwt(aud: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ aud })}.signature`;
}
