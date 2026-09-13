import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type LauncherConfig = {
  backendUrl: string;
  preferredBrowser?: "auto" | "chrome" | "edge" | "default";
  browserPath?: string;
};

export type BrowserChoice =
  | { kind: "chrome" | "edge" | "custom"; executable: string }
  | { kind: "default"; executable: "explorer.exe" };

const OUTLOOK_HOSTS = new Set([
  "outlook.office.com",
  "outlook.office365.com",
  "outlook.live.com",
  "outlook.cloud.microsoft",
]);
const PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function parseProtocolUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "companymail:" || url.hostname !== "open") {
    throw new Error("Unsupported Company Mail launch URL");
  }
  const launchId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(launchId)) {
    throw new Error("Launch ID is missing or invalid");
  }
  if (url.search || url.hash) throw new Error("Launch URL must contain only the launch ID");
  return launchId;
}

export function validateBackendUrl(value: string): string {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error("Remote backend URL must use HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("Backend URL cannot contain credentials, query parameters, or fragments");
  return url.origin;
}

export function isAllowedOutlookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && OUTLOOK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function browserCandidates(environment: NodeJS.ProcessEnv): Array<{ kind: "chrome" | "edge"; executable: string }> {
  const programFiles = environment.PROGRAMFILES ?? "C:\\Program Files";
  const programFilesX86 = environment["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
  const localAppData = environment.LOCALAPPDATA;
  return [
    { kind: "chrome", executable: path.win32.join(programFiles, "Google", "Chrome", "Application", "chrome.exe") },
    ...(localAppData ? [{ kind: "chrome" as const, executable: path.win32.join(localAppData, "Google", "Chrome", "Application", "chrome.exe") }] : []),
    { kind: "chrome", executable: path.win32.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe") },
    { kind: "edge", executable: path.win32.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe") },
    { kind: "edge", executable: path.win32.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe") },
    ...(localAppData ? [{ kind: "edge" as const, executable: path.win32.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe") }] : []),
  ];
}

export function chooseBrowser(
  config: LauncherConfig,
  environment: NodeJS.ProcessEnv = process.env,
  fileExists: (value: string) => boolean = existsSync,
): BrowserChoice {
  if (config.browserPath) {
    if (!fileExists(config.browserPath)) throw new Error("Configured browser executable was not found");
    return { kind: "custom", executable: config.browserPath };
  }
  const preference = config.preferredBrowser ?? "auto";
  if (preference === "default") return { kind: "default", executable: "explorer.exe" };
  const candidates = browserCandidates(environment);
  const preferred = preference === "auto"
    ? candidates
    : [...candidates.filter((candidate) => candidate.kind === preference), ...candidates.filter((candidate) => candidate.kind !== preference)];
  const found = preferred.find((candidate) => fileExists(candidate.executable));
  return found ?? { kind: "default", executable: "explorer.exe" };
}

export function chromiumArguments(profileDirectory: string, outlookUrl: string): string[] {
  return [
    `--user-data-dir=${profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    outlookUrl,
  ];
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): LauncherConfig {
  const configuredPath = environment.COMPANYMAIL_CONFIG;
  const paths = [
    ...(configuredPath ? [configuredPath] : []),
    path.join(dataDirectory(environment), "config.json"),
    path.join(path.dirname(process.execPath), "config.json"),
  ];
  let value: Partial<LauncherConfig> = {};
  for (const candidate of paths) {
    try {
      value = JSON.parse(readFileSync(candidate, "utf8")) as Partial<LauncherConfig>;
      break;
    } catch {
      // Continue to installer defaults or environment variables.
    }
  }
  const backendUrl = environment.COMPANYMAIL_BACKEND_URL ?? value.backendUrl ?? "http://localhost:3000";
  const preferredBrowser = normalizeBrowser(environment.COMPANYMAIL_BROWSER ?? value.preferredBrowser);
  const browserPath = environment.COMPANYMAIL_BROWSER_PATH ?? value.browserPath;
  return { backendUrl: validateBackendUrl(backendUrl), preferredBrowser, ...(browserPath ? { browserPath } : {}) };
}

export async function exchangeLaunchId(
  launchId: string,
  config: LauncherConfig,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetcher(`${validateBackendUrl(config.backendUrl)}/api/v1/outlook-launch/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ launchId }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as { webLink?: string; error?: string } | null;
    if (!response.ok || !body?.webLink) throw new Error(body?.error ?? `Launch request was rejected (${response.status})`);
    if (!isAllowedOutlookUrl(body.webLink)) throw new Error("Backend returned a URL outside the approved Outlook hosts");
    return body.webLink;
  } finally {
    clearTimeout(timeout);
  }
}

export async function launchOutlook(
  outlookUrl: string,
  config: LauncherConfig,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!isAllowedOutlookUrl(outlookUrl)) throw new Error("Outlook URL failed validation");
  const browser = chooseBrowser(config, environment);
  if (browser.kind === "default") {
    const child = spawn(browser.executable, [outlookUrl], { detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    return;
  }
  const profileRoot = profileRootDirectory(environment);
  mkdirSync(profileRoot, { recursive: true });
  cleanupStaleProfiles(profileRoot);
  const temporaryProfile = mkdtempSync(path.join(profileRoot, "profile-"));
  let child: ChildProcess | undefined;
  try {
    child = spawn(browser.executable, chromiumArguments(temporaryProfile, outlookUrl), {
      stdio: "ignore",
      windowsHide: false,
    });
    await new Promise<void>((resolve, reject) => {
      child!.once("error", reject);
      child!.once("close", () => resolve());
    });
  } finally {
    removeProfile(temporaryProfile);
  }
}

export function cleanupStaleProfiles(root = profileRootDirectory()): void {
  if (!existsSync(root)) return;
  const cutoff = Date.now() - PROFILE_MAX_AGE_MS;
  for (const name of readdirSync(root)) {
    const candidate = path.join(root, name);
    try {
      if (name.startsWith("profile-") && statSync(candidate).mtimeMs < cutoff) removeProfile(candidate);
    } catch {
      // A browser may still own the directory. It will be retried next launch.
    }
  }
}

export function registerProtocol(executable = process.execPath): void {
  if (process.platform !== "win32") throw new Error("Protocol registration is supported only on Windows");
  const root = "HKCU\\Software\\Classes\\companymail";
  const commands = [
    ["ADD", root, "/ve", "/d", "URL:Company Mail Launcher", "/f"],
    ["ADD", root, "/v", "URL Protocol", "/d", "", "/f"],
    ["ADD", `${root}\\DefaultIcon`, "/ve", "/d", `${executable},0`, "/f"],
    ["ADD", `${root}\\shell\\open\\command`, "/ve", "/d", `"${executable}" "%1"`, "/f"],
  ];
  for (const args of commands) {
    const result = spawnSync("reg.exe", args, { windowsHide: true, stdio: "ignore" });
    if (result.status !== 0) throw new Error("Windows protocol registration failed");
  }
}

export function unregisterProtocol(): void {
  if (process.platform !== "win32") throw new Error("Protocol registration is supported only on Windows");
  spawnSync("reg.exe", ["DELETE", "HKCU\\Software\\Classes\\companymail", "/f"], { windowsHide: true, stdio: "ignore" });
}

export function writeLog(event: string, detail = ""): void {
  try {
    const directory = path.join(dataDirectory(), "logs");
    mkdirSync(directory, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const safeDetail = detail.replace(/companymail:[^\s]+/gi, "[launch-url-redacted]").replace(/https:\/\/[^\s]+/gi, "[url-redacted]").slice(0, 500);
    appendFileSync(path.join(directory, `launcher-${date}.log`), `${new Date().toISOString()} ${event}${safeDetail ? ` ${safeDetail}` : ""}\n`, "utf8");
  } catch {
    // Logging must never prevent a launch.
  }
}

export function saveConfig(config: LauncherConfig, environment: NodeJS.ProcessEnv = process.env): void {
  const directory = dataDirectory(environment);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "config.json"), JSON.stringify({ ...config, backendUrl: validateBackendUrl(config.backendUrl) }, null, 2), { encoding: "utf8", mode: 0o600 });
}

function dataDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  return path.join(environment.LOCALAPPDATA ?? path.join(tmpdir(), "CompanyMailLauncherData"), "CompanyMailLauncher");
}
function profileRootDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  return path.join(environment.TEMP ?? tmpdir(), "CompanyMailLauncher", "profiles");
}
function removeProfile(directory: string) {
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 300 }); } catch { /* Cleaned on a later invocation. */ }
}
function normalizeBrowser(value: unknown): LauncherConfig["preferredBrowser"] {
  return ["auto", "chrome", "edge", "default"].includes(String(value)) ? value as LauncherConfig["preferredBrowser"] : "auto";
}
