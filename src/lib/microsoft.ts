import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";
import { randomBytes } from "node:crypto";

import { AuthorizationStatus } from "@/generated/prisma/client";
import { config } from "@/lib/config";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { MICROSOFT_ORGANIZATIONS_AUTHORITY } from "@/lib/microsoft-authority";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE_ROOT = "https://graph.microsoft.com/";
const GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000";
const NON_GRAPH_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);
const DEVICE_IDENTITY_SCOPES = new Set(["offline_access"]);
const NORMAL_GRAPH_SCOPES = new Map([
  ["user.read", "User.Read"],
  ["mail.readwrite", "Mail.ReadWrite"],
  ["mail.send", "Mail.Send"],
  ["mailboxsettings.readwrite", "MailboxSettings.ReadWrite"],
]);
const NORMAL_MAILBOX_SCOPES = [
  "offline_access",
  `${GRAPH_SCOPE_ROOT}User.Read`,
  `${GRAPH_SCOPE_ROOT}Mail.ReadWrite`,
  `${GRAPH_SCOPE_ROOT}Mail.Send`,
];
const MAILBOX_SETTINGS_SCOPES = [
  "offline_access",
  `${GRAPH_SCOPE_ROOT}User.Read`,
  `${GRAPH_SCOPE_ROOT}MailboxSettings.ReadWrite`,
];
const pending = new Map<string, Promise<void>>();
const loggedGraphAudience = new Set<string>();

export type MicrosoftAuthorizationPurpose = "mailbox" | "mailbox-settings";

type DeviceChallenge = {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
};

export async function startDeviceAuthorization(
  pageProjectId?: string,
  purpose: MicrosoftAuthorizationPurpose = "mailbox",
): Promise<{ publicId: string; statusToken: string }> {
  const statusToken = randomBytes(32).toString("base64url");
  const scopes = microsoftAuthorizationScopes(purpose);
  const customizedPage = purpose === "mailbox" && pageProjectId
    ? await db.htmlProject.findFirst({ where: { id: pageProjectId, status: { not: "ARCHIVED" } }, select: { id: true } })
    : purpose === "mailbox"
      ? await db.htmlProject.findFirst({ where: { templateId: { startsWith: "microsoft-" }, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, select: { id: true } })
      : null;
  const session = await db.microsoftAuthorizationSession.create({
    data: {
      publicId: crypto.randomUUID(),
      statusTokenHash: sha256(statusToken),
      requestedScopes: scopes,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      pageProjectId: customizedPage?.id,
    },
  });
  if (config().NODE_ENV === "development") {
    console.info("[microsoft] authorization started", {
      authority: MICROSOFT_ORGANIZATIONS_AUTHORITY,
      requestedScopes: scopes.map(scopeName),
    });
  }

  let challengeReady!: (challenge: DeviceChallenge) => void;
  let challengeFailed!: (error: unknown) => void;
  const challenge = new Promise<DeviceChallenge>((resolve, reject) => {
    challengeReady = resolve;
    challengeFailed = reject;
  });

  const pca = createClient();
  const authorization = pca
    .acquireTokenByDeviceCode({
      scopes,
      deviceCodeCallback: (response) => {
        if (!isOfficialMicrosoftVerificationUrl(response.verificationUri)) {
          const error = new Error("Microsoft returned an unapproved verification URL");
          challengeFailed(error);
          throw error;
        }
        challengeReady({
          userCode: response.userCode,
          verificationUri: response.verificationUri,
          expiresIn: response.expiresIn,
          interval: response.interval,
          message: response.message,
        });
      },
    })
    .then(async (result) => {
      if (!result) throw new Error("Microsoft returned no authentication result");
      await completeAuthorization(session.id, pca, result);
    })
    .catch(async (error: unknown) => {
      challengeFailed(error);
      const errorCode = microsoftErrorCode(error);
      if (config().NODE_ENV === "development") {
        console.warn("[microsoft] authorization failed", {
          authority: MICROSOFT_ORGANIZATIONS_AUTHORITY,
          requestedScopes: scopes.map(scopeName),
          errorCode,
        });
      }
      await db.microsoftAuthorizationSession.updateMany({
        where: { id: session.id, status: AuthorizationStatus.PENDING },
        data: {
          status: classifyDeviceError(error),
          errorCode,
        },
      });
    })
    .finally(() => pending.delete(session.id));

  pending.set(session.id, authorization);
  const issued = await challenge;
  await db.microsoftAuthorizationSession.update({
    where: { id: session.id },
    data: {
      userCode: issued.userCode,
      verificationUri: issued.verificationUri,
      message: issued.message,
      intervalSeconds: issued.interval,
      expiresAt: new Date(Date.now() + issued.expiresIn * 1000),
    },
  });
  return { publicId: session.publicId, statusToken };
}

export function isOfficialMicrosoftVerificationUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      hostname === "microsoft.com"
      || hostname.endsWith(".microsoft.com")
      || hostname === "microsoftonline.com"
      || hostname.endsWith(".microsoftonline.com")
      || hostname === "aka.ms"
    );
  } catch {
    return false;
  }
}

