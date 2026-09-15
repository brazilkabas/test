-- Pending challenges issued for legacy non-Graph resources cannot complete under
-- the unified app-owned Graph configuration. Preserve their connections and make
-- users begin a fresh reauthorization instead.
UPDATE "MicrosoftAuthorizationSession"
SET
    "status" = 'CANCELLED',
    "errorCode" = 'LEGACY_RESOURCE_REAUTHORIZATION_REQUIRED',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING'
  AND "resourceAppId" <> '00000003-0000-0000-c000-000000000000';
