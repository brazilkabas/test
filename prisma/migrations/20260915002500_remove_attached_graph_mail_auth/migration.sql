DROP TABLE IF EXISTS "MicrosoftGraphMailAuth";

ALTER TABLE "MicrosoftAuthorizationSession"
DROP COLUMN IF EXISTS "authorizationProfile";
