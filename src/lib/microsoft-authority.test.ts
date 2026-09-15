import { describe, expect, it } from "vitest";

import { normalizeMicrosoftAuthority } from "@/lib/microsoft-authority";

describe("Microsoft multitenant authority", () => {
  it("uses the configured organizations authority for device-code authentication", () => {
    expect(normalizeMicrosoftAuthority(
      "https://login.microsoftonline.com/organizations",
    )).toBe(
      "https://login.microsoftonline.com/organizations",
    );
  });
});
