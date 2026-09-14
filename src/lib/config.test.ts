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

  it("rejects the Microsoft Authentication Broker client ID", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "29d9ed98-a469-4536-ade2-f981bc1d605e");
    const { microsoftClientId } = await import("@/lib/config");

    expect(() => microsoftClientId()).toThrow(
      "MICROSOFT_CLIENT_ID must be your own Entra app registration, not Microsoft Authentication Broker.",
    );
  });
});
