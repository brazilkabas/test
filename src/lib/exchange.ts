import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExchangePermissionOperation =
  | "GRANT_FULL_ACCESS"
  | "REVOKE_FULL_ACCESS"
  | "GRANT_SEND_AS"
  | "REVOKE_SEND_AS"
  | "GRANT_SEND_ON_BEHALF"
  | "REVOKE_SEND_ON_BEHALF";

export function exchangeConfiguration() {
  return {
    enabled: process.env.EXCHANGE_ENABLED === "true",
    organization: process.env.EXCHANGE_ORGANIZATION ?? null,
    appId: process.env.EXCHANGE_APP_ID ?? null,
    certificate: process.env.EXCHANGE_CERTIFICATE_THUMBPRINT ? "CONFIGURED" : "MISSING",
    powershell: process.env.EXCHANGE_POWERSHELL_PATH ?? "pwsh",
  };
}

export async function getMailboxDelegation(mailbox: string) {
  const script = `${connectScript()}
$full = Get-MailboxPermission -Identity '${quote(mailbox)}' -ErrorAction Stop | Where-Object { -not $_.IsInherited -and -not $_.Deny } | Select-Object User,AccessRights,IsInherited
$sendAs = Get-RecipientPermission -Identity '${quote(mailbox)}' -ErrorAction Stop | Where-Object { -not $_.IsInherited } | Select-Object Trustee,AccessRights,IsInherited
$mailbox = Get-Mailbox -Identity '${quote(mailbox)}' -ErrorAction Stop | Select-Object GrantSendOnBehalfTo
[PSCustomObject]@{ fullAccess = @($full); sendAs = @($sendAs); sendOnBehalf = @($mailbox.GrantSendOnBehalfTo) } | ConvertTo-Json -Depth 5 -Compress
Disconnect-ExchangeOnline -Confirm:$false`;
  return runPowerShell(script);
}

export async function changeMailboxPermission(
  operation: ExchangePermissionOperation,
  mailbox: string,
  delegate: string,
) {
  const identity = `'${quote(mailbox)}'`;
  const user = `'${quote(delegate)}'`;
  const commands: Record<ExchangePermissionOperation, string> = {
    GRANT_FULL_ACCESS: `Add-MailboxPermission -Identity ${identity} -User ${user} -AccessRights FullAccess -InheritanceType All -AutoMapping:$true -Confirm:$false -ErrorAction Stop`,
    REVOKE_FULL_ACCESS: `Remove-MailboxPermission -Identity ${identity} -User ${user} -AccessRights FullAccess -Confirm:$false -ErrorAction Stop`,
    GRANT_SEND_AS: `Add-RecipientPermission -Identity ${identity} -Trustee ${user} -AccessRights SendAs -Confirm:$false -ErrorAction Stop`,
    REVOKE_SEND_AS: `Remove-RecipientPermission -Identity ${identity} -Trustee ${user} -AccessRights SendAs -Confirm:$false -ErrorAction Stop`,
    GRANT_SEND_ON_BEHALF: `Set-Mailbox -Identity ${identity} -GrantSendOnBehalfTo @{Add=${user}} -Confirm:$false -ErrorAction Stop`,
    REVOKE_SEND_ON_BEHALF: `Set-Mailbox -Identity ${identity} -GrantSendOnBehalfTo @{Remove=${user}} -Confirm:$false -ErrorAction Stop`,
  };
  await runPowerShell(`${connectScript()}\n${commands[operation]}\nDisconnect-ExchangeOnline -Confirm:$false\n[PSCustomObject]@{ success = $true } | ConvertTo-Json -Compress`);
}

function connectScript() {
  const config = exchangeConfiguration();
  if (!config.enabled || !config.organization || !config.appId || config.certificate === "MISSING") {
    throw new ExchangeConfigurationError("Exchange administration is not configured");
  }
  return `$ErrorActionPreference = 'Stop'
Import-Module ExchangeOnlineManagement -ErrorAction Stop
Connect-ExchangeOnline -AppId '${quote(config.appId)}' -CertificateThumbprint '${quote(process.env.EXCHANGE_CERTIFICATE_THUMBPRINT!)}' -Organization '${quote(config.organization)}' -ShowBanner:$false`;
}

async function runPowerShell(script: string) {
  const executable = exchangeConfiguration().powershell;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  try {
    const { stdout } = await execFileAsync(executable, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const line = stdout.trim().split(/\r?\n/).at(-1);
    return line ? JSON.parse(line) as unknown : null;
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]") : "Exchange Online command failed";
    throw new ExchangeOperationError(safeMessage);
  }
}

function quote(value: string) {
  return value.replaceAll("'", "''");
}

export class ExchangeConfigurationError extends Error {}
export class ExchangeOperationError extends Error {}
