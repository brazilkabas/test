# Architecture

## Milestone-one boundary

Company Control is a TypeScript application with a Next.js UI and server-only API,
PostgreSQL through Prisma, MSAL Node, and Microsoft Graph. Browser code calls only the
versioned `/api/v1` API. It never receives Microsoft tokens, the serialized MSAL cache,
database credentials, encryption keys, or provider secrets.

The initial vertical slice contains:

- internal access-code sessions and RBAC enforcement;
- administrator-created Microsoft authorization-code + PKCE sessions;
- encrypted, per-account MSAL cache persistence;
- immutable Microsoft tenant and object IDs as account identity;
- Inbox pagination, safe message rendering, attachment download, send and reply;
- mailbox settings and user Inbox rules;
- dashboard, connection health, audit events, and diagnostics;
- an interactive tenant smoke-test CLI.

## Trust boundaries

1. Browser: untrusted presentation layer; receives safe DTOs and an HttpOnly app session.
2. Next.js server: authorization, validation, MSAL, Graph mediation, and auditing.
3. PostgreSQL: application records and AES-256-GCM encrypted MSAL caches.
4. Microsoft: official Entra authorization endpoint and Graph API.

The browser is redirected to Microsoft's authorization endpoint. The backend validates
the OAuth state, decrypts the one-time PKCE verifier, exchanges the returned code with
MSAL Node, and stores the actual tenant ID from Microsoft's result. Tokens and the
serialized cache never enter frontend pages. On Graph access, a connection-specific
cache plugin decrypts the cache, performs silent token
acquisition, and persists cache changes encrypted. Interaction-required errors change
the connection state instead of attempting an authentication bypass.

Device code remains an explicit fallback for headless or restricted-browser use. WAM,
Microsoft's authentication broker, Windows HWND integration, and a Windows auth helper
are not part of either flow. The separate Windows Outlook launcher only opens a
message deep link and never participates in Microsoft authentication.

## Module path

Later modules should be added behind the same API, RBAC, validation, encryption, and
audit layers. The Prisma schema reserves core entities for shared mailboxes, HTML
projects, Cloudflare deployments, desktop companions, integrations, settings, and
secret references. Their APIs and UI are intentionally absent until milestone one is
validated against a real tenant.

Exchange administrative permissions are separate from delegated Graph mail access.
Future Exchange administration must use official Exchange Online tooling and RBAC;
there is no fabricated Graph endpoint.
