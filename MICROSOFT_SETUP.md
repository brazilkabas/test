# Microsoft Entra setup

Create or use a multitenant Microsoft Entra app registration. Set:

```text
MICROSOFT_CLIENT_ID=<application/client ID>
MICROSOFT_GRAPH_RESOURCE_ID=00000003-0000-0000-c000-000000000000
MICROSOFT_AUTHORITY=https://login.microsoftonline.com/organizations
MICROSOFT_SCOPES=openid,profile,email,offline_access,User.Read,Mail.ReadWrite,Mail.Send,MailboxSettings.ReadWrite
```

`MICROSOFT_CLIENT_ID` is your Entra app registration. The separate resource ID
identifies Microsoft Graph and must never be used as, appended to, or substituted
for the application client ID. OAuth v2 selects Graph by qualifying delegated
permissions as `https://graph.microsoft.com/<scope>`.

Do not configure a home-tenant GUID as the authority. After authentication,
the tenant ID returned by Microsoft is still stored with the connection so accounts
from different organizations remain correctly isolated.

Under **Authentication**, enable **Allow public client flows**. Product sign-in uses
Microsoft device authorization and does not use a client secret, WAM, an authentication
broker, an HWND, or a Windows helper. Microsoft returns a short `user_code` for display;
the corresponding `device_code` and all OAuth tokens remain backend-only.

## Delegated Graph permissions

`MICROSOFT_SCOPES` is configurable. Supported OIDC and Graph scopes are normalized and
allowlisted before being passed to MSAL. The recommended product configuration is:

```text
openid,profile,email,offline_access,User.Read,Mail.ReadWrite,Mail.Send,MailboxSettings.ReadWrite
```
Shared permissions (`Mail.ReadWrite.Shared`, `Mail.Send.Shared`) are not requested
because shared-mailbox workflows are not enabled.
Directory permissions such as
`User.ReadBasic.All` or `User.Read.All` are not needed for milestone one and may
require administrator consent under tenant policy. Microsoft can also require admin
consent for otherwise delegated permissions depending on tenant configuration.

The flow never requests Microsoft Graph `.default`.
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
CLI uses the same device-code flow as the product. It prints the genuine Microsoft
device user code and does not print access or refresh
tokens. A missing test message or attachment produces a clear FAIL for that data-
dependent step without inventing test mailbox content.
