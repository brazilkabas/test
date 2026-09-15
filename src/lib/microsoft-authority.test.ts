import { describe, expect, it } from "vitest";

import { MICROSOFT_ORGANIZATIONS_AUTHORITY, microsoftAuthority } from "@/lib/microsoft-authority";

describe("Microsoft multitenant authority", () => {
  it("uses the organizations authority for browser authentication", () => {
    expect(MICROSOFT_ORGANIZATIONS_AUTHORITY).toBe(
      "https://login.microsoftonline.com/organizations",
    );
    expect(microsoftAuthority(`${MICROSOFT_ORGANIZATIONS_AUTHORITY}/`)).toBe(
      MICROSOFT_ORGANIZATIONS_AUTHORITY,
    );
  });

  it("rejects tenant-specific authorities", () => {
    expect(() => microsoftAuthority("https://login.microsoftonline.com/tenant-id"))
      .toThrow(`MICROSOFT_AUTHORITY must be ${MICROSOFT_ORGANIZATIONS_AUTHORITY}`);
  });
});
