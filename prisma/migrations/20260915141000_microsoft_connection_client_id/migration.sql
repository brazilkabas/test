-- Record which public client produced the encrypted MSAL cache. Existing
-- connections remain nullable because their historical client ID is unknown.
ALTER TABLE "MicrosoftConnection"
ADD COLUMN "clientId" TEXT;
