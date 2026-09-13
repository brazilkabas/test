CREATE TYPE "AccessCodePurpose" AS ENUM ('APPLICATION', 'DEPLOYMENT');

ALTER TABLE "AccessCode"
ADD COLUMN "purpose" "AccessCodePurpose" NOT NULL DEFAULT 'APPLICATION',
ADD COLUMN "deploymentId" TEXT;

ALTER TABLE "AccessCode"
ADD CONSTRAINT "AccessCode_deploymentId_fkey"
FOREIGN KEY ("deploymentId") REFERENCES "CloudflareDeployment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AccessCode_deploymentId_idx" ON "AccessCode"("deploymentId");
