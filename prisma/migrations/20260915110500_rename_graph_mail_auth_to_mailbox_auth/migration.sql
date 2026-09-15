-- The record stores mailbox authorization state; it is not a second visible
-- Microsoft account or a separately configured sign-in flow.
UPDATE "MicrosoftAuthorizationSession"
SET
    "status" = 'CANCELLED',
    "errorCode" = 'MAILBOX_AUTHORIZATION_FLOW_REMOVED',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "authorizationProfile" = 'GRAPH_MAIL'
  AND "status" = 'PENDING';

ALTER TABLE "MicrosoftGraphMailAuth"
RENAME TO "MicrosoftMailboxAuth";

ALTER INDEX "MicrosoftGraphMailAuth_pkey"
RENAME TO "MicrosoftMailboxAuth_pkey";

ALTER INDEX "MicrosoftGraphMailAuth_connectionId_key"
RENAME TO "MicrosoftMailboxAuth_connectionId_key";

ALTER INDEX "MicrosoftGraphMailAuth_tenantId_microsoftUserId_idx"
RENAME TO "MicrosoftMailboxAuth_tenantId_microsoftUserId_idx";

ALTER INDEX "MicrosoftGraphMailAuth_authorizationStatus_idx"
RENAME TO "MicrosoftMailboxAuth_authorizationStatus_idx";
