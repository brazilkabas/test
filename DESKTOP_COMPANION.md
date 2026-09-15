# Company Mail Launcher

`apps/desktop-companion` is a headless Windows protocol launcher. It has no normal
window, tray application, settings screen, embedded browser, or Microsoft token store.
Its only interactive surface is Windows/the browser's standard external-application
permission prompt.

## Build and install

From the repository root:

```powershell
npm run desktop:build
.\apps\desktop-companion\install.ps1 -BackendUrl "https://mail-admin.company.example"
```

The build creates:

```text
apps\desktop-companion\release\CompanyMailLauncher.exe
```

The repository build is an unsigned development artifact. Code-sign the executable
with the company's trusted Windows signing certificate before production distribution;
otherwise Windows may show an unknown-publisher warning.

The per-user installer copies the executable to
`%LOCALAPPDATA%\CompanyMailLauncher`, writes a non-secret `config.json`, and registers:

```text
HKCU\Software\Classes\companymail
companymail://open/<short-lived-launch-id>
```

Administrator rights are not required for the per-user protocol registration. Running
`CompanyMailLauncher.exe` without a protocol URL also registers the protocol. Uninstall
with the installed `uninstall.ps1` or the repository's `uninstall.ps1`.

Optional installer parameters:

```powershell
.\install.ps1 `
  -BackendUrl "https://mail-admin.company.example" `
  -PreferredBrowser chrome `
  -BrowserPath "C:\Portable\Chrome\Application\chrome.exe"
```

Remote backend URLs must use HTTPS. Plain HTTP is accepted only for localhost.

## Configuration

The launcher reads the following sources in priority order:

1. `COMPANYMAIL_BACKEND_URL`, `COMPANYMAIL_BROWSER`, and
   `COMPANYMAIL_BROWSER_PATH` environment variables.
2. The file selected by `COMPANYMAIL_CONFIG`.
3. `%LOCALAPPDATA%\CompanyMailLauncher\config.json`.
4. `config.json` next to the executable.

Example:

```json
{
  "backendUrl": "https://mail-admin.company.example",
  "preferredBrowser": "auto"
}
```

Valid browser preferences are `auto`, `chrome`, `edge`, and `default`. `auto` prefers
Chrome, then Edge, then the Windows default browser. No secrets belong in this file.

## Launch flow

1. The mail UI requests a launch ID from `POST /api/v1/outlook-launch`.
2. The backend obtains the selected Graph message's `webLink`, stores only a SHA-256
   hash of a cryptographically random 256-bit launch ID, binds it to the connection and
   message, and expires it after 60 seconds.
3. The website navigates to `companymail://open/<launch-id>`.
4. Windows starts `CompanyMailLauncher.exe`.
5. The launcher posts only the launch ID to
   `/api/v1/outlook-launch/exchange`.
6. The backend atomically consumes the ID and returns the bound Outlook `webLink`.
7. The launcher accepts only an HTTPS URL on an exact approved Outlook host.
8. Chrome or Edge is started with a newly generated `--user-data-dir` and the precise
   Outlook deep link.
9. The launcher waits for that browser process, then deletes the temporary profile.
   Abandoned profile directories older than 24 hours are removed on a later launch.

If neither Chrome nor Edge exists, Windows' default browser is used. Windows does not
provide a browser-independent fresh-profile option, so profile isolation cannot be
guaranteed for that final fallback.

Logs are written to `%LOCALAPPDATA%\CompanyMailLauncher\logs`. Launch IDs and full URLs
are never written to those logs.

## Security boundary

The protocol carries only the short-lived random launch ID. It never carries a Graph
access/refresh token, Outlook URL, cookie, Cloudflare credential, password, or signing
key. The backend records launch creation, successful consumption, expiration, replay,
and concurrent-consumption outcomes in the audit log.

The launcher does not inspect, extract, inject, create, or transform browser cookies.
It does not bypass MFA, Conditional Access, device compliance, sign-in frequency, or
any other Microsoft control. Microsoft and Windows decide whether Entra/Windows SSO is
available in the fresh profile. If authentication is required, Microsoft presents and
controls it; the Outlook deep link remains the requested post-authentication target.

## Verification boundary

Protocol parsing, backend restrictions, browser ordering, isolated Chromium arguments,
single-use backend consumption logic, URL allow-listing, TypeScript, and executable
packaging can be validated in CI. The complete permission-prompt and Windows browser
handoff must be tested on a Windows machine with the launcher installed and a live
Graph message. A Linux build alone is not evidence of that end-to-end result.
