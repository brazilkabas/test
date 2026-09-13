# Implementation status

Audit date: 2026-09-13. This document compares the repository to the master product
specification. “Implemented” means a real production code path exists; it does not
mean the feature has been validated against a customer tenant or provider account.

| Feature | Status | Files | Test Coverage | Live Test Required | Notes |
|---|---|---|---|---|---|
| Internal access-code login | IMPLEMENTED | `src/lib/auth.ts`, `src/app/api/v1/[...path]/route.ts`, `src/app/login/page.tsx` | Crypto unit tests only | No | HttpOnly session, CSRF, expiry/use limits and role override exist. |
| Access-code administration | IMPLEMENTED | `route.ts`, `access-code-admin.tsx`, Prisma `AccessCode` | Build/type checks | No | Create/list/revoke, role/use/expiry/IP policy and one-time plaintext display. |
| RBAC enforcement | PARTIALLY IMPLEMENTED | `src/lib/auth.ts`, Prisma roles | None | No | APIs enforce a hard-coded matrix; role/user administration UI absent. |
| Session administration/logout | IMPLEMENTED | `auth.ts`, `security-settings.tsx`, `enterprise-shell.tsx` | Build/type checks | No | Logout and administrator session revocation are audited. |
| Microsoft device authorization | REQUIRES LIVE MICROSOFT TEST | `src/lib/microsoft.ts`, `/connect/[sessionId]` | Smoke CLI only | Yes | Real MSAL flow; in-flight polling is process-local. |
| Device status privacy | IMPLEMENTED | `route.ts`, `microsoft.ts` | Build/type checks | No | Public employee status polling requires an independent 256-bit bearer token; only its hash is stored. |
| Encrypted MSAL token cache | REQUIRES LIVE MICROSOFT TEST | `src/lib/crypto.ts`, `src/lib/microsoft.ts` | AES-GCM unit test | Yes | Real encrypted cache plugin and silent acquisition. |
| Microsoft connection ownership | NOT IMPLEMENTED | Prisma `MicrosoftConnection.ownerId` | None | No | Field exists but is not assigned. |
| Reconnect/disconnect | NOT IMPLEMENTED | — | None | Yes | No UI/API; revoked consent remains Microsoft-controlled. |
| Admin dashboard | IMPLEMENTED | `/admin`, `admin-dashboard.tsx` | Build/type checks | Partly | Operational cards, Graph health, recent activity and quick actions. |
| Microsoft accounts page | IMPLEMENTED | `/admin/accounts`, `accounts-table.tsx` | Build/type checks | Partly | Search/filter/actions/permissions/disconnect. |
| Employee profile | IMPLEMENTED | `/profiles/[connectionId]`, `account-profile.tsx` | Build/type checks | Yes | Tabbed capability-driven account details. |
| Inbox listing/pagination | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | Smoke CLI | Yes | Real Graph and `@odata.nextLink`; UI exposes Inbox only. |
| Mail folders | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | Build/type checks | Yes | Well-known/custom folder sidebar and Graph folder counts. |
| Read and sanitize message | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | None | Yes | HTML sanitized and remote images blocked. |
| Message search/filter | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | Build/type checks | Yes | Server-side Graph search/filter builder and filter drawer. |
| Attachments | PARTIALLY IMPLEMENTED | `route.ts`, `mail-client.tsx` | Smoke CLI | Yes | List/download/upload and image/PDF preview; inline CID resolution remains absent. |
| Compose/send | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | Smoke CLI | Yes | To/Cc/Bcc, HTML, file attachments, send/draft/discard. |
| Reply/reply-all/forward | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | Build/type checks | Yes | All three backend-mediated Graph actions implemented. |
| Message mutations | PARTIALLY IMPLEMENTED | `route.ts`, `mail-client.tsx` | Build/type checks | Yes | Move/archive/delete/read/flag/importance; copy and categories remain. |
| Open in Outlook | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | None | Yes | Uses real Graph `webLink`; desktop handoff absent. |
| Mailbox settings | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mailbox-settings-admin.tsx` | Smoke CLI reads | Yes | Supported locale, time, replies and working-hours editor. |
| User Inbox rules | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-rules-admin.tsx` | Smoke CLI lists | Yes | Supported CRUD, enable/disable and priority UI. |
| Shared mailboxes | NOT IMPLEMENTED | Prisma reserved models | None | Yes | No discovery, permission probing, or shared Graph routes. |
| Organization directory | REQUIRES LIVE MICROSOFT TEST | `organization-users.tsx`, `organizationUsers()` | Build/type checks | Yes | Capability-driven User.ReadBasic.All/User.Read.All path. |
| Exchange administration | REQUIRES CUSTOMER CONFIGURATION | `exchange.ts`, `exchange-admin.tsx` | Type checks | Yes | Official certificate-based Exchange Online PowerShell with explicit confirmation/audit. |
| Audit collection | PARTIALLY IMPLEMENTED | `src/lib/audit.ts`, `route.ts` | None | No | Key operations logged; attachment/download and many future operations absent. |
| Audit viewer | IMPLEMENTED | `audit-viewer.tsx`, `GET /audit` | Build/type checks | No | Filters, pagination and safe detail drawer. |
| System health | PARTIALLY IMPLEMENTED | `GET /system/status` | None | Partly | Basic API only; no UI and no Cloudflare/worker/companion checks. |
| Security settings | IMPLEMENTED | `security-settings.tsx`, `GET /security` | Build/type checks | No | Sessions, RBAC matrix, policies and secret-presence state. |
| First-run setup wizard | NOT IMPLEMENTED | Environment docs only | None | Partly | Secrets remain environment-managed; no guided checks. |
| Microsoft diagnostics page | REQUIRES LIVE MICROSOFT TEST | `microsoft-diagnostics.tsx`, `/diagnostics/:id` | Build/type checks | Yes | PASS/FAIL/REQUIRES_PERMISSION plus explicit send test. |
| HTML project builder | IMPLEMENTED | `html-editor.tsx`, HTML project APIs | Build/type checks | No | WYSIWYG/raw HTML/CSS, sandbox preview, versions, duplicate/export/publish state. |
| Starter templates | IMPLEMENTED | `html-templates.ts` | Build/type checks | No | Seven editable safe templates. |
| Cloudflare deployment manager | REQUIRES CLOUDFLARE CONFIGURATION | `cloudflare.ts`, UI, Worker | Type/build checks | Cloudflare | Central KV and one wildcard Worker; no per-page Worker. |
| Random subdomains/private deployments | REQUIRES CLOUDFLARE CONFIGURATION | Cloudflare APIs/Worker | Unit helper coverage pending | Cloudflare | Collision check, public/protected/disabled/expired lifecycle and one-time code. |
| Desktop companion | PARTIALLY IMPLEMENTED | `apps/desktop-companion`, launch API | Desktop typecheck | Windows | NSIS target, protocol, one-time exchange and browser profiles; Windows installer not built on Linux. |
| Adobe/DocuSign/SharePoint modules | NOT IMPLEMENTED | Prisma `Integration` only | None | Provider config | Feature-flag architecture only. |
| Responsive enterprise shell/design system | PARTIALLY IMPLEMENTED | `globals.css`, page components | Build only | No | Responsive basics exist; no full nav, themes, modal/drawer/toast/skeleton system. |
| Setup/deployment/security documentation | IMPLEMENTED | Root documentation files | Manual review | Provider config | Accurate about deferred modules and Microsoft-controlled SSO. |
| Unit/API/E2E tests | PARTIALLY IMPLEMENTED | `crypto.test.ts`, smoke CLI | 3 unit tests | Partly | No route, RBAC, Graph adapter, UI or browser tests. |
| Production build and migration | IMPLEMENTED | package scripts, Prisma migration | Build/validate | No | PostgreSQL runtime migration has not run in this VM because Docker/Postgres is unavailable. |

