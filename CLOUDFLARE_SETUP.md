# Cloudflare setup

Cloudflare publishing is implemented but remains inactive until customer credentials,
wildcard DNS, and the Worker binding are configured.

The planned design uses one Worker on a wildcard hostname. The Worker resolves the
hostname to a deployment record and serves a versioned HTML artifact from KV or R2.
It does not provision one Worker per page by default.

Future server configuration:

```text
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_BASE_DOMAIN=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_KV_NAMESPACE_ID=
```

Create a dedicated API token with only the target account and zone. Expected minimum
permissions are Workers Scripts:Edit, Workers KV Storage:Edit (or R2 edit if selected),
and DNS:Edit for the target zone. Omit DNS edit if a wildcard record is provisioned
separately. Re-check Cloudflare's current permission names before enabling the module.

The token is server-only and must be stored in an environment secret manager or an
encrypted server-side secret reference. It must never enter browser configuration,
HTML project output, deployment URLs, logs, or frontend API responses.

Deploy `apps/cloudflare-worker` once and bind its `DEPLOYMENTS` KV namespace. Configure
one wildcard route for `*.CLOUDFLARE_BASE_DOMAIN`. The application stores each
hostname's current HTML/CSS and policy in that namespace; it does not create a Worker
per page. Protected deployments generate a new 15-character code shown once. The
Worker stores only its SHA-256 digest and does not receive Microsoft credentials.
