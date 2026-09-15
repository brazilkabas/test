-- Persist only verified mailbox readiness metadata; Microsoft tokens remain in
-- the encrypted MSAL cache.
ALTER TABLE "MicrosoftConnection"
ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "mailboxAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canReadMail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canReadMailFolders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mailboxCheckedAt" TIMESTAMP(3);

-- Bind incremental consent to the connection that requested it so a different
-- tenant or Microsoft user can never overwrite that connection's cache.
ALTER TABLE "MicrosoftAuthorizationSession"
ADD COLUMN "expectedConnectionId" TEXT,
ADD COLUMN "errorDescription" TEXT;

CREATE INDEX "MicrosoftAuthorizationSession_expectedConnectionId_idx"
ON "MicrosoftAuthorizationSession"("expectedConnectionId");
