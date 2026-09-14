import { describe, expect, it } from "vitest";

import { MICROSOFT_ORGANIZATIONS_AUTHORITY } from "@/lib/microsoft-authority";

describe("Microsoft multitenant authority", () => {
  it("uses the organizations authority for device-code authentication", () => {
    expect(MICROSOFT_ORGANIZATIONS_AUTHORITY).toBe(
      "https://login.microsoftonline.com/organizations/",
    );
  });
});
