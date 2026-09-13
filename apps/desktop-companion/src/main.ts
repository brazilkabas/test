#!/usr/bin/env node
import {
  cleanupStaleProfiles,
  exchangeLaunchId,
  launchOutlook,
  loadConfig,
  parseProtocolUrl,
  registerProtocol,
  unregisterProtocol,
  writeLog,
} from "./launcher";

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    if (args.includes("--uninstall")) {
      unregisterProtocol();
      writeLog("protocol_unregistered");
      return 0;
    }
    if (args.includes("--install") || !args.some((value) => value.startsWith("companymail:"))) {
      registerProtocol();
      cleanupStaleProfiles();
      writeLog("protocol_registered");
      return 0;
    }
    const protocolUrl = args.find((value) => value.startsWith("companymail:"));
    if (!protocolUrl) throw new Error("No Company Mail launch request was supplied");
    const launchId = parseProtocolUrl(protocolUrl);
    const config = loadConfig();
    writeLog("launch_exchange_started");
    const webLink = await exchangeLaunchId(launchId, config);
    writeLog("launch_exchange_succeeded");
    await launchOutlook(webLink, config);
    writeLog("browser_session_closed");
    return 0;
  } catch (error) {
    writeLog("launch_failed", error instanceof Error ? error.message : "Unknown launcher failure");
    return 1;
  }
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
