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

  it("passes any non-empty client ID to Microsoft unchanged", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "provider-validates-this-value");
    const { microsoftClientId } = await import("@/lib/config");

    expect(microsoftClientId()).toBe("provider-validates-this-value");
  });

  it("keeps the Entra client and Microsoft Graph resource IDs separate", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "11111111-2222-4333-8444-555555555555");
    vi.stubEnv("MICROSOFT_GRAPH_RESOURCE_ID", "00000003-0000-0000-c000-000000000000");
    const { microsoftClientId, microsoftGraphResourceId } = await import("@/lib/config");

    expect(microsoftClientId()).toBe("11111111-2222-4333-8444-555555555555");
    expect(microsoftGraphResourceId()).toBe("00000003-0000-0000-c000-000000000000");
    expect(microsoftClientId()).not.toContain(microsoftGraphResourceId());
  });

  it("rejects using Microsoft Graph as the application client", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "00000003-0000-0000-c000-000000000000");
    const { microsoftClientId } = await import("@/lib/config");

    expect(() => microsoftClientId()).toThrow(
      "MICROSOFT_CLIENT_ID must identify your Entra application",
    );
  });

  it("rejects a non-Graph resource identifier", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "11111111-2222-4333-8444-555555555555");
    vi.stubEnv("MICROSOFT_GRAPH_RESOURCE_ID", "not-microsoft-graph");
    const { microsoftGraphResourceId } = await import("@/lib/config");

    expect(() => microsoftGraphResourceId()).toThrow(
      "MICROSOFT_GRAPH_RESOURCE_ID must identify Microsoft Graph",
    );
  });
});
