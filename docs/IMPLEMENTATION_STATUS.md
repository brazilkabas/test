# Implementation status

Audit date: 2026-09-13.

Status is based on executable behavior, not compilation alone. `Complete` means the
repository contains the production path. Provider-bound workflows remain separately
marked until exercised with a real tenant, Cloudflare zone, or Windows machine.

## Product status

| Feature | Status | Locally Tested | Microsoft Live Tested | Cloudflare Live Tested | Requires Configuration | Known limitations |
|---|---|---:|---:|---:|---:|---|
| Premium application shell | Complete | Browser | N/A | N/A | No | Compact 236 px/collapsible navigation, breadcrumb, global search, account switcher, system health, admin menu, keyboard focus and responsive mobile navigation are implemented. |
| Geist typography/design tokens | Complete | Browser/build | N/A | N/A | No | Local Geist package avoids runtime font fetching. Light/dark surfaces, semantic color, focus, compact controls, tables, drawers, modals, toasts, skeletons and empty states are shared. |
| Overview dashboard | Complete | Browser | Partial health probe only | No | Microsoft for live metrics | Five requested metrics, connections, mail activity, deployments, health and audit sections are real API data. Empty-state behavior is locally verified. |
| Microsoft accounts table | Complete | Build/browser empty state | No | N/A | Microsoft | Search, status filters, capability/action menus and disconnect exist. Account actions require a connected tenant to validate. |
| Employee account profile | Complete | Build | No | N/A | Microsoft | Overview, Mail, Rules, Settings, Shared Mailboxes, Permissions and Audit tabs exist; live values depend on Graph. |
| Dense three-pane webmail | Complete UI / live required | Build | No | N/A | Microsoft mailbox | Folder rail, compact message list, reading pane, search/filter drawer, compose, attachments and message actions are implemented. No connected account was available for browser verification. |
| Safe message rendering | Complete / live required | Unit/build | No | N/A | Microsoft | Backend sanitizes HTML and blocks remote images. Inline CID-image resolution remains partial. |
| Mail search and pagination | Complete / live required | Build | No | N/A | Microsoft | Graph server-side query construction and opaque `@odata.nextLink` handling exist. |
| Compose, draft, reply, reply-all, forward | Complete / live required | Build | No | N/A | Microsoft | Real Graph routes exist; attachment compose limit is 3 MB in the current UI. |
| Message move/archive/delete/read/flag | Complete / live required | Build | No | N/A | Microsoft | Copy and category assignment remain missing. |
| Inbox rules | Complete / live required | Build | No | N/A | Microsoft scopes | Graph-supported CRUD, enable/disable and priority UI. |
| Mailbox settings | Complete / live required | Build | No | N/A | Microsoft scopes | Automatic replies, locale/time preferences and working hours use supported Graph paths. |
| Organization directory | Complete / live required | Build | No | N/A | `User.ReadBasic.All` or `User.Read.All` | Capability-driven and does not infer mailbox access. |
| Shared mailbox discovery | Missing | N/A | No | N/A | Microsoft shared scopes and delegated rights | Reserved schema and navigation exist; mailbox-address probing and shared-folder routing do not. |
| Exchange delegation | Complete architecture / live required | Build | No | N/A | Exchange Online PowerShell, certificate and RBAC | Uses official Exchange Online PowerShell rather than fabricated Graph APIs. |
| Access-code administration | Complete | Build/local database | N/A | N/A | No | Cryptographic 15-character codes, hash-only persistence, expiration/use/IP/role/profile policy, one-time plaintext display and revoke are implemented. |
| Audit viewer and writes | Partial | Build/local database | No | No | No | Core sensitive operations are audited. Coverage is not yet exhaustive for every future integration. |
| Security and RBAC UI | Partial | Build | N/A | N/A | No | Permission matrix, sessions and revocation exist. User role assignment UI is not complete. |
| First-run setup wizard | Missing | N/A | N/A | N/A | Environment secrets | Configuration remains environment/backend managed. |

## Focused page builder acceptance

