ALTER TABLE "MicrosoftAuthorizationSession"
ADD COLUMN "authorizationProfile" TEXT NOT NULL DEFAULT 'PRIMARY';

CREATE TABLE "MicrosoftGraphMailAuth" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "microsoftUserId" TEXT NOT NULL,
    "microsoftHomeAccountId" TEXT,
    "clientId" TEXT NOT NULL,
    "resourceAppId" TEXT NOT NULL DEFAULT '00000003-0000-0000-c000-000000000000',
    "grantedScopes" TEXT[],
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "authorizationStatus" "AuthorizationStatus" NOT NULL DEFAULT 'CONNECTED',
    "encryptedTokenCache" BYTEA NOT NULL,
    "tokenCacheKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "lastSuccessfulGraphAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrosoftGraphMailAuth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MicrosoftGraphMailAuth_connectionId_key"
ON "MicrosoftGraphMailAuth"("connectionId");

CREATE INDEX "MicrosoftGraphMailAuth_tenantId_microsoftUserId_idx"
ON "MicrosoftGraphMailAuth"("tenantId", "microsoftUserId");

CREATE INDEX "MicrosoftGraphMailAuth_authorizationStatus_idx"
ON "MicrosoftGraphMailAuth"("authorizationStatus");

ALTER TABLE "MicrosoftGraphMailAuth"
ADD CONSTRAINT "MicrosoftGraphMailAuth_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "MicrosoftConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