## Category summary

- **IMPLEMENTED:** real MSAL/Graph service path, encrypted cache, secure app sessions,
  core Inbox/message/attachment/send/reply APIs, audit writes, Prisma schema/migration,
  and provider/setup documentation.
- **PARTIALLY IMPLEMENTED:** shared mailbox discovery, role assignment workflows,
  inline-image resolution, copy/categories, setup wizard and Windows packaging validation.
- **MOCKED:** none. Production paths contain no fake Microsoft or mailbox responses.
- **NOT IMPLEMENTED:** shared-mailbox discovery, durable multi-node device polling,
  complete first-run secret provisioning, and Adobe/DocuSign/SharePoint connectors.
- **REQUIRES LIVE MICROSOFT TEST:** every MSAL and Graph operation, including the
  encrypted-cache round trip, consent behavior, mailbox/rules/settings and Outlook link.
- **REQUIRES CLOUDFLARE CONFIGURATION:** deployment API validation, wildcard DNS,
  Worker router, central artifact storage and live deployment lifecycle.

## Immediate implementation order

1. Enterprise shell and reusable interaction primitives.
2. Dedicated Microsoft accounts and employee profile experience.
3. Folder-aware searchable webmail and message actions.
4. Mailbox settings and Inbox rules editors.
5. Live Microsoft diagnostics UI.
6. Access-code, audit and security administration.
7. HTML project editor and versioned templates.
8. Cloudflare deployment manager and single wildcard Worker.
9. Windows Outlook launcher.
10. Official Exchange Online administration adapter.
