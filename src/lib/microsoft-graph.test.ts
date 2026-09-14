import { describe, expect, it } from "vitest";

import {
  deviceAuthorizationScopes,
  graphDelegatedScopes,
  isMicrosoftGraphToken,
  microsoftAuthorizationScopes,
  microsoftCapabilitiesFromScopes,
  microsoftErrorCode,
  microsoftProfileEmail,
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

  it("uses configured allowlisted scopes for device authorization", () => {
    expect(microsoftAuthorizationScopes("identity", [
      "openid",
      "profile",
      "email",
      "offline_access",
      "User.Read",
      "Mail.ReadWrite",
      "Mail.Send",
      "MailboxSettings.ReadWrite",
    ])).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/MailboxSettings.ReadWrite",
    ]);
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

  it("passes only OIDC and supported Graph scopes to MSAL", () => {
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
      "openid",
      "profile",
      "email",
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

  it("uses the sign-in address when Graph mail is unset", () => {
    expect(microsoftProfileEmail({
      mail: "",
      userPrincipalName: "person@example.com",
      otherMails: ["other@example.com"],
    })).toBe("person@example.com");
    expect(microsoftProfileEmail(
      {},
      { preferred_username: "claim@example.com" },
    )).toBe("claim@example.com");
  });

  it("preserves Microsoft AADSTS failure codes", () => {
    expect(microsoftErrorCode({
      errorCode: "invalid_grant",
      errorMessage: "AADSTS65002: Consent must be configured via preauthorization",
    })).toBe("AADSTS65002");
  });

  it("maps bare and qualified granted scopes into safe capabilities", () => {
    expect(microsoftCapabilitiesFromScopes([
      "https://graph.microsoft.com/User.Read",
      "Mail.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
      "MailboxSettings.Read",
    ])).toMatchObject({
      canReadProfile: true,
      canReadMail: true,
      canModifyMail: true,
      canSendMail: true,
      canReadMailboxSettings: true,
      canModifyMailboxSettings: false,
    });
  });
});

function jwt(aud: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ aud })}.signature`;
}
