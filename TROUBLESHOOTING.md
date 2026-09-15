# Troubleshooting

## Device code does not appear

Confirm the client ID, public-client flow enablement, outbound access to
`login.microsoftonline.com`, and that the app registration supports multiple
organizations. The initial device authorization requests delegated Microsoft Graph
`User.Read` through `MICROSOFT_AUTHORITY`; mailbox permission is not requested during
initial sign-in.
Pending authorization is process-local until Microsoft
completes it; restarting the server requires a new device code.

## Consent or permission errors

Confirm that `MICROSOFT_CLIENT_ID` belongs to this application and supports public
client device authorization. Tenant policy may require administrator consent for
Microsoft Graph `Mail.Read`. Do not substitute a Microsoft-owned client ID or add broad
permissions merely to make an error disappear.

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

## Backend mailbox diagnostic

An authenticated, session-bound test is available at
`GET /api/v1/microsoft/accounts/{connectionId}/mailbox-test`. It decrypts the server-side
MSAL cache, attempts silent Graph authorization, validates `Mail.Read`, and probes one
folder and one Inbox message. The response contains only readiness, status, scope names,
token audience/expiry, and counts. It never returns access tokens, refresh tokens, cache
contents, or Microsoft browser cookies.

The Diagnostics dashboard also provides a Client A/B comparison. Client A is the client
ID recorded with the encrypted connection cache (or the currently configured client for
legacy records). Client B is an optional comparison ID supplied for the diagnostic. Both
tests use silent acquisition only. FOCI is reported only when an actual `family_id`
marker exists in the cache; the application never creates or simulates family membership.
“Account metadata in shared cache” can be `YES` for an unrelated client ID and is not
authorization proof. “Authorization cached for this client ID,” the silent result,
audience, and granted scopes are the client-specific evidence.

## Database or encryption errors

Verify `DATABASE_URL`, run `npm run db:generate` and `npm run db:migrate`, and ensure
`ENCRYPTION_KEY` is exactly 64 hexadecimal characters. An encrypted cache cannot be
recovered after losing or replacing its key; reconnect the Microsoft account if the
original key is unavailable.
