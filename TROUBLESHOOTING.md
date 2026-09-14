# Troubleshooting

## Microsoft device code does not appear

If `MICROSOFT_CLIENT_ID` is blank, the API returns
`MICROSOFT_CLIENT_ID is not configured.` Add your Entra Application (client) ID and
restart the server. Confirm public client flows are enabled, outbound access to
`login.microsoftonline.com` is available, and the registration supports multiple
organizations. The authority is fixed to
`https://login.microsoftonline.com/organizations`.

Product sign-in uses Microsoft device authorization. WAM, an authentication broker,
and a Windows helper are neither used nor required.

`MICROSOFT_CLIENT_ID` must be your own Entra Application (client) ID.
`MICROSOFT_RESOURCE_APP_ID` and `MICROSOFT_RESOURCE_SCOPE` separately identify the
target API and delegated permission. For Graph-backed webmail, use resource ID
`00000003-0000-0000-c000-000000000000` with explicit `User.Read,Mail.Read` scopes.
If Microsoft returns `AADSTS65002`, development logs show the effective client,
resource, authority, scopes, and exact Microsoft error without logging credentials.

## Consent or permission errors

Compare `MICROSOFT_RESOURCE_SCOPE` with delegated permissions in the app registration. Tenant
policy may require administrator consent. Do not add broad permissions merely to make
an error disappear.

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
