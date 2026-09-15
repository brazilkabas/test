import { describe, expect, it } from "vitest";

import {
  assertMicrosoftConnectionIdentity,
  deviceAuthorizationScopes,
  graphDelegatedScopes,
  GraphError,
  isMicrosoftGraphToken,
  mailboxDiagnosticStatusCode,
  microsoftIdentityFromAccessToken,
  microsoftAuthorizationScopes,
  MicrosoftReauthenticationRequired,
  tokenDelegatedScopes,
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

  it("includes mailbox access in the initial connection authorization", () => {
    expect(microsoftAuthorizationScopes("identity")).toEqual([
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Mail.Read",
    ]);
    expect(microsoftAuthorizationScopes("mailbox")).toEqual([
      "offline_access",
      "https://graph.microsoft.com/Mail.Read",
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

  it("reads delegated token scopes without accepting roles or other claims", () => {
    expect([...tokenDelegatedScopes(jwt(
      "https://graph.microsoft.com",
      "User.Read Mail.Read",
    ))]).toEqual(["user.read", "mail.read"]);
    expect([...tokenDelegatedScopes(jwt("https://graph.microsoft.com"))]).toEqual([]);
  });

  it("reads the tenant and object identity from the Graph token", () => {
    expect(microsoftIdentityFromAccessToken(jwt(
      "https://graph.microsoft.com",
      "Mail.Read",
      { tid: "tenant-a", oid: "user-a" },
    ))).toEqual({ tenantId: "tenant-a", microsoftUserId: "user-a" });
    expect(microsoftIdentityFromAccessToken(jwt(
      "https://graph.microsoft.com",
      "Mail.Read",
      { tid: "tenant-a" },
    ))).toBeNull();
  });

  it("rejects incremental authorization for a different Microsoft identity", () => {
    expect(() => assertMicrosoftConnectionIdentity(
      { tenantId: "tenant-a", microsoftUserId: "user-a" },
      { tenantId: "tenant-a", microsoftUserId: "user-a" },
    )).not.toThrow();
    expect(() => assertMicrosoftConnectionIdentity(
      { tenantId: "tenant-a", microsoftUserId: "user-a" },
      { tenantId: "tenant-b", microsoftUserId: "user-a" },
    )).toThrow("different account");
    expect(() => assertMicrosoftConnectionIdentity(
      { tenantId: "tenant-a", microsoftUserId: "user-a" },
      { tenantId: "tenant-a", microsoftUserId: "user-b" },
    )).toThrow("different account");
  });

  it("maps mailbox diagnostics to safe HTTP status categories", () => {
    expect(mailboxDiagnosticStatusCode(new MicrosoftReauthenticationRequired())).toBe(401);
    expect(mailboxDiagnosticStatusCode(new GraphError(403, "ErrorAccessDenied", "denied"))).toBe(403);
    expect(mailboxDiagnosticStatusCode(new GraphError(429, "TooManyRequests", "throttled"))).toBe(429);
    expect(mailboxDiagnosticStatusCode(new Error("unexpected"))).toBe(500);
  });
});

function jwt(aud: string, scp?: string, claims: Record<string, string> = {}) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ aud, ...(scp ? { scp } : {}), ...claims })}.signature`;
}
