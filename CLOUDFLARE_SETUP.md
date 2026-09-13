# Cloudflare setup

Cloudflare publishing is reserved for a later milestone and is not active in the
initial application.

The planned design uses one Worker on a wildcard hostname. The Worker resolves the
hostname to a deployment record and serves a versioned HTML artifact from KV or R2.
It does not provision one Worker per page by default.

Future server configuration:

```text
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_BASE_DOMAIN=
CLOUDFLARE_API_TOKEN=
```

Create a dedicated API token with only the target account and zone. Expected minimum
permissions are Workers Scripts:Edit, Workers KV Storage:Edit (or R2 edit if selected),
and DNS:Edit for the target zone. Omit DNS edit if a wildcard record is provisioned
separately. Re-check Cloudflare's current permission names before enabling the module.

The token is server-only and must be stored in an environment secret manager or an
encrypted server-side secret reference. It must never enter browser configuration,
HTML project output, deployment URLs, logs, or frontend API responses.
