import { PublicClientApplication } from "@azure/msal-node";

import { MICROSOFT_ORGANIZATIONS_AUTHORITY } from "../src/lib/microsoft-authority";

const clientId = process.env.MICROSOFT_CLIENT_ID;
const scopes = (process.env.MICROSOFT_SCOPES ?? "User.Read,Mail.ReadWrite,Mail.Send,MailboxSettings.ReadWrite")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const recipient = process.argv.find((value) => value.startsWith("--recipient="))?.split("=")[1];
const allowSend = process.argv.includes("--confirm-send");

if (!clientId) {
  console.error("FAIL configuration: MICROSOFT_CLIENT_ID is required");
  process.exit(1);
}

const pca = new PublicClientApplication({
  auth: { clientId, authority: MICROSOFT_ORGANIZATIONS_AUTHORITY },
  system: { loggerOptions: { piiLoggingEnabled: false } },
});

async function graph<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

function pass(step: number, label: string, details = "") {
  console.log(`PASS ${step}. ${label}${details ? `: ${details}` : ""}`);
}

function fail(step: number, label: string, error: unknown) {
  console.error(`FAIL ${step}. ${label}: ${error instanceof Error ? error.message : String(error)}`);
}

async function run() {
  let token = "";
  let authenticatedTenantId = "";
  try {
    const result = await pca.acquireTokenByDeviceCode({
      scopes,
      deviceCodeCallback: (response) => {
        pass(1, "Initiate device authorization");
        pass(2, "Display Microsoft-generated code", `${response.userCode} — ${response.verificationUri}`);
      },
    });
    if (!result) throw new Error("No authentication result");
    token = result.accessToken;
    authenticatedTenantId = result.tenantId;
    pass(3, "Complete Microsoft authentication");
  } catch (error) {
    fail(1, "Device authorization", error);
    process.exitCode = 1;
    return;
  }

  try {
    const me = await graph<{ displayName: string; userPrincipalName: string; id: string }>(
      token,
      "/me?$select=displayName,userPrincipalName,id",
    );
    pass(4, "Confirm identity", `${me.displayName}; ${me.userPrincipalName}; object ${me.id}; tenant ${authenticatedTenantId}`);
  } catch (error) { fail(4, "Confirm identity", error); }

  let messages: Array<{ id: string; subject: string; hasAttachments: boolean }> = [];
  try {
    const inbox = await graph<{ value: typeof messages }>(
      token,
      "/me/mailFolders/inbox/messages?$top=10&$select=id,subject,hasAttachments",
    );
    messages = inbox.value;
    pass(5, "List Inbox messages", `${messages.length} returned`);
  } catch (error) { fail(5, "List Inbox messages", error); }

  try {
    if (!messages[0]) throw new Error("Inbox has no message to open");
    const message = await graph<{ subject: string }>(token, `/me/messages/${encodeURIComponent(messages[0].id)}`);
    pass(6, "Open one message", message.subject || "(no subject)");
  } catch (error) { fail(6, "Open one message", error); }

  try {
    const withAttachment = messages.find((message) => message.hasAttachments);
    if (!withAttachment) throw new Error("No attachment found in the first 10 messages");
    const attachments = await graph<{ value: Array<{ id: string; name: string; contentBytes?: string }> }>(
      token,
      `/me/messages/${encodeURIComponent(withAttachment.id)}/attachments`,
    );
    const attachment = attachments.value.find((item) => item.contentBytes);
    if (!attachment) throw new Error("No downloadable file attachment found");
    Buffer.from(attachment.contentBytes!, "base64");
    pass(7, "Download one attachment", attachment.name);
  } catch (error) { fail(7, "Download one attachment", error); }

  try {
    if (!allowSend || !recipient) throw new Error("Skipped safely; pass --recipient=user@example.com --confirm-send");
    await graph(token, "/me/sendMail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: "Company Control Microsoft Graph smoke test",
          body: { contentType: "Text", content: "This message verifies the approved Mail.Send integration." },
          toRecipients: [{ emailAddress: { address: recipient } }],
        },
        saveToSentItems: true,
      }),
    });
    pass(8, "Send test message", recipient);
  } catch (error) { fail(8, "Send test message", error); }

  try {
    await graph(token, "/me/mailboxSettings");
    pass(9, "Load mailbox settings");
  } catch (error) { fail(9, "Load mailbox settings", error); }

  try {
    const rules = await graph<{ value: unknown[] }>(token, "/me/mailFolders/inbox/messageRules");
    pass(10, "List Inbox rules", `${rules.value.length} returned`);
  } catch (error) { fail(10, "List Inbox rules", error); }
}

void run();
