# Microsoft Entra setup

Configure the public client used for Microsoft Graph authorization:

```text
MICROSOFT_CLIENT_ID=<application/client ID>
MICROSOFT_AUTHORITY=https://login.microsoftonline.com/organizations
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/v1/microsoft/callback
```

Do not configure a home-tenant GUID as the global authority. After authentication,
the tenant ID returned by Microsoft is still stored with the connection so accounts
from different organizations remain correctly isolated.

Under **Authentication**, enable **Allow public client flows**. Device authorization
does not use a client secret or redirect URI; the redirect URI is retained for the
configured browser callback. Do not add a client secret to this
application unless a later confidential-client flow explicitly requires one.

The initial connection requests delegated Microsoft Graph `User.Read` plus
`offline_access`. It does not request mailbox permission. The returned access token must
target Microsoft Graph, and its tenant and object claims must match the signed MSAL
identity. Blank client IDs are accepted during application setup, but connection attempts
return `MICROSOFT_NOT_CONFIGURED` until `MICROSOFT_CLIENT_ID` is populated.

## Graph permissions

Mailbox access is not part of initial sign-in. The optional mailbox authorization flow
requests delegated `Mail.Read` and verifies the Graph token, folders, and Inbox before
marking the mailbox available. `Mail.ReadWrite` and `Mail.Send` are not requested by the
read-only mailbox flow.
`MailboxSettings.ReadWrite` is requested separately only when a user opens and enables
mailbox-settings or Inbox-rule editing.
Shared permissions (`Mail.ReadWrite.Shared`, `Mail.Send.Shared`) are not requested
because shared-mailbox workflows are not enabled.
Directory permissions such as
`User.ReadBasic.All` or `User.Read.All` are not needed for milestone one and may
require administrator consent under tenant policy. Microsoft can also require admin
consent for otherwise delegated permissions depending on tenant configuration.

Each device flow uses a fixed purpose-specific scope; it never expands the request
from all permissions configured in Entra. Graph authorization does not use `.default`.
MSAL can add standard OIDC protocol scopes automatically. The application does not
force a consent prompt, so existing tenant-wide consent is reused by Microsoft Entra.

Confirm current permission semantics in the official Microsoft Graph documentation
before expanding scopes. An internal application role never grants Microsoft access.

Verified implementation references:

- [MSAL Node device-code flow](https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests#device-code-flow)
- [List messages](https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages?view=graph-rest-1.0)
- [Mailbox settings](https://learn.microsoft.com/en-us/graph/api/user-get-mailboxsettings?view=graph-rest-1.0)
- [List Inbox rules](https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messagerules?view=graph-rest-1.0)
- [Create Inbox rule](https://learn.microsoft.com/en-us/graph/api/mailfolder-post-messagerules?view=graph-rest-1.0)

## Live smoke test

```bash
npm run microsoft:smoke
npm run microsoft:smoke -- --recipient=approved-test@example.com --confirm-send
```

The second command is required for the send step; it prevents accidental mail. The
script prints the genuine Microsoft device code and does not print access or refresh
tokens. A missing test message or attachment produces a clear FAIL for that data-
dependent step without inventing test mailbox content.