| Requirement | Status | Locally Tested | Microsoft Live Tested | Cloudflare Live Tested | Requires Configuration | Known limitations |
|---|---|---:|---:|---:|---:|---|
| Exactly ten finished designs | Complete | Unit + browser | N/A | No | No | Compact Card, Split Screen, PDF / Document View, Centered Enterprise, Full Hero, Two-Column Instructions, Resource Portal, Modern Glass, Dark Professional and Mobile-First Stack. IDs and structure labels are unit-tested unique. |
| Actual template thumbnails | Complete | Browser | N/A | No | No | Gallery and design rail render the real template document. A double-scaling defect found during browser review was corrected. |
| Provider + layout selection | Complete | Unit + browser | N/A | No | No | Microsoft 365, SharePoint, OneDrive, Adobe Acrobat Sign, DocuSign, Company and Custom variants render across every layout without changing the structure. |
| Automatic provider identity | Partial | Unit + browser | N/A | No | Approved artwork if required | Built-in provider identity marks appear in gallery, editor and output. Licensed vendor artwork is not claimed as bundled; an administrator can use approved uploaded assets. |
| Company logos | Complete | Build/browser controls | N/A | No | No | PNG/JPEG/WEBP/sanitized SVG, light/dark/default variants, existing-asset selection, provider/company/both/none modes, size, alignment and spacing. |
| Constrained customization | Complete | Browser | N/A | No | No | Title, description, three steps, button text, footer, document name, provider, logos, primary/background colors and behavior update the dominant preview immediately. |
| Protected device-code component | Complete | Unit + browser | No | No | Microsoft | The normal editor has no value control. All ten designs render `XXXX-XXXX`; only renderer input from the official device session can replace it. Authored text is unit-tested not to replace the value. |
| Copy and Continue actions | Complete | Unit/render | No | No | Microsoft | Live `/connect` binds Copy to the Microsoft-issued code and Continue to the Microsoft verification URI. The admin never types the Microsoft destination. |
| Preview devices | Complete | Browser | N/A | N/A | No | Desktop, tablet and mobile widths. |
| Preview states | Complete | Browser | N/A | N/A | No | Initial, Waiting, Success, Expired, Error, Ready, Reviewing and Completed. |
| Success redirect | Complete / live required | Unit/build | No | No | Microsoft | HTTPS and local-development HTTP are allowed; `javascript:`, `data:`, `file:` and public HTTP are rejected. Redirect runs only after backend status is `CONNECTED`, with immediate/1/3/5/10 second/never options. |
| Focused right-panel organization | Complete | Browser | N/A | N/A | No | Content, Branding, Behavior and collapsed Advanced groups replace the previous giant property form. |
| Advanced HTML/CSS | Partial | Unit/build | N/A | No | No | Separated and warned. HTML is allowlist-sanitized; CSS cannot escape its style block. Custom JavaScript is not accepted for execution or publication. |
| Automatic versioning/history | Complete | Browser | N/A | N/A | No | Six-second autosave, manual save, editor/time/state metadata and non-destructive restore. Visual compare is not implemented. |
| Project dashboard | Partial | Browser | N/A | No | No | Actual page thumbnails, name, provider, layout, state, URL, version, update date, Edit, Publish and Duplicate. Archive/delete remain in APIs/deployment management rather than each card. |
| Project assets | Partial | Build | N/A | No | Optional R2 | Safe database storage, signature checks, SVG sanitization and immutable data embedding exist. R2 is not implemented. |

## Cloudflare publishing

| Requirement | Status | Locally Tested | Cloudflare Live Tested | Requires Configuration | Known limitations |
|---|---|---:|---:|---:|---|
| Builder-integrated publish drawer | Complete | Browser | No | Cloudflare | No navigation to a technical settings page is required. |
| API Token authentication | Complete / live required | Browser input/build | No | API token | Credential is a password field and never prefilled or returned. |
| Global API Key + Email | Complete / live required | Browser/build | No | Email + Global API Key | Legacy mode is explicitly labeled. |
| Test and account/zone discovery | Complete / live required | Build | No | Cloudflare credential | Uses Cloudflare API discovery and validates selected account/zone. |
| Save securely or use once | Complete / live required | Build | No | Encryption key | Saved credentials use AES-GCM and rotation versioning. Use-once credentials are passed only to the backend deployment call and are not persisted. |
| Secret isolation | Complete | Code review/build | No | Encryption key | No localStorage, generated HTML, deployment payload, response, audit metadata, or custom protocol contains Cloudflare credentials. |
| Random/custom hostname | Complete | Crypto/build | No | Zone/base domain | Browser preview uses Web Crypto; backend constrains the domain and performs the authoritative database collision check. |
| Visibility and expiration | Partial | Worker tests | No | Worker/KV | Public, access-code, disabled and expired are functional. `Private` is fail-closed with HTTP 403; authenticated private-origin access is not implemented. |
| Central wildcard architecture | Complete | Worker tests | No | Worker, wildcard DNS, KV binding | One Worker reads hostname and retrieves centrally stored deployment payloads. It never creates one Worker per page. |
| Deployment success view | Complete | Build/browser path | No | Cloudflare | Live URL, copy, open, QR code, one-time access code, edit, republish and start-Microsoft-session actions exist. Success itself requires a live deployment. |
| Publish/republish/disable/delete | Complete / live required | Build | No | Cloudflare | Backend routes and deployment table actions exist. |
| Live Cloudflare publish | Requires configuration | No | No | Account, zone, token/key, Worker, KV and wildcard DNS | No Cloudflare credential was supplied in this environment; no live success claim is made. |
| Cloudflare page → live Microsoft session | Complete / live required | Unit/build | No | Public HTTPS `APP_BASE_URL` + Cloudflare | “Start Microsoft session” binds the active deployment to the new short-lived session, republishes only the real Microsoft code/verification URI, and installs a backend-controlled nonce script that polls the token-protected status endpoint. CORS is granted only when the request origin matches an active deployment for that project. Local HTTP deliberately falls back to `/connect`. |

