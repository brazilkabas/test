import { describe, expect, it } from "vitest";

import { microsoftAuthority } from "@/lib/microsoft-authority";

describe("Microsoft multitenant authority", () => {
  it("uses the configured organizations authority for device-code authentication", () => {
    expect(microsoftAuthority()).toBe(
      "https://login.microsoftonline.com/organizations/",
    );
  });
});
