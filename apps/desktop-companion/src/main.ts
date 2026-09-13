import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type CompanionConfig = {
  backendUrl: string;
  browser: "default" | "chrome" | "edge" | "custom";
  browserPath?: string;
  profileDirectory?: string;
  isolatedUserDataDirectory?: string;
};

const defaultConfig: CompanionConfig = {
  backendUrl: "http://localhost:3000",
  browser: "default",
};

let window: BrowserWindow | null = null;
let queuedProtocolUrl: string | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on("second-instance", (_event, argv) => {
  const protocolUrl = argv.find((value) => value.startsWith("companymail://"));
  if (protocolUrl) void handleProtocol(protocolUrl);
  window?.show();
});

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient("companymail");
  createWindow();
  const protocolUrl = process.argv.find((value) => value.startsWith("companymail://")) ?? queuedProtocolUrl;
  if (protocolUrl) void handleProtocol(protocolUrl);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("config:get", () => loadConfig());
ipcMain.handle("config:save", (_event, value: CompanionConfig) => {
  const config = validateConfig(value);
  writeFileSync(configPath(), JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
  return config;
});
ipcMain.handle("protocol:test", async (_event, token: string) => {
  await exchangeAndLaunch(token);
  return true;
});

function createWindow() {
  window = new BrowserWindow({
    width: 620,
    height: 680,
    minWidth: 480,
    minHeight: 560,
    title: "Company Mail Companion",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void window.loadFile(path.join(__dirname, "..", "renderer.html"));
}

async function handleProtocol(value: string) {
  if (!app.isReady()) {
    queuedProtocolUrl = value;
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "companymail:" || url.hostname !== "open") throw new Error("Unsupported launch request");
    const token = url.searchParams.get("token");
    if (!token || token.length < 40) throw new Error("Launch token is missing");
    await exchangeAndLaunch(token);
    window?.webContents.send("launch:status", { ok: true, message: "Outlook opened in your configured browser." });
  } catch (error) {
    window?.webContents.send("launch:status", { ok: false, message: error instanceof Error ? error.message : "Launch failed" });
    window?.show();
  }
}

async function exchangeAndLaunch(token: string) {
  const config = loadConfig();
  const response = await fetch(`${config.backendUrl.replace(/\/$/, "")}/api/v1/outlook-launch/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const body = await response.json() as { webLink?: string; error?: string };
  if (!response.ok || !body.webLink) throw new Error(body.error ?? "The launch request was rejected");
  const url = new URL(body.webLink);
  if (url.protocol !== "https:" || !isMicrosoftOutlookHost(url.hostname)) throw new Error("Backend returned a non-Outlook URL");
  await launchBrowser(url.toString(), config);
}

async function launchBrowser(url: string, config: CompanionConfig) {
  if (config.browser === "default") {
    await shell.openExternal(url);
    return;
  }
  const executable = config.browserPath || defaultBrowserPath(config.browser);
  if (!executable || !existsSync(executable)) throw new Error("Configured browser executable was not found");
  const args = [];
  if (config.isolatedUserDataDirectory) args.push(`--user-data-dir=${config.isolatedUserDataDirectory}`);
  if (config.profileDirectory) args.push(`--profile-directory=${config.profileDirectory}`);
  args.push("--new-window", url);
  const child = spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
}

function loadConfig(): CompanionConfig {
  try {
    return validateConfig(JSON.parse(readFileSync(configPath(), "utf8")) as CompanionConfig);
  } catch {
    return defaultConfig;
  }
}

function validateConfig(value: CompanionConfig): CompanionConfig {
  const backend = new URL(value.backendUrl);
  if (!["http:", "https:"].includes(backend.protocol)) throw new Error("Backend URL must use HTTP or HTTPS");
  if (backend.protocol === "http:" && !["localhost", "127.0.0.1"].includes(backend.hostname)) throw new Error("Remote backends must use HTTPS");
  if (!["default", "chrome", "edge", "custom"].includes(value.browser)) throw new Error("Unsupported browser selection");
  return { ...value, backendUrl: backend.origin };
}

function configPath() {
  return path.join(app.getPath("userData"), "companion-config.json");
}

function defaultBrowserPath(browser: string) {
  const programFiles = process.env.PROGRAMFILES ?? "C:\\Program Files";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
  return browser === "edge"
    ? path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")
    : path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe");
}

function isMicrosoftOutlookHost(hostname: string) {
  const host = hostname.toLowerCase();
  return ["outlook.office.com", "outlook.office365.com", "outlook.live.com"].includes(host);
}
