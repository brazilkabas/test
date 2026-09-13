[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$installDirectory = Join-Path $env:LOCALAPPDATA "CompanyMailLauncher"
$executable = Join-Path $installDirectory "CompanyMailLauncher.exe"

if (Test-Path -LiteralPath $executable -PathType Leaf) {
  $process = Start-Process -FilePath $executable -ArgumentList "--uninstall" -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    Remove-Item -LiteralPath "Registry::HKEY_CURRENT_USER\Software\Classes\companymail" -Recurse -Force -ErrorAction SilentlyContinue
  }
} else {
  Remove-Item -LiteralPath "Registry::HKEY_CURRENT_USER\Software\Classes\companymail" -Recurse -Force -ErrorAction SilentlyContinue
}

$profiles = Join-Path $env:TEMP "CompanyMailLauncher"
Remove-Item -LiteralPath $profiles -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $installDirectory -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Company Mail Launcher uninstalled."
