-- New mailbox authorization caches bind encryption to the connection, user,
-- client, and target resource. Existing version-1 rows remain unchanged and
-- continue to use their original encryption context.
ALTER TABLE "MicrosoftGraphMailAuth"
ALTER COLUMN "tokenCacheKeyVersion" SET DEFAULT 2;
