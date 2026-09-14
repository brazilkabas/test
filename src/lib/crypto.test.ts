import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
  process.env.MICROSOFT_CLIENT_ID = "00000000-0000-4000-8000-000000000000";
  process.env.ENCRYPTION_KEY = "ab".repeat(32);
  process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
  process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
});

describe("secret handling", () => {
  it("encrypts and authenticates context-bound values", async () => {
    const { decrypt, encrypt } = await import("@/lib/crypto");
    const encrypted = encrypt("sensitive-token-cache", "msal:tenant:user");
    expect(encrypted.toString()).not.toContain("sensitive-token-cache");
    expect(decrypt(encrypted, "msal:tenant:user")).toBe("sensitive-token-cache");
    expect(() => decrypt(encrypted, "msal:other:user")).toThrow();
  });

  it("hashes access codes with a random salt", async () => {
    const { hashSecret, verifySecret } = await import("@/lib/crypto");
    const one = hashSecret("8KG9P4XR2W7M5QT");
    const two = hashSecret("8KG9P4XR2W7M5QT");
    expect(one).not.toBe(two);
    expect(verifySecret("8KG9P4XR2W7M5QT", one)).toBe(true);
    expect(verifySecret("WRONGCODE000000", one)).toBe(false);
  });

  it("generates 15-character unambiguous access codes", async () => {
    const { randomAccessCode } = await import("@/lib/crypto");
    expect(randomAccessCode()).toMatch(/^[A-HJ-NP-Z2-9]{15}$/);
  });

  it("generates DNS-safe random deployment labels", async () => {
    const { randomHostnameLabel } = await import("@/lib/crypto");
    const labels = new Set(Array.from({ length: 100 }, () => randomHostnameLabel()));
    expect(labels.size).toBe(100);
    for (const label of labels) expect(label).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
  });
});
