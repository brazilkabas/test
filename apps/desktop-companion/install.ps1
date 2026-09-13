[CmdletBinding()]
param(
  [string]$BackendUrl = "http://localhost:3000",
  [ValidateSet("auto", "chrome", "edge", "default")]
  [string]$PreferredBrowser = "auto",
  [string]$BrowserPath = "",
  [string]$ExecutablePath = (Join-Path $PSScriptRoot "release\CompanyMailLauncher.exe")
)

$ErrorActionPreference = "Stop"

$uri = [Uri]$BackendUrl
$isLocal = $uri.Scheme -eq "http" -and $uri.Host -in @("localhost", "127.0.0.1", "::1")
if ($uri.Scheme -ne "https" -and -not $isLocal) {
  throw "Remote backend URLs must use HTTPS."
}
if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
  throw "CompanyMailLauncher.exe was not found at: $ExecutablePath"
}
if ($BrowserPath -and -not (Test-Path -LiteralPath $BrowserPath -PathType Leaf)) {
  throw "The configured browser executable was not found: $BrowserPath"
}

$installDirectory = Join-Path $env:LOCALAPPDATA "CompanyMailLauncher"
$installedExecutable = Join-Path $installDirectory "CompanyMailLauncher.exe"
New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $ExecutablePath -Destination $installedExecutable -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "uninstall.ps1") -Destination (Join-Path $installDirectory "uninstall.ps1") -Force

$config = @{
  backendUrl = $uri.GetLeftPart([UriPartial]::Authority)
  preferredBrowser = $PreferredBrowser
}
if ($BrowserPath) { $config.browserPath = $BrowserPath }
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $installDirectory "config.json") -Encoding utf8

$process = Start-Process -FilePath $installedExecutable -ArgumentList "--install" -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -ne 0) {
  throw "The launcher could not register the companymail protocol. See $installDirectory\logs."
}

Write-Host "Company Mail Launcher installed."
Write-Host "Protocol: companymail://"
Write-Host "Backend: $($config.backendUrl)"
Write-Host "Executable: $installedExecutable"
