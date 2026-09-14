# Security

## Implemented controls

- Microsoft authentication uses MSAL Node device authorization and official Microsoft URLs.
- MSAL caches are encrypted with AES-256-GCM, context-bound to tenant and object ID.
- App sessions use random bearer values stored only as HttpOnly, Secure-in-production,
  SameSite=Strict cookies; only hashes are persisted.
- Mutations require a same-origin check and a signed double-submit CSRF token.
- Every API operation performs server-side RBAC checks.
- Access codes use cryptographic randomness, salted scrypt hashes, expiration/use limits,
  attempt throttling, and audit events. Plaintext is returned only at creation.
- Inputs are validated with Zod. Prisma parameterizes database access.
- Graph pagination accepts only HTTPS links on `graph.microsoft.com`.
- Graph throttling honors `Retry-After`; permanent authorization failures are not retried.
- Email HTML is sanitized. Scripts, event handlers, embeds, and unsafe schemes are removed.
- Attachments have a 25 MB limit, safe content disposition, and conservative MIME handling.
- Audit metadata excludes tokens, message bodies, credentials, and cookies.

Generate secrets with:

```bash
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -base64 48 # SESSION_SECRET
```

Rotate encryption keys with a controlled decrypt/re-encrypt migration before replacing
the active key. Back up the database first and retain the old key until verification.

## Deployment requirements

Use HTTPS outside localhost, a managed secrets store, restricted database networking,
database backups, central log shipping, and provider-side credential rotation. Set a
strict reverse-proxy request-size limit. Restrict the application to company networks
or an identity-aware proxy when practical.

This project must never add credential forms that imitate Microsoft or another
provider, cookie extraction, session injection, raw token APIs, MFA bypasses, or
token-to-cookie conversion.
