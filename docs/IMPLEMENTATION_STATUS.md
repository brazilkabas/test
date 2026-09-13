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
| Visual page builder | PARTIALLY IMPLEMENTED | `html-editor.tsx`, `page-document.ts`, visual project APIs | Unit/build/type checks | Browser/Cloudflare | Structured three-pane editor, inline text, typed properties, drag/reorder, assets, responsive preview, automatic save, history and publish dialog. Remaining items are detailed below. |
| Visual template gallery | IMPLEMENTED | `visual-templates.ts`, `html-projects.tsx` | Renderer unit tests | No | 16 safe templates across all requested gallery categories and at least 10 distinct structures. |
| Cloudflare deployment manager | REQUIRES CLOUDFLARE CONFIGURATION | `cloudflare.ts`, `cloudflare-configuration.tsx`, Worker | Unit/build/type checks | Cloudflare | In-app encrypted Token/Global Key setup and discovery; central KV and one wildcard Worker; no per-page Worker. |
| Random subdomains/private deployments | PARTIALLY IMPLEMENTED | Cloudflare APIs/Worker | Crypto and Worker tests | Cloudflare | Collision-checked random/custom hostname, public/access-code/disabled/expired lifecycle. A true authenticated private-origin policy is not yet implemented. |
| Headless Windows launcher | REQUIRES WINDOWS LIVE TEST | `apps/desktop-companion`, launch API, `mail-client.tsx` | 9 native unit tests, PE build, web build | Windows + Microsoft | 5.4 MB native GUI-subsystem executable; no normal UI. Per-user protocol install/uninstall, 60-second single-use message-bound launch IDs, Chrome/Edge detection, fresh temporary profiles, cleanup and redacted logs are implemented. |
| Adobe/DocuSign/SharePoint modules | NOT IMPLEMENTED | Prisma `Integration` only | None | Provider config | Feature-flag architecture only. |
| Responsive enterprise shell/design system | PARTIALLY IMPLEMENTED | `globals.css`, page components | Build only | No | Responsive basics exist; no full nav, themes, modal/drawer/toast/skeleton system. |
| Setup/deployment/security documentation | IMPLEMENTED | Root documentation files | Manual review | Provider config | Accurate about deferred modules and Microsoft-controlled SSO. |
| Unit/API/E2E tests | PARTIALLY IMPLEMENTED | `crypto.test.ts`, `page-document.test.ts`, Worker tests, smoke CLI | 10 automated tests | Partly | Renderer/device-code/template invariants covered; no route, RBAC, Graph adapter or browser E2E tests. |
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

## Remaining implementation order

1. Validate all Graph operations against the customer tenant and fix permission-specific behavior.
2. Add durable multi-instance device-code job coordination.
3. Add shared-mailbox probing and mailbox-address-aware webmail.
4. Add complete first-run secret-manager provisioning.
5. Add provider-configured Adobe Sign, DocuSign and SharePoint connectors.
6. Execute migrations against PostgreSQL and add route/browser integration tests.
7. Code-sign and execute the launcher acceptance flow on Windows.
8. Deploy and validate the wildcard Worker/KV path against the customer Cloudflare account.

## Verification results