export async function authorizationStatus(publicId: string, statusToken: string) {
  const session = await db.microsoftAuthorizationSession.findUnique({
    where: { publicId },
    select: {
      statusTokenHash: true,
      requestedScopes: true,
      publicId: true,
      userCode: true,
      verificationUri: true,
      message: true,
      status: true,
      expiresAt: true,
      connectionId: true,
      errorCode: true,
      pageProject: { select: { id: true, versions: { orderBy: { version: "desc" }, take: 1, select: { document: true } } } },
    },
  });
  if (!session) return null;
  const { statusTokenHash, ...safeSession } = session;
  if (!statusTokenHash || sha256(statusToken) !== statusTokenHash) return null;
  if (safeSession.status === AuthorizationStatus.PENDING && safeSession.expiresAt <= new Date()) {
    return db.microsoftAuthorizationSession.update({
      where: { publicId },
      data: { status: AuthorizationStatus.EXPIRED },
      select: {
        publicId: true,
        requestedScopes: true,
        userCode: true,
        verificationUri: true,
        message: true,
        status: true,
        expiresAt: true,
        connectionId: true,
        errorCode: true,
        pageProject: { select: { id: true, versions: { orderBy: { version: "desc" }, take: 1, select: { document: true } } } },
      },
    });
  }
  return safeSession;
}

async function completeAuthorization(
  authorizationSessionId: string,
  pca: PublicClientApplication,
  result: AuthenticationResult,
) {
  const pendingSession = await db.microsoftAuthorizationSession.findUnique({ where: { id: authorizationSessionId }, select: { status: true, expiresAt: true } });
  if (!pendingSession || pendingSession.status !== AuthorizationStatus.PENDING || pendingSession.expiresAt <= new Date()) return;
  const profile = await graphFetchWithToken<{
    id: string;
    displayName?: string;
    userPrincipalName?: string;
    mail?: string;
  }>(result.accessToken, "/me?$select=id,displayName,userPrincipalName,mail");
  const stillPending = await db.microsoftAuthorizationSession.findUnique({ where: { id: authorizationSessionId }, select: { status: true, expiresAt: true } });
  if (!stillPending || stillPending.status !== AuthorizationStatus.PENDING || stillPending.expiresAt <= new Date()) return;
  const encryptedTokenCache = encrypt(
    pca.getTokenCache().serialize(),
    `msal:${result.tenantId}:${profile.id}`,
  );
  const existingConnection = await db.microsoftConnection.findUnique({
    where: { tenantId_microsoftUserId: { tenantId: result.tenantId, microsoftUserId: profile.id } },
    select: { grantedScopes: true },
  });
  const grantedScopes = [...new Set([...(existingConnection?.grantedScopes ?? []), ...result.scopes])];

  const connection = await db.microsoftConnection.upsert({
    where: {
      tenantId_microsoftUserId: {
        tenantId: result.tenantId,
        microsoftUserId: profile.id,
      },
    },
    create: {
      tenantId: result.tenantId,
      microsoftUserId: profile.id,
      displayName: profile.displayName,
      userPrincipalName: profile.userPrincipalName,
      email: profile.mail,
      encryptedTokenCache,
      grantedScopes,
      lastSuccessfulGraphAt: new Date(),
      authorizationStatus: AuthorizationStatus.CONNECTED,
    },
    update: {
      displayName: profile.displayName,
      userPrincipalName: profile.userPrincipalName,
      email: profile.mail,
      encryptedTokenCache,
      grantedScopes,
      connectedAt: new Date(),
      lastSuccessfulGraphAt: new Date(),
      authorizationStatus: AuthorizationStatus.CONNECTED,
    },
  });

  await db.microsoftAuthorizationSession.update({
    where: { id: authorizationSessionId },
    data: { status: AuthorizationStatus.CONNECTED, connectionId: connection.id },
  });
  if (config().NODE_ENV === "development") {
    console.info("[microsoft] authorization completed", {
      authority: MICROSOFT_ORGANIZATIONS_AUTHORITY,
      requestedScopes: result.scopes.map(scopeName),
      tenantId: result.tenantId,
    });
  }
  await db.auditEvent.create({
    data: {
      connectionId: connection.id,
      action: "microsoft.connection.created",
      targetType: "MicrosoftConnection",
      targetId: connection.id,
      requestId: crypto.randomUUID(),
      result: "SUCCESS",
      metadata: { tenantId: result.tenantId, microsoftUserId: profile.id },
    },
  });
}

