CREATE TABLE "OutlookLaunchRequest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "webLink" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutlookLaunchRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutlookLaunchRequest_tokenHash_key"
ON "OutlookLaunchRequest"("tokenHash");

CREATE INDEX "OutlookLaunchRequest_expiresAt_usedAt_idx"
ON "OutlookLaunchRequest"("expiresAt", "usedAt");
