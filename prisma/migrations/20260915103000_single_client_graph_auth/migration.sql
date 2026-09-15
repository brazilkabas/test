-- Retire pending secondary-mail flows without deleting existing accounts or caches.
UPDATE "MicrosoftAuthorizationSession"
SET
    "status" = 'CANCELLED',
    "errorCode" = 'REPLACED_BY_SINGLE_CLIENT_GRAPH_AUTH',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "authorizationProfile" = 'GRAPH_MAIL'
  AND "status" = 'PENDING';

-- Historical attached-mail records are preserved for audit and rollback purposes,
-- but new Mail operations use the primary MicrosoftConnection cache.
UPDATE "MicrosoftGraphMailAuth"
SET
    "authorizationStatus" = 'REAUTHENTICATION_REQUIRED',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "authorizationStatus" = 'CONNECTED';
