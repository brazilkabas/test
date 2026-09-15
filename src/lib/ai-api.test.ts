import { describe, expect, it } from "vitest";

import { AiApiError, parseCurlRequest } from "@/lib/ai-api";

describe("parseCurlRequest", () => {
  it("parses an OpenAI-compatible curl request without exposing it to a shell", () => {
    const parsed = parseCurlRequest(`curl https://api.example.com/v1/chat/completions \\
      -H "Authorization: Bearer secret-value" \\
      -H "Content-Type: application/json" \\
      -d '{"model":"example-chat","messages":[{"role":"user","content":"hello"}]}'`);

    expect(parsed).toEqual({
      url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: "Bearer secret-value",
        "Content-Type": "application/json",
      },
      body: {
        model: "example-chat",
        messages: [{ role: "user", content: "hello" }],
      },
    });
  });

  it("supports explicit request and URL flags", () => {
    const parsed = parseCurlRequest(
      `curl --request POST --url 'https://gateway.example.com/chat' --header 'X-API-Key: key' --data-raw '{"prompt":"hello"}'`,
    );
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("https://gateway.example.com/chat");
    expect(parsed.headers["Content-Type"]).toBe("application/json");
    expect(parsed.body).toEqual({ prompt: "hello" });
  });

  it.each([
    ["non-HTTPS endpoints", `curl http://api.example.com/chat -d '{}'`],
    ["local endpoints", `curl https://localhost/chat -d '{}'`],
    ["private IP endpoints", `curl https://10.0.0.2/chat -d '{}'`],
    ["GET endpoints", `curl https://api.example.com/chat`],
    ["non-JSON bodies", `curl https://api.example.com/chat -d 'hello'`],
    ["unsupported options", `curl --insecure https://api.example.com/chat -d '{}'`],
  ])("rejects %s", (_name, command) => {
    expect(() => parseCurlRequest(command)).toThrow(AiApiError);
  });

  it("strips headers that must be controlled by fetch", () => {
    const parsed = parseCurlRequest(
      `curl https://api.example.com/chat -H 'Host: internal.example' -H 'Cookie: secret=1' -H 'Content-Length: 100' -d '{}'`,
    );
    expect(parsed.headers.Host).toBeUndefined();
    expect(parsed.headers.Cookie).toBeUndefined();
    expect(parsed.headers["Content-Length"]).toBeUndefined();
  });
});
