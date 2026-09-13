import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import worker, { type DeploymentRecord, type Env } from "./index";

function environment(record: DeploymentRecord | null): Env {
  return {
    DEPLOYMENTS: {
      get: async () => record,
    },
  };
}

describe("Cloudflare deployment router", () => {
  it("serves a centrally stored active deployment with security headers", async () => {
    const response = await worker.fetch(
      new Request("https://abc123.connect.example.com"),
      environment({ status: "ACTIVE", policy: "PUBLIC", html: "<main>Company page</main>", css: "main{color:blue}" }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Company page");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("requires the assigned access code without exposing its plaintext", async () => {
    const code = "8KG9P4XR2W7M5QT";
    const codeHash = createHash("sha256").update(code).digest("hex");
    const env = environment({ status: "ACTIVE", policy: "ACCESS_CODE", accessCodeHash: codeHash, html: "<main>Private</main>" });
    const prompt = await worker.fetch(new Request("https://private.connect.example.com"), env);
    expect(await prompt.text()).toContain("Enter your access code");
    const form = new FormData();
    form.set("code", code);
    const accepted = await worker.fetch(new Request("https://private.connect.example.com", { method: "POST", body: form }), env);
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toContain("Private");
  });

  it("rejects disabled and expired deployments", async () => {
    const disabled = await worker.fetch(new Request("https://x.example.com"), environment({ status: "DISABLED" }));
    const expired = await worker.fetch(new Request("https://y.example.com"), environment({ status: "ACTIVE", expiresAt: "2020-01-01T00:00:00.000Z" }));
    expect(disabled.status).toBe(410);
    expect(expired.status).toBe(410);
  });

  it("blocks private deployments at the public worker", async () => {
    const response = await worker.fetch(new Request("https://private.example.com"), environment({ status: "ACTIVE", policy: "PRIVATE", html: "<main>Never public</main>" }));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("Never public");
  });

  it("runs only the nonce-bound system authorization bridge", async () => {
    const response = await worker.fetch(new Request("https://connect.example.com"), environment({
      status: "ACTIVE",
      policy: "PUBLIC",
      html: "<main>Connect</main>",
      systemScript: "window.__bridge=true",
      scriptNonce: "server-generated-nonce",
      connectOrigin: "https://control.example.com",
    }));
    const body = await response.text();
    expect(body).toContain('<script nonce="server-generated-nonce">window.__bridge=true</script>');
    expect(response.headers.get("content-security-policy")).toContain("script-src 'nonce-server-generated-nonce'");
    expect(response.headers.get("content-security-policy")).toContain("connect-src https://control.example.com");
  });
});
