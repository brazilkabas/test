# Company Mail Launcher

Headless Windows handler for `companymail://open/<launch-id>`.

```powershell
npm run build
.\install.ps1 -BackendUrl "https://mail-admin.company.example"
```

Output: `release\CompanyMailLauncher.exe`.

There is no settings window. Configuration is supplied by `install.ps1`, a JSON config
file, or `COMPANYMAIL_*` environment variables. See
[`../../DESKTOP_COMPANION.md`](../../DESKTOP_COMPANION.md) for installation, security,
logging, browser fallback, cleanup, and end-to-end test instructions.
