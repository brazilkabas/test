export const MICROSOFT_GRAPH_RESOURCE = "Microsoft Graph";
export const MICROSOFT_GRAPH_RESOURCE_ID = "00000003-0000-0000-c000-000000000000";
export const MICROSOFT_GRAPH_SCOPE_ROOT = "https://graph.microsoft.com/";
export const MICROSOFT_GRAPH_API_ROOT = "https://graph.microsoft.com/v1.0";

export function isMicrosoftGraphResource(resourceAppId: string) {
  const normalized = resourceAppId.trim().toLowerCase().replace(/\/+$/, "");
  return normalized === MICROSOFT_GRAPH_RESOURCE_ID
    || normalized === "https://graph.microsoft.com";
}

export function configuredResourceScopes(resourceAppId: string, resourceScope: string) {
  const explicit = resourceScope
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (explicit.length) {
    return explicit.map((scope) => (
      isMicrosoftGraphResource(resourceAppId)
      && !scope.includes("://")
      && !["openid", "profile", "email", "offline_access"].includes(scope.toLowerCase())
        ? `${MICROSOFT_GRAPH_SCOPE_ROOT}${scope}`
        : scope
    ));
  }
  return [`${resourceAppId.replace(/\/+$/, "")}/.default`];
}

export function tokenAudienceMatchesResource(audience: string | null, resourceAppId: string) {
  if (!audience) return false;
  const normalizedAudience = audience.toLowerCase().replace(/\/+$/, "");
  const normalizedResource = resourceAppId.toLowerCase().replace(/\/+$/, "");
  if (normalizedAudience === normalizedResource) return true;
  return isMicrosoftGraphResource(resourceAppId)
    && (
      normalizedAudience === MICROSOFT_GRAPH_RESOURCE_ID
      || normalizedAudience === "https://graph.microsoft.com"
    );
}
