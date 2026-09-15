-- Bind opaque application sessions to the Microsoft connection selected at sign-in.
ALTER TABLE "Session"
ADD COLUMN "microsoftConnectionId" TEXT,
ADD COLUMN "microsoftTenantId" TEXT,
ADD COLUMN "microsoftUserId" TEXT;

CREATE INDEX "Session_microsoftConnectionId_expiresAt_idx"
ON "Session"("microsoftConnectionId", "expiresAt");

ALTER TABLE "Session"
ADD CONSTRAINT "Session_microsoftConnectionId_fkey"
FOREIGN KEY ("microsoftConnectionId")
REFERENCES "MicrosoftConnection"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
