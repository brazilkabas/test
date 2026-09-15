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

  it("fails cleanly when the target resource is blank", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "client-application");
    vi.stubEnv("MICROSOFT_RESOURCE_APP_ID", "");
    const { microsoftAuthConfig } = await import("@/lib/config");

    expect(() => microsoftAuthConfig()).toThrow(
      "MICROSOFT_RESOURCE_APP_ID is not configured.",
    );
  });

  it("keeps the client, resource, and explicit Graph scopes separate", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "11111111-2222-4333-8444-555555555555");
    vi.stubEnv("MICROSOFT_RESOURCE_APP_ID", "00000003-0000-0000-c000-000000000000");
    vi.stubEnv("MICROSOFT_RESOURCE_SCOPE", "User.Read,Mail.Read");
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

  it("constructs the configured resource default scope only when no scope is supplied", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "client-application");
    vi.stubEnv("MICROSOFT_RESOURCE_APP_ID", "api://resource-application");
    vi.stubEnv("MICROSOFT_RESOURCE_SCOPE", "");
    const { microsoftAuthConfig } = await import("@/lib/config");

    expect(microsoftAuthConfig().requestedScopes).toEqual([
      "api://resource-application/.default",
    ]);
  });

  it("passes an explicit custom API scope without inventing permissions", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "client-application");
    vi.stubEnv("MICROSOFT_RESOURCE_APP_ID", "custom-api-application");
    vi.stubEnv("MICROSOFT_RESOURCE_SCOPE", "api://custom-api-application/access_as_user");
    const { microsoftAuthConfig } = await import("@/lib/config");

    expect(microsoftAuthConfig().requestedScopes).toEqual([
      "api://custom-api-application/access_as_user",
    ]);
  });

  it("rejects using the resource application as the client application", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "same-application");
    vi.stubEnv("MICROSOFT_RESOURCE_APP_ID", "same-application");
    const { microsoftAuthConfig } = await import("@/lib/config");

    expect(() => microsoftAuthConfig()).toThrow(
      "must identify separate OAuth concepts",
    );
  });

});
