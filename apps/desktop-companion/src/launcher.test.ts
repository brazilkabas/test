import { describe, expect, it, vi } from "vitest";

import {
  browserCandidates,
  chooseBrowser,
  chromiumArguments,
  exchangeLaunchId,
  isAllowedOutlookUrl,
  parseProtocolUrl,
  validateBackendUrl,
} from "./launcher";

const launchId = "A".repeat(43);

describe("Company Mail Launcher", () => {
  it("accepts only a launch ID in the custom protocol path", () => {
    expect(parseProtocolUrl(`companymail://open/${launchId}`)).toBe(launchId);
    expect(() => parseProtocolUrl(`companymail://open?token=${launchId}`)).toThrow();
    expect(() => parseProtocolUrl("companymail://open/not-random")).toThrow();
    expect(() => parseProtocolUrl(`companymail://settings/${launchId}`)).toThrow();
  });

  it("requires HTTPS except for a local backend", () => {
    expect(validateBackendUrl("https://mail-admin.example.com/path")).toBe("https://mail-admin.example.com");
    expect(validateBackendUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(() => validateBackendUrl("http://mail-admin.example.com")).toThrow();
    expect(() => validateBackendUrl("https://user:password@mail-admin.example.com")).toThrow();
  });

  it("permits only exact Microsoft Outlook HTTPS hosts", () => {
    expect(isAllowedOutlookUrl("https://outlook.office.com/mail/inbox/id/AAQk")).toBe(true);
    expect(isAllowedOutlookUrl("https://outlook.cloud.microsoft/mail/AAQk")).toBe(true);
    expect(isAllowedOutlookUrl("https://outlook.office.com.evil.example/mail")).toBe(false);
    expect(isAllowedOutlookUrl("javascript:alert(1)")).toBe(false);
  });

  it("prefers Chrome, then Edge, then the system browser", () => {
    const environment = { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\Admin\\AppData\\Local" };
    const candidates = browserCandidates(environment);
    const edge = candidates.find((candidate) => candidate.kind === "edge")!;
    expect(chooseBrowser({ backendUrl: "http://localhost:3000" }, environment, (value) => value === edge.executable).kind).toBe("edge");
    const chrome = candidates.find((candidate) => candidate.kind === "chrome")!;
    expect(chooseBrowser({ backendUrl: "http://localhost:3000" }, environment, (value) => value === chrome.executable || value === edge.executable).kind).toBe("chrome");
    expect(chooseBrowser({ backendUrl: "http://localhost:3000" }, environment, () => false).kind).toBe("default");
  });

  it("always gives Chromium a fresh user-data directory", () => {
    const args = chromiumArguments("C:\\Temp\\CompanyMailLauncher\\profile-random", "https://outlook.office.com/mail/id");
    expect(args).toContain("--user-data-dir=C:\\Temp\\CompanyMailLauncher\\profile-random");
    expect(args).toContain("--new-window");
    expect(args.at(-1)).toBe("https://outlook.office.com/mail/id");
  });

  it("exchanges only the launch ID and rejects non-Outlook responses", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ launchId });
      return new Response(JSON.stringify({ webLink: "https://outlook.office.com/mail/inbox/id/AAQk" }), { status: 200 });
    }) as typeof fetch;
    await expect(exchangeLaunchId(launchId, { backendUrl: "https://mail-admin.example.com" }, fetcher)).resolves.toContain("outlook.office.com");

    const maliciousFetcher = vi.fn(async () => new Response(JSON.stringify({ webLink: "https://outlook.office.com.evil.example/message" }), { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeLaunchId(launchId, { backendUrl: "https://mail-admin.example.com" }, maliciousFetcher)).rejects.toThrow("approved Outlook hosts");
  });
});
