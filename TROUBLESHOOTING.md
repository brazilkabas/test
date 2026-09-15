# Troubleshooting

## Device code does not appear

Confirm the client ID, public-client flow enablement, outbound access to
`login.microsoftonline.com`, `MICROSOFT_RESOURCE_APP_ID`,
`MICROSOFT_RESOURCE_SCOPE`, and that the app registration supports multiple
organizations. Device-code authentication uses `MICROSOFT_AUTHORITY`.
Pending authorization is process-local until Microsoft
completes it; restarting the server requires a new device code.

## Consent or permission errors

Compare `MICROSOFT_RESOURCE_SCOPE` with the delegated permissions exposed by
`MICROSOFT_RESOURCE_APP_ID`. The scope must target that resource. Tenant policy may
require administrator consent. Do not add broad permissions merely to make an error
disappear.

## Reauthentication required

MSAL could not silently acquire an approved token, commonly after revocation,
Conditional Access changes, consent changes, or `invalid_grant`. Start a new official
device authorization. The application does not bypass interaction requirements.

## Mailbox or shared mailbox denied

An Entra/admin role does not imply mailbox rights. The connected identity needs the
relevant delegated Graph scope and Exchange mailbox permission. Shared mailbox support
is not enabled in milestone one.

## Graph throttling

The backend honors `Retry-After` on 429 and retries temporary 5xx failures with bounded
backoff. Reduce request frequency if throttling persists.

## Database or encryption errors

Verify `DATABASE_URL`, run `npm run db:generate` and `npm run db:migrate`, and ensure
`ENCRYPTION_KEY` is exactly 64 hexadecimal characters. An encrypted cache cannot be
recovered after losing or replacing its key; reconnect the Microsoft account if the
original key is unavailable.