## Microsoft authorization and Outlook launcher

| Requirement | Status | Locally Tested | Microsoft/Windows Live Tested | Requires Configuration | Known limitations |
|---|---|---:|---:|---:|---|
| Official MSAL device authorization | Complete / live required | Build | No completed sign-in | Entra tenant/client | A genuine Microsoft code was previously issued but expired before sign-in. Backend polling remains process-local. |
| Encrypted MSAL cache | Complete / live required | AES-GCM unit | No | Encryption key + Entra | Silent refresh and interaction-required state need tenant validation. |
| Token-protected status polling | Complete | Build | No | No | Independent 256-bit status bearer; only its hash is persisted. |
| Project-themed live connect page | Complete / live required | Render/browser | No | Entra | Real code, Copy, official Microsoft destination, waiting/success/expired/failed/restart and success redirect paths exist. |
| Headless Windows launcher | Complete implementation / live required | Go tests + cross-build | No | Windows | No normal UI; GUI-subsystem executable handles protocol and exits. Development binary is unsigned. |
| Protocol install/uninstall | Complete implementation / live required | Unit/code review | No | Windows registry | PowerShell and CMD wrappers plus launcher `--install`/`--uninstall`. |
| Launch-ID security | Complete | Unit/build | No | Microsoft message | Cryptographic, 60-second, single-use, message-bound and audited. Protocol contains only the launch ID. |
| Outlook `webLink` validation | Complete | Go tests | No | Real Graph message | Backend and launcher constrain permitted Microsoft Outlook hosts. |
| Chrome/Edge/default detection | Complete implementation / live required | Go tests | No | Windows browsers | Preference order and safe fallback are implemented. |
| Fresh temporary profile | Complete implementation / live required | Go tests | No | Chrome/Edge on Windows | Unique profile per click, wait-for-exit cleanup and stale cleanup are implemented. |
| Cookie/token isolation | Complete | Code review/tests | No | No | No extraction, injection, Graph-to-cookie conversion, MFA bypass, or Conditional Access bypass. |
| End-to-end Outlook acceptance | Requires Windows + Microsoft | No | No | Connected mailbox, launcher installation and Windows | External-app prompt, browser runtime, Windows/Entra SSO and exact post-auth message navigation cannot be validated on Linux. Microsoft may still require interactive authentication. |

## Verification performed

| Check | Result | Evidence |
|---|---|---|
| ESLint | Pass | Entire repository. |
| TypeScript | Pass | `tsc --noEmit`. |
| Automated tests | Pass | 14 Vitest checks plus native Go launcher tests. Includes ten-layout/provider invariants, protected code, redirect schemes, restart-state visibility, nonce-bound session bridge and Worker security behavior. |
| Production build | Pass | Next.js 16 optimized build. |
| Browser smoke test | Pass for local UI scope | Dashboard, exactly ten gallery designs, provider change, Split Screen creation, live edits, responsive previews, save persistence and publish drawer. |
| PostgreSQL migration | Pass locally | Migrations were applied to the local PostgreSQL service. |
| Dependency audit | Pass | Install reported zero vulnerabilities. |
| Microsoft live acceptance | Not completed | Requires an interactive sign-in and real mailbox. |
| Cloudflare live acceptance | Not completed | Requires account/zone credentials plus deployed wildcard Worker/KV/DNS. |
| Windows launcher acceptance | Not completed | Requires Windows, installed Chrome/Edge, a real message and Microsoft session/SSO. |

## Remaining acceptance blockers

1. Configure a public HTTPS `APP_BASE_URL`, Cloudflare Worker/KV/wildcard DNS and
   execute publish, bind-session, open, edit,
   republish, disable and access-code tests against a real zone.
2. Complete Microsoft authorization and verify mailbox, rules, settings, attachment,
   redirect and exact Outlook `webLink` behavior in the customer tenant.
3. Install and code-sign the launcher on Windows; verify Chrome, Edge, fresh profiles,
   external-protocol consent, Windows/Entra SSO and interactive-auth fallback.
4. Implement shared-mailbox discovery/routing and finish user-role administration.
