CREATE TABLE "BrandAsset" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Company Logos',
  "variant" TEXT NOT NULL DEFAULT 'Full Color',
  "tags" TEXT[],
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandAsset_sha256_key" ON "BrandAsset"("sha256");
CREATE INDEX "BrandAsset_archivedAt_category_idx" ON "BrandAsset"("archivedAt", "category");
CREATE INDEX "BrandAsset_favorite_lastUsedAt_idx" ON "BrandAsset"("favorite", "lastUsedAt");
ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
