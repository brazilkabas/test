ALTER TABLE "MicrosoftConnection"
ADD COLUMN "microsoftHomeAccountId" TEXT,
ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3);

CREATE INDEX "MicrosoftConnection_microsoftHomeAccountId_idx"
ON "MicrosoftConnection"("microsoftHomeAccountId");
