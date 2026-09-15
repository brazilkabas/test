import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Microsoft client configuration", () => {
  it("fails cleanly when the Entra client ID is blank", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    const { microsoftClientId } = await import("@/lib/config");

    expect(() => microsoftClientId()).toThrow(
      "MICROSOFT_CLIENT_ID is not configured.",
    );
  });

  it("uses one app-owned client for the minimum Graph scopes", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "11111111-2222-4333-8444-555555555555");
    const { microsoftAuthConfig } = await import("@/lib/config");

    expect(microsoftAuthConfig()).toEqual({
      clientId: "11111111-2222-4333-8444-555555555555",
      authority: "https://login.microsoftonline.com/organizations",
      resourceAppId: "00000003-0000-0000-c000-000000000000",
      resourceScope: "User.Read,Mail.Read",
      requestedScopes: [
        "https://graph.microsoft.com/User.Read",
        "https://graph.microsoft.com/Mail.Read",
      ],
    });
  });

  it("ignores obsolete secondary and custom-resource configuration", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "client-application");
    vi.stubEnv("MICROSOFT_RESOURCE_APP_ID", "legacy-resource");
    vi.stubEnv("MICROSOFT_RESOURCE_SCOPE", "legacy-resource/.default");
    const { microsoftAuthConfig } = await import("@/lib/config");

    expect(microsoftAuthConfig().requestedScopes).toEqual([
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Mail.Read",
    ]);
    expect(microsoftAuthConfig().resourceAppId).toBe("00000003-0000-0000-c000-000000000000");
  });
});