| Check | Result | Notes |
|---|---|---|
| ESLint | PASS | Entire repository; generated desktop artifacts excluded. |
| TypeScript | PASS | Web/backend. The launcher is native Go and passes `go test`. |
| Unit/integration tests | PASS | 19 tests across crypto, visual rendering/device-code invariants, templates, Worker routing/policies and native launcher behavior. |
| Prisma schema | PASS | Client generation and schema validation on Prisma 6.12.0. |
| Production web build | PASS | Next.js optimized build. |
| Production dependency audit | PASS | `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities. |
| Windows launcher packaging | PASS | Cross-compiled `CompanyMailLauncher.exe` as a 5.4 MB PE32+ GUI x86-64 executable; SHA-256 recorded in the build output. |
| Windows launcher runtime | REQUIRES WINDOWS LIVE TEST | Protocol permission prompt, registry behavior, Chrome/Edge startup, Windows SSO and exact post-authentication message navigation require Windows with a live Graph message. The development binary is not code-signed. |
| PostgreSQL migration execution | REQUIRES DATABASE | Migration SQL is generated; this VM has no Docker or PostgreSQL service. |
| Microsoft live test | NOT COMPLETED | A genuine code was issued, but the device code expired before customer sign-in. |
| Cloudflare live test | REQUIRES CLOUDFLARE CONFIGURATION | Account, zone, token, wildcard DNS, Worker and KV binding are required. |
| Exchange live test | REQUIRES CUSTOMER CONFIGURATION | Requires `pwsh`, ExchangeOnlineManagement, certificate auth and restricted Exchange RBAC. |

## Visual builder acceptance matrix

Status terms below are intentionally strict: **Complete** means the repository has the
production path; **Local Tested** records automated validation only and is not a live
provider claim.

| Requirement | Status | Local Tested | Live Cloudflare Tested | Requires Configuration | Notes |
|---|---|---:|---:|---:|---|
| Three-pane visual experience | Complete | Build/type | No | No | Component library, live selectable canvas and contextual properties. |
| Editable visual elements | Partial | Build/type | No | No | Text, buttons, images, logos, providers, cards, sections, columns, calls, steps, badges, navigation, headers and footers are typed. Link insertion, list formatting and hover-state editing need richer controls. |
| Protected Microsoft device code | Complete | Unit | No | Microsoft | Preview always renders `XXXX-XXXX`; renderer ignores authored content for the value; a token-protected live session injects only Microsoft's returned code. |
| Differentiated designs | Complete | Unit | No | No | Compact, split, centered, minimal, dark, document, resource, instructions, hero, mobile, enterprise and status structures are distinct. |
| Template gallery | Complete | Unit/build | No | No | Category filters, rendered thumbnails, descriptions, layout labels, preview and use actions. |
| Provider content blocks | Complete | Unit | No | Provider destinations | Microsoft 365, SharePoint, OneDrive, Adobe, DocuSign, document, cloud and company blocks. These are outbound resource actions, never credential forms. |
| Automatic provider logos/icons | Partial | Unit | No | Brand assets | Automatic provider marks appear in gallery, canvas and output. Licensed vendor-supplied artwork has not been bundled; administrators may replace a mark with an approved uploaded asset. |
| Logo and asset management | Complete | Build/type | No | No | PNG/JPEG/WEBP/sanitized SVG/PDF/CSS, light/dark/default variants, deduplication, sizing, alignment through style controls, replace/remove. Stored in PostgreSQL and embedded into immutable published versions. R2 is not yet used. |
| Inline text editing | Partial | Build/type | No | No | Direct editing, content panel, bold/italic/underline, font, size, weight, alignment, line height, spacing and color. Rich link insertion and nested list toolbar remain. |
| Visual button editing | Partial | Build/type | No | No | Label, destination/action, size/styles, icon and new-tab behavior. A separate hover-style control is not exposed yet. |
| Drag, reorder and controls | Complete | Build/type | No | No | Palette drag/add, canvas drag/reorder, move, duplicate, delete, hide and lock. |
| Section controls | Partial | Build/type | No | No | Background/image, minimum height, padding, margin, widths, visibility, alignment and 50/50, 40/60, 60/40 plus grid presets. Dedicated full-width/contained toggles remain expressible through width fields rather than one-click controls. |
| Contextual properties | Complete | Build/type | No | No | Text, button, image/logo, provider, steps, columns and common appearance controls are type-specific. |
| Page settings | Partial | Build/type | No | No | Name/title, SEO, description, background/image, font, text color, width, visibility and expiration. Favicon and default button/custom-footer presets remain. |
| Responsive/full preview | Partial | Build/type | No | No | Desktop/laptop/tablet/mobile widths and distraction-free preview. Separate published-page preview is available from project/deployment links, not an editor toolbar button. |
| Version history | Partial | Build/type | No | No | Automatic/manual versions, editor, timestamp, draft/published state, preview and non-destructive restore. Version compare is not implemented. |
| In-app Cloudflare configuration | Complete | Build/type | No | Cloudflare | API Token and Global API Key + Email modes. |
| Cloudflare discovery UX | Complete | Build/type | No | Cloudflare | Test credentials, discover accounts/zones, select and save base domain. |
| Cloudflare credential isolation | Complete | Build/type | No | Encryption key | AES-GCM at rest, masked response, no localStorage/generated-page exposure, replace/rotate and audit event. |
| Publish dialog | Partial | Build/type | No | Cloudflare | Public/access-code policy, expiration, random/custom hostname and generated URL. True authenticated-private policy is pending. |
| Random/custom subdomains | Complete | Crypto/type | No | Cloudflare | Server-generated cryptographic labels and database collision checks; custom names are base-domain constrained. |
| Wildcard Worker architecture | Complete | Worker tests | No | Cloudflare | One router and central KV payload lookup. |
| Project dashboard | Partial | Build/type | No | No | Thumbnail, template, draft/published, URL, creator/update data, edit/duplicate. Republish/disable/archive/delete remain on editor/deployment screens rather than every card. |
| Published deployments | Complete | Worker/build | No | Cloudflare | URL/project/status/visibility/time/actions with active, disabled, expired and failed states. |
| Project assets | Partial | Build/type | No | Optional R2 | Safe database storage supports requested file classes; no R2 upload adapter or project-file download component yet. |
| Microsoft connection specialization | Partial | Unit/build | No | Microsoft | Logo/headline/instructions/code/copy/open/status are visual. Live success/failure/restart safety bar is functional but its variants are not all independently styleable. |
| Reusable status components | Complete | Build/type | No | No | Waiting, connected, expired, failed, success and processing kinds with editable content and appearance. |
| No-code workflow | Complete | Build/type | No | No | Template → select/edit → asset/logo → button → reorder → background → preview → publish. |
| Advanced code | Partial | Build/type | No | No | Separated warning UI; custom HTML/CSS is output. JavaScript is stored but intentionally not executed by the default preview/Worker. |
| End-to-end acceptance | Requires Configuration | Automated portions | No | Microsoft + Cloudflare + PostgreSQL | Local renderer and build pass. Live publish/republish and real Microsoft-issued code display cannot be claimed until provider credentials, wildcard Worker/KV, database migration and interactive authorization are exercised. |
