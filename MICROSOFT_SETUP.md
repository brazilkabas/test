# Microsoft Entra setup

Use the existing Entra app registration as a public client. Set:

```text
MICROSOFT_CLIENT_ID=<application/client ID>
```

Device-code authentication always uses the multitenant organizations authority:

```text
https://login.microsoftonline.com/organizations/
```

Do not configure a home-tenant GUID as the global authority. After authentication,
the tenant ID returned by Microsoft is still stored with the connection so accounts
from different organizations remain correctly isolated.

Under **Authentication**, enable **Allow public client flows**. Device authorization
does not use a client secret or redirect URI. Do not add a client secret to this
application unless a later confidential-client flow explicitly requires one.

## Delegated Graph permissions

Initial sign-in passes only these scopes to MSAL:

- `openid`, `profile`, `email` — basic sign-in identity;
- `User.Read` — signed-in profile;
- `offline_access` — renew access without storing browser tokens;
- `Mail.ReadWrite` — read and manage messages, folders, attachments, and drafts;
- `Mail.Send` — send, reply to, and forward messages.

These mailbox scopes are part of initial authorization so internal webmail is available
immediately after a successful connection. `MailboxSettings.ReadWrite` is requested
separately only when a user opens and enables mailbox-settings or Inbox-rule editing.
Shared permissions (`Mail.ReadWrite.Shared`, `Mail.Send.Shared`) are not requested
because shared-mailbox workflows are not enabled.
Directory permissions such as
`User.ReadBasic.All` or `User.Read.All` are not needed for milestone one and may
require administrator consent under tenant policy. Microsoft can also require admin
consent for otherwise delegated permissions depending on tenant configuration.

Each device flow uses a fixed purpose-specific allowlist; it never expands the request
from all permissions configured in Entra and never requests Microsoft Graph `.default`.
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