export async function graphFetch<T>(
  connectionId: string,
  pathOrNextLink: string,
  init: RequestInit = {},
): Promise<T> {
  const { token } = await acquireGraphToken(connectionId);
  try {
    const result = await graphFetchWithToken<T>(token, pathOrNextLink, init);
    await db.microsoftConnection.update({
      where: { id: connectionId },
      data: { lastSuccessfulGraphAt: new Date() },
    });
    return result;
  } catch (error) {
    if (error instanceof GraphError && (error.status === 401 || error.code === "InvalidAuthenticationToken")) {
      await db.microsoftConnection.update({
        where: { id: connectionId },
        data: { authorizationStatus: AuthorizationStatus.REAUTHENTICATION_REQUIRED },
      });
    }
    throw error;
  }
}

async function acquireGraphToken(connectionId: string) {
  const connection = await db.microsoftConnection.findUniqueOrThrow({ where: { id: connectionId } });
  let legacyOutlookTokenCached = false;
  const cachePlugin: ICachePlugin = {
    beforeCacheAccess: async (context: TokenCacheContext) => {
      const serialized = decrypt(connection.encryptedTokenCache, `msal:${connection.tenantId}:${connection.microsoftUserId}`);
      legacyOutlookTokenCached = hasLegacyOutlookCacheTarget(serialized);
      context.tokenCache.deserialize(serialized);
    },
    afterCacheAccess: async (context: TokenCacheContext) => {
      if (!context.cacheHasChanged) return;
      await db.microsoftConnection.update({
        where: { id: connectionId },
        data: {
          encryptedTokenCache: encrypt(
            context.tokenCache.serialize(),
            `msal:${connection.tenantId}:${connection.microsoftUserId}`,
          ),
        },
      });
    },
  };
  const pca = createClient(cachePlugin);
  const accounts = await pca.getTokenCache().getAllAccounts();
  const account = accounts.find((item: AccountInfo) => item.localAccountId === connection.microsoftUserId);
  if (!account) {
    await markReauthentication(connectionId);
    throw new MicrosoftReauthenticationRequired();
  }
  try {
    const scopes = graphDelegatedScopes(connection.grantedScopes);
    let result = await pca.acquireTokenSilent({ account, scopes, forceRefresh: legacyOutlookTokenCached });
    if (!isMicrosoftGraphToken(result.accessToken)) {
      result = await pca.acquireTokenSilent({ account, scopes, forceRefresh: true });
    }
    assertMicrosoftGraphToken(result.accessToken);
    if (config().NODE_ENV === "development" && !loggedGraphAudience.has(connectionId)) {
      loggedGraphAudience.add(connectionId);
      console.info("[microsoft] token target/resource = Microsoft Graph", { connectionId, audience: tokenAudience(result.accessToken) });
    }
    return { token: result.accessToken, connection };
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await markReauthentication(connectionId);
      throw new MicrosoftReauthenticationRequired();
    }
    throw error;
  }
}

export function graphDelegatedScopes(scopes: string[]) {
  const graphScopes = scopes.flatMap((scope) => {
    const value = scope.trim();
    if (!value || NON_GRAPH_SCOPES.has(value.toLowerCase())) return [];
    const name = value.toLowerCase().startsWith(GRAPH_SCOPE_ROOT)
      ? value.slice(GRAPH_SCOPE_ROOT.length)
      : value;
    const allowed = NORMAL_GRAPH_SCOPES.get(name.toLowerCase());
    return allowed ? [`${GRAPH_SCOPE_ROOT}${allowed}`] : [];
  });
  return [...new Set(graphScopes.length ? graphScopes : [`${GRAPH_SCOPE_ROOT}User.Read`])];
}

export function deviceAuthorizationScopes(scopes: string[]) {
  const identity = scopes
    .map((scope) => scope.trim().toLowerCase())
    .filter((scope) => DEVICE_IDENTITY_SCOPES.has(scope));
  return [...new Set([...identity, ...graphDelegatedScopes(scopes)])];
}

export function microsoftAuthorizationScopes(purpose: MicrosoftAuthorizationPurpose) {
  return purpose === "mailbox-settings"
    ? [...MAILBOX_SETTINGS_SCOPES]
    : [...NORMAL_MAILBOX_SCOPES];
}

