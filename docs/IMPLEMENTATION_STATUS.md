# Implementation status

Audit date: 2026-09-13. This document compares the repository to the master product
specification. “Implemented” means a real production code path exists; it does not
mean the feature has been validated against a customer tenant or provider account.

| Feature | Status | Files | Test Coverage | Live Test Required | Notes |
|---|---|---|---|---|---|
| Internal access-code login | IMPLEMENTED | `src/lib/auth.ts`, `src/app/api/v1/[...path]/route.ts`, `src/app/login/page.tsx` | Crypto unit tests only | No | HttpOnly session, CSRF, expiry/use limits and role override exist. |
| Access-code administration | PARTIALLY IMPLEMENTED | `route.ts`, Prisma `AccessCode` | None | No | Create API exists; list/revoke/history UI and APIs absent. |
| RBAC enforcement | PARTIALLY IMPLEMENTED | `src/lib/auth.ts`, Prisma roles | None | No | APIs enforce a hard-coded matrix; role/user administration UI absent. |
| Session administration/logout | NOT IMPLEMENTED | Prisma `Session` | None | No | No active-session UI, revoke, or logout endpoint. |
| Microsoft device authorization | REQUIRES LIVE MICROSOFT TEST | `src/lib/microsoft.ts`, `/connect/[sessionId]` | Smoke CLI only | Yes | Real MSAL flow; in-flight polling is process-local. |
| Device status privacy | PARTIALLY IMPLEMENTED | `route.ts` | None | No | Unguessable UUID, but status/code endpoint is unauthenticated. |
| Encrypted MSAL token cache | REQUIRES LIVE MICROSOFT TEST | `src/lib/crypto.ts`, `src/lib/microsoft.ts` | AES-GCM unit test | Yes | Real encrypted cache plugin and silent acquisition. |
| Microsoft connection ownership | NOT IMPLEMENTED | Prisma `MicrosoftConnection.ownerId` | None | No | Field exists but is not assigned. |
| Reconnect/disconnect | NOT IMPLEMENTED | — | None | Yes | No UI/API; revoked consent remains Microsoft-controlled. |
| Admin dashboard | PARTIALLY IMPLEMENTED | `/admin`, `admin-dashboard.tsx` | None | Partly | Basic counts/accounts/audit only; requested operational cards and health are absent. |
| Microsoft accounts page | NOT IMPLEMENTED | — | None | Partly | Account data API exists; no dedicated searchable management page. |
| Employee profile | NOT IMPLEMENTED | — | None | Yes | No profile route or tabbed account details. |
| Inbox listing/pagination | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | Smoke CLI | Yes | Real Graph and `@odata.nextLink`; UI exposes Inbox only. |
| Mail folders | PARTIALLY IMPLEMENTED | `route.ts` | None | Yes | API accepts folder ID; no folders endpoint/sidebar/custom folders. |
| Read and sanitize message | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | None | Yes | HTML sanitized and remote images blocked. |
| Message search/filter | NOT IMPLEMENTED | — | None | Yes | No Graph search/filter builder or UI. |
| Attachments | PARTIALLY IMPLEMENTED | `route.ts`, `mail-client.tsx` | Smoke CLI | Yes | List/download exists; no image/PDF viewer, upload, or inline-image resolver. |
| Compose/send | PARTIALLY IMPLEMENTED | `route.ts`, `mail-client.tsx` | Smoke CLI | Yes | Basic text send; no Bcc, attachment upload, draft, or rich editor. |
| Reply/reply-all/forward | PARTIALLY IMPLEMENTED | `route.ts`, `mail-client.tsx` | Smoke CLI covers send only | Yes | Reply exists; reply-all and forward absent. |
| Message mutations | NOT IMPLEMENTED | — | None | Yes | Move, copy, archive, delete, read/unread, flag and categories absent. |
| Open in Outlook | REQUIRES LIVE MICROSOFT TEST | `route.ts`, `mail-client.tsx` | None | Yes | Uses real Graph `webLink`; desktop handoff absent. |
| Mailbox settings | PARTIALLY IMPLEMENTED | `route.ts`, `mail-client.tsx` | Smoke CLI reads | Yes | GET/PATCH API; UI renders raw JSON and cannot edit. |
| User Inbox rules | PARTIALLY IMPLEMENTED | `route.ts`, `mail-client.tsx` | Smoke CLI lists | Yes | CRUD API; UI lists only. |
| Shared mailboxes | NOT IMPLEMENTED | Prisma reserved models | None | Yes | No discovery, permission probing, or shared Graph routes. |
| Organization directory | NOT IMPLEMENTED | — | None | Yes | Requires configured directory scope and capability handling. |
| Exchange administration | NOT IMPLEMENTED | Architecture docs only | None | Yes | Must use official Exchange Online PowerShell/RBAC, not fabricated Graph APIs. |
| Audit collection | PARTIALLY IMPLEMENTED | `src/lib/audit.ts`, `route.ts` | None | No | Key operations logged; attachment/download and many future operations absent. |
| Audit viewer | PARTIALLY IMPLEMENTED | `admin-dashboard.tsx` | None | No | Basic recent table only; filters/detail drawer absent. |
| System health | PARTIALLY IMPLEMENTED | `GET /system/status` | None | Partly | Basic API only; no UI and no Cloudflare/worker/companion checks. |
| Security settings | NOT IMPLEMENTED | — | None | No | No sessions, policies, rate-limit, encryption-status page. |
| First-run setup wizard | NOT IMPLEMENTED | Environment docs only | None | Partly | Secrets remain environment-managed; no guided checks. |
| Microsoft diagnostics page | NOT IMPLEMENTED | Smoke CLI only | CLI integration flow | Yes | No internal PASS/FAIL/REQUIRES_PERMISSION page. |
| HTML project builder | NOT IMPLEMENTED | Prisma reserved models | None | No | No routes, APIs, editor, sanitization/export, templates or version history. |
| Starter templates | NOT IMPLEMENTED | — | None | No | No template records or UI. |
| Cloudflare deployment manager | REQUIRES CLOUDFLARE CONFIGURATION | Schema/docs only | None | Cloudflare | No API/UI/Worker; token remains server-only in planned design. |
| Random subdomains/private deployments | NOT IMPLEMENTED | Prisma reserved fields | None | Cloudflare | No collision-safe generator, policies, access-code assignment or serving Worker. |
| Desktop companion | NOT IMPLEMENTED | Schema/docs only | None | No | No Windows app, protocol registration or one-time URL exchange. |
| Adobe/DocuSign/SharePoint modules | NOT IMPLEMENTED | Prisma `Integration` only | None | Provider config | Feature-flag architecture only. |
| Responsive enterprise shell/design system | PARTIALLY IMPLEMENTED | `globals.css`, page components | Build only | No | Responsive basics exist; no full nav, themes, modal/drawer/toast/skeleton system. |
| Setup/deployment/security documentation | IMPLEMENTED | Root documentation files | Manual review | Provider config | Accurate about deferred modules and Microsoft-controlled SSO. |
| Unit/API/E2E tests | PARTIALLY IMPLEMENTED | `crypto.test.ts`, smoke CLI | 3 unit tests | Partly | No route, RBAC, Graph adapter, UI or browser tests. |
| Production build and migration | IMPLEMENTED | package scripts, Prisma migration | Build/validate | No | PostgreSQL runtime migration has not run in this VM because Docker/Postgres is unavailable. |

## Category summary

- **IMPLEMENTED:** real MSAL/Graph service path, encrypted cache, secure app sessions,
  core Inbox/message/attachment/send/reply APIs, audit writes, Prisma schema/migration,
  and provider/setup documentation.
- **PARTIALLY IMPLEMENTED:** enterprise UX, dashboard, RBAC administration,
  access-code administration, folders, compose, settings, rules, audit viewer and health.
- **MOCKED:** none. Production paths contain no fake Microsoft or mailbox responses.
- **NOT IMPLEMENTED:** profile/directory/shared/Exchange workflows, full webmail actions,
  setup wizard, HTML builder, Cloudflare runtime, desktop companion and integrations.
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
