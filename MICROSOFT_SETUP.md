# Microsoft Entra setup

Use the existing Entra app registration as a public client. Set:

```text
MICROSOFT_TENANT_ID=<tenant GUID, organizations, or approved tenant authority>
MICROSOFT_CLIENT_ID=<application/client ID>
```

Under **Authentication**, enable **Allow public client flows**. Device authorization
does not use a client secret or redirect URI. Do not add a client secret to this
application unless a later confidential-client flow explicitly requires one.

## Delegated Graph permissions

The initial milestone uses:

- `User.Read` — signed-in profile;
- `Mail.ReadWrite` — messages, attachments, folders, and user Inbox rules;
- `Mail.Send` — send and reply;
- `MailboxSettings.ReadWrite` — mailbox settings;
- `openid`, `profile`, `email`, `offline_access` — identity and MSAL renewal.

Shared permissions (`Mail.ReadWrite.Shared`, `Mail.Send.Shared`) should be added only
when the shared-mailbox milestone is enabled. Directory permissions such as
`User.ReadBasic.All` or `User.Read.All` are not needed for milestone one and may
require administrator consent under tenant policy. Microsoft can also require admin
consent for otherwise delegated permissions depending on tenant configuration.

Confirm current permission semantics in the official Microsoft Graph documentation
before expanding scopes. An internal application role never grants Microsoft access.

## Live smoke test

```bash
npm run microsoft:smoke
npm run microsoft:smoke -- --recipient=approved-test@example.com --confirm-send
```

The second command is required for the send step; it prevents accidental mail. The
script prints the genuine Microsoft device code and does not print access or refresh
tokens. A missing test message or attachment produces a clear FAIL for that data-
dependent step without inventing test mailbox content.