function scopeName(scope: string) {
  return scope.toLowerCase().startsWith(GRAPH_SCOPE_ROOT)
    ? scope.slice(GRAPH_SCOPE_ROOT.length)
    : scope;
}

function hasLegacyOutlookCacheTarget(serialized: string) {
  try {
    const cache = JSON.parse(serialized) as { AccessToken?: Record<string, { target?: string }> };
    return Object.values(cache.AccessToken ?? {}).some((entry) => /https:\/\/outlook\.office(?:365)?\.com/i.test(entry.target ?? ""));
  } catch {
    return false;
  }
}

function tokenAudience(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as { aud?: unknown };
    return typeof payload.aud === "string" ? payload.aud : null;
  } catch {
    return null;
  }
}

export function isMicrosoftGraphToken(accessToken: string) {
  const audience = tokenAudience(accessToken);
  return audience === GRAPH_APP_ID || audience === "https://graph.microsoft.com" || audience === "https://graph.microsoft.com/";
}

function assertMicrosoftGraphToken(accessToken: string) {
  if (!isMicrosoftGraphToken(accessToken)) {
    throw new GraphError(401, "InvalidTokenAudience", "Internal webmail requires a Microsoft Graph access token");
  }
}

async function graphFetchWithToken<T>(
  accessToken: string,
  pathOrNextLink: string,
  init: RequestInit = {},
): Promise<T> {
  const url = graphUrl(pathOrNextLink);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...init.headers,
      },
    });
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
    const body = await response.json().catch(() => ({}));
    const code = body?.error?.code as string | undefined;
    const message = body?.error?.message ?? "Microsoft Graph request failed";
    if (config().NODE_ENV === "development") {
      const requestUrl = new URL(url);
      console.warn("[microsoft] Graph request failed", {
        target: "Microsoft Graph",
        hostname: requestUrl.hostname,
        path: requestUrl.pathname,
        status: response.status,
        code,
      });
    }
    if (/AADSTS500014/i.test(message) && /outlook\.office(?:365)?\.com/i.test(message)) {
      throw new GraphError(
        503,
        "ExchangeOnlineUnavailable",
        "Microsoft Graph authentication succeeded, but Exchange Online is disabled or unavailable for this tenant. Verify its Microsoft 365 subscription, Exchange Online license, and Exchange Online enterprise application.",
      );
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) =>
        setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 2 ** attempt * 500),
      );
      continue;
    }
    throw new GraphError(response.status, code, message);
  }
  throw new GraphError(503, "RetriesExhausted", "Microsoft Graph retries exhausted");
}

function graphUrl(pathOrNextLink: string): string {
  const url = pathOrNextLink.startsWith("http")
    ? new URL(pathOrNextLink)
    : new URL(pathOrNextLink.replace(/^\//, ""), `${GRAPH_ROOT}/`);
  if (url.protocol !== "https:" || url.hostname !== "graph.microsoft.com") {
    throw new Error("Rejected non-Microsoft Graph URL");
  }
  return url.toString();
}

function createClient(cachePlugin?: ICachePlugin) {
  return new PublicClientApplication({
    auth: {
      clientId: config().MICROSOFT_CLIENT_ID,
      authority: MICROSOFT_ORGANIZATIONS_AUTHORITY,
    },
    cache: cachePlugin ? { cachePlugin } : undefined,
    system: { loggerOptions: { piiLoggingEnabled: false } },
  });
}

async function markReauthentication(connectionId: string) {
  await db.microsoftConnection.update({
    where: { id: connectionId },
    data: { authorizationStatus: AuthorizationStatus.REAUTHENTICATION_REQUIRED },
  });
}

function microsoftErrorCode(error: unknown): string {
  if (typeof error !== "object" || !error) return "device_authorization_failed";
  const message = "errorMessage" in error ? String(error.errorMessage) : "message" in error ? String(error.message) : "";
  const aadCode = message.match(/\bAADSTS(?:90094|90095|900941)\b/i)?.[0];
  if (aadCode) return aadCode.toUpperCase();
  return "errorCode" in error ? String(error.errorCode) : "device_authorization_failed";
}

function classifyDeviceError(error: unknown): AuthorizationStatus {
  return microsoftErrorCode(error).includes("expired")
    ? AuthorizationStatus.EXPIRED
    : AuthorizationStatus.FAILED;
}

export class GraphError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

export class MicrosoftReauthenticationRequired extends Error {
  constructor() {
    super("Microsoft reauthentication is required");
  }
}
