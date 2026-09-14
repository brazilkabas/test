# Microsoft Entra setup

Create or use a multitenant Microsoft Entra app registration. Set:

```text
MICROSOFT_CLIENT_ID=<application/client ID>
MICROSOFT_AUTHORITY=https://login.microsoftonline.com/organizations
MICROSOFT_REDIRECT_URI=https://your-app.example/api/v1/microsoft/callback
```

Do not configure a home-tenant GUID as the authority. After authentication,
the tenant ID returned by Microsoft is still stored with the connection so accounts
from different organizations remain correctly isolated.

Under **Authentication**, add `MICROSOFT_REDIRECT_URI` under **Mobile and desktop
applications** and enable **Allow public client flows**. The URI must match exactly.
Normal sign-in uses authorization code with PKCE and does not use a client secret,
WAM, an authentication broker, an HWND, or a Windows helper. For local development,
register `http://localhost:3000/api/v1/microsoft/callback`.

## Delegated Graph permissions

Initial sign-in passes only these scopes to MSAL:

- `openid`, `profile`, `email` — basic sign-in identity;
- `User.Read` — signed-in profile;

`Mail.ReadWrite` and `Mail.Send` are requested only when the user enables webmail.
`MailboxSettings.ReadWrite` is requested separately only when a user enables mailbox
settings or Inbox-rule editing.
Shared permissions (`Mail.ReadWrite.Shared`, `Mail.Send.Shared`) are not requested
because shared-mailbox workflows are not enabled.
Directory permissions such as
`User.ReadBasic.All` or `User.Read.All` are not needed for milestone one and may
require administrator consent under tenant policy. Microsoft can also require admin
consent for otherwise delegated permissions depending on tenant configuration.

Each flow uses a fixed purpose-specific allowlist; it never expands the request
from all permissions configured in Entra and never requests Microsoft Graph `.default`.
MSAL can add standard OIDC protocol scopes automatically. The application does not
force a consent prompt, so existing tenant-wide consent is reused by Microsoft Entra.

Confirm current permission semantics in the official Microsoft Graph documentation
before expanding scopes. An internal application role never grants Microsoft access.

Verified implementation references:

- [MSAL Node authorization-code flow](https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests#authorization-code-flow)
- [List messages](https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages?view=graph-rest-1.0)
- [Mailbox settings](https://learn.microsoft.com/en-us/graph/api/user-get-mailboxsettings?view=graph-rest-1.0)
- [List Inbox rules](https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messagerules?view=graph-rest-1.0)
- [Create Inbox rule](https://learn.microsoft.com/en-us/graph/api/mailfolder-post-messagerules?view=graph-rest-1.0)

## Live smoke test

```bash
npm run microsoft:smoke
npm run microsoft:smoke -- --recipient=approved-test@example.com --confirm-send
```

The second command is required for the send step; it prevents accidental mail. This
CLI smoke test intentionally uses the optional device-code fallback. It prints the
genuine Microsoft device code and does not print access or refresh
tokens. A missing test message or attachment produces a clear FAIL for that data-
dependent step without inventing test mailbox content.
