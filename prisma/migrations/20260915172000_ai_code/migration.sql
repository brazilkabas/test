CREATE TYPE "AiCodeJobStatus" AS ENUM (
  'INSPECTING_REPOSITORY',
  'GENERATING_CHANGES',
  'AWAITING_APPROVAL',
  'APPLYING_PATCH',
  'RUNNING_TESTS',
  'PUSHING',
  'READY',
  'MERGED',
  'FAILED',
  'REJECTED',
  'STALE',
  'LOCAL_SYNC_BLOCKED'
);

CREATE TABLE "AiCodeSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "providerBaseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
  "modelName" TEXT NOT NULL DEFAULT 'gpt-4.1',
  "encryptedApiKey" BYTEA,
  "apiKeyLastFour" TEXT,
  "githubOwner" TEXT,
  "githubRepository" TEXT,
  "baseBranch" TEXT NOT NULL DEFAULT 'main',
  "githubAppId" TEXT,
  "githubInstallationId" TEXT,
  "encryptedGithubAppPrivateKey" BYTEA,
  "encryptedGithubToken" BYTEA,
  "localAgentId" TEXT,
  "localAgentCallbackUrl" TEXT,
  "encryptedLocalAgentToken" BYTEA,
  "localAgentTokenLastFour" TEXT,
  "createPullRequestAutomatically" BOOLEAN NOT NULL DEFAULT true,
  "deployAfterMerge" BOOLEAN NOT NULL DEFAULT false,
  "lastProviderTestAt" TIMESTAMP(3),
  "lastProviderTestStatus" TEXT,
  "lastGithubTestAt" TIMESTAMP(3),
  "lastGithubTestStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiCodeSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiCodeJob" (
  "id" TEXT NOT NULL,
  "instruction" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'plan',
  "status" "AiCodeJobStatus" NOT NULL DEFAULT 'INSPECTING_REPOSITORY',
  "explanation" TEXT,
  "selectedFiles" TEXT[],
  "unifiedDiff" TEXT,
  "warnings" TEXT[],
  "tests" TEXT[],
  "githubBaseSha" TEXT,
  "githubBranch" TEXT,
  "githubCommitSha" TEXT,
  "previousCommitSha" TEXT,
  "pullRequestUrl" TEXT,
  "pullRequestNumber" INTEGER,
  "localSyncStatus" JSONB,
  "error" TEXT,
  "deployAfterTests" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiCodeJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiCodeRevision" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "commitSha" TEXT NOT NULL,
  "diff" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiCodeRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCodeJob_status_createdAt_idx" ON "AiCodeJob"("status", "createdAt");
CREATE INDEX "AiCodeJob_createdById_createdAt_idx" ON "AiCodeJob"("createdById", "createdAt");

ALTER TABLE "AiCodeJob"
ADD CONSTRAINT "AiCodeJob_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiCodeRevision"
ADD CONSTRAINT "AiCodeRevision_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "AiCodeJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
