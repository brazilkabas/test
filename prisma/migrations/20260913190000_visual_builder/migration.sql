CREATE TYPE "CloudflareAuthType" AS ENUM ('API_TOKEN', 'GLOBAL_API_KEY');

ALTER TABLE "MicrosoftAuthorizationSession"
ADD COLUMN "pageProjectId" TEXT;

ALTER TABLE "HtmlProject"
ADD COLUMN "templateId" TEXT NOT NULL DEFAULT 'blank',
ADD COLUMN "settings" JSONB;

ALTER TABLE "HtmlProjectVersion"
ADD COLUMN "document" JSONB,
ADD COLUMN "state" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "editorId" TEXT;

CREATE TABLE "ProjectAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "kind" TEXT NOT NULL,
    "variant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CloudflareConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "authType" "CloudflareAuthType" NOT NULL,
    "email" TEXT,
    "encryptedCredential" BYTEA NOT NULL,
    "accountId" TEXT,
    "accountName" TEXT,
    "zoneId" TEXT,
    "zoneName" TEXT,
    "baseDomain" TEXT,
    "credentialKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudflareConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectAsset_projectId_kind_idx" ON "ProjectAsset"("projectId", "kind");
CREATE UNIQUE INDEX "ProjectAsset_projectId_sha256_key" ON "ProjectAsset"("projectId", "sha256");

ALTER TABLE "MicrosoftAuthorizationSession"
ADD CONSTRAINT "MicrosoftAuthorizationSession_pageProjectId_fkey"
FOREIGN KEY ("pageProjectId") REFERENCES "HtmlProject"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectAsset"
ADD CONSTRAINT "ProjectAsset_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "HtmlProject"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
