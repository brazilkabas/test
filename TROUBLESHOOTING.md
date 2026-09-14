# Troubleshooting

## Microsoft browser sign-in does not start

If `MICROSOFT_CLIENT_ID` is blank, the API returns
`MICROSOFT_CLIENT_ID is not configured.` Add your Entra Application (client) ID and
restart the server. Confirm `MICROSOFT_REDIRECT_URI` exactly matches a Web redirect URI
in the registration, outbound access to `login.microsoftonline.com` is available, and
the registration supports multiple organizations. The authority is fixed to
`https://login.microsoftonline.com/organizations`.

Normal browser sign-in uses authorization code with PKCE. WAM, an authentication
broker, and a Windows helper are neither used nor required. Device code is available
only as an optional fallback for headless or restricted-browser environments.

## Consent or permission errors

Initial sign-in requests only `openid`, `profile`, `email`, and `User.Read`. Mail and
mailbox-settings permissions are requested when those features are enabled. Tenant
policy may require administrator consent. Do not add broad permissions merely to make
an error disappear.

## Reauthentication required

MSAL could not silently acquire an approved token, commonly after revocation,
Conditional Access changes, consent changes, or `invalid_grant`. Start a new official
browser authorization. The application does not bypass interaction requirements.

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
