ALTER TABLE "MicrosoftConnection"
ADD COLUMN "clientId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "resourceAppId" TEXT NOT NULL DEFAULT '00000003-0000-0000-c000-000000000000',
ADD COLUMN "resourceScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "MicrosoftAuthorizationSession"
ADD COLUMN "clientId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "resourceAppId" TEXT NOT NULL DEFAULT '00000003-0000-0000-c000-000000000000';

DROP INDEX "MicrosoftConnection_tenantId_microsoftUserId_key";
CREATE UNIQUE INDEX "MicrosoftConnection_tenantId_microsoftUserId_clientId_resourceAppId_key"
ON "MicrosoftConnection"("tenantId", "microsoftUserId", "clientId", "resourceAppId");
