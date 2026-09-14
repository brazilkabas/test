import { afterEach, describe, expect, it, vi } from "vitest";

const originalClientId = process.env.MICROSOFT_CLIENT_ID;

afterEach(() => {
  process.env.MICROSOFT_CLIENT_ID = originalClientId;
  vi.resetModules();
});

describe("Microsoft client configuration", () => {
  it("fails cleanly when the Entra client ID is blank", async () => {
    process.env.MICROSOFT_CLIENT_ID = "";
    const { microsoftClientId } = await import("@/lib/config");

    expect(() => microsoftClientId()).toThrow(
      "MICROSOFT_CLIENT_ID is not configured.",
    );
  });
});
